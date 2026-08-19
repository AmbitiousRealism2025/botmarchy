import {
  fetchOrgoDesktopSession,
  normalizeOrgoComputerId,
  OrgoDesktopError,
  type OrgoDesktopErrorCode,
  serializeOrgoDesktopError
} from './orgo-desktop'
import { BOT_TEMPLATE_REF, isBotProduct } from './product'

export const ORGO_API_BASE = 'https://www.orgo.ai/api'
export const ORGO_MCP_SERVER_NAME = 'orgo'
export const ORGO_MCP_TRUST = 'untrusted' as const
export const ORGO_MCP_COMMAND = 'npx'
export const ORGO_MCP_ARGS = ['-y', 'orgo-mcp-server']
export const HERMES_ORGO_INSTALL_SH = 'https://hermes-agent.nousresearch.com/install.sh'
export const HERMES_ORGO_PROBE_COMMAND =
  'command -v hermes >/dev/null 2>&1 && hermes --version'
export const HERMES_ORGO_INSTALL_COMMAND = `curl -fsSL ${HERMES_ORGO_INSTALL_SH} | bash`
export const TAILSCALE_INSTALL_COMMAND =
  'command -v tailscale >/dev/null 2>&1 || curl -fsSL https://tailscale.com/install.sh | sh'
export const TAILSCALE_START_COMMAND =
  'systemctl enable --now tailscaled >/dev/null 2>&1 || service tailscaled start >/dev/null 2>&1 || true'

const COMPUTER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface OrgoWorkspaceSummary {
  id: string
  name: string
  status?: string
}

export interface OrgoComputerSummary {
  id: string
  name: string
  status: string
  workspaceId?: string
  templateRef?: string
}

export interface OrgoMcpEntry {
  command: string
  args: string[]
  env: Record<string, string>
  trust: typeof ORGO_MCP_TRUST
}

export interface OrgoDoctorResult {
  ok: boolean
  apiAuth: boolean
  computerStatus: string
  vncAvailable: boolean
  mcpReady: boolean
  hermesInstalled: boolean
  message: string
}

export interface OrgoBashResult {
  output: string
  success: boolean
  exitCode: number | null
}

export interface TailscaleNodeStatus {
  installed: boolean
  connected: boolean
  dnsName: string
  backendState: string
  authUrl: string
}

export interface OrgoBrokerState {
  apiKey: string
  computerId: string
  workspaceId: string
}

function unwrapList(value: unknown, keys: string[]): unknown[] {
  if (Array.isArray(value)) {
    return value
  }

  if (!value || typeof value !== 'object') {
    return []
  }

  const record = value as Record<string, unknown>

  for (const key of keys) {
    const nested = record[key]

    if (Array.isArray(nested)) {
      return nested
    }
  }

  return []
}

function unwrapRecord(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const record = value as Record<string, unknown>

  for (const key of keys) {
    const nested = record[key]

    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      return nested as Record<string, unknown>
    }
  }

  return record
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new OrgoDesktopError('invalid-response', 'Orgo returned an unreadable response.')
  }
}

async function requireOk(response: Response): Promise<void> {
  if (response.ok) {
    return
  }

  if (response.status === 401 || response.status === 403) {
    throw new OrgoDesktopError('auth-failed', 'The Orgo API key was rejected.')
  }

  if (response.status === 404) {
    throw new OrgoDesktopError('computer-not-found', 'That Orgo computer was not found.')
  }

  throw new OrgoDesktopError('unavailable', `Orgo returned HTTP ${response.status}.`)
}

export function orgoAuthHeaders(apiKey: string): Record<string, string> {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${apiKey.trim()}`,
    'Content-Type': 'application/json'
  }
}

export function orgoMcpEntry(computerId: string): OrgoMcpEntry {
  const id = normalizeOrgoComputerId(computerId)

  return {
    command: ORGO_MCP_COMMAND,
    args: [...ORGO_MCP_ARGS],
    env: {
      ORGO_API_KEY: '${env:ORGO_API_KEY}',
      ORGO_DEFAULT_COMPUTER_ID: id,
      ORGO_TOOLSETS: 'core,screen,shell,files'
    },
    trust: ORGO_MCP_TRUST
  }
}

export function orgoProcessEnv(state: Pick<OrgoBrokerState, 'apiKey' | 'computerId'>): Record<string, string> {
  const apiKey = String(state.apiKey || '').trim()
  const computerId = String(state.computerId || '').trim()
  const env: Record<string, string> = {}

  if (apiKey) {
    env.ORGO_API_KEY = apiKey
  }

  if (COMPUTER_ID_RE.test(computerId)) {
    env.ORGO_DEFAULT_COMPUTER_ID = computerId
  }

  return env
}

async function orgoRequest(
  apiKey: string,
  path: string,
  init: RequestInit = {},
  fetchImpl: typeof fetch = fetch
): Promise<unknown> {
  let response: Response

  try {
    response = await fetchImpl(`${ORGO_API_BASE}${path}`, {
      ...init,
      headers: { ...orgoAuthHeaders(apiKey), ...(init.headers || {}) }
    })
  } catch {
    throw new OrgoDesktopError('network', 'Could not reach the Orgo API.')
  }

  await requireOk(response)

  if (response.status === 204) {
    return null
  }

  return parseJson(response)
}

function asWorkspace(value: unknown): OrgoWorkspaceSummary | null {
  const record = unwrapRecord(value, ['workspace', 'data', 'project'])
  const id = String(record.id ?? record.workspace_id ?? record.project_id ?? '').trim()
  const name = String(record.name ?? record.title ?? id).trim()

  if (!id) {
    return null
  }

  return { id, name: name || id, status: String(record.status ?? '').trim() || undefined }
}

function asComputer(value: unknown): OrgoComputerSummary | null {
  const record = unwrapRecord(value, ['computer', 'data'])
  const id = String(record.id ?? record.computer_id ?? '').trim()
  const name = String(record.name ?? id).trim()
  const status = String(record.status ?? 'unknown').trim() || 'unknown'

  if (!COMPUTER_ID_RE.test(id)) {
    return null
  }

  return {
    id,
    name: name || id,
    status,
    workspaceId: String(record.workspace_id ?? record.project_id ?? '').trim() || undefined,
    templateRef: String(record.template_ref ?? record.templateRef ?? '').trim() || undefined
  }
}

export function isHermesAgentTemplate(ref: string | undefined): boolean {
  return /^system\/hermes-agent@/i.test(String(ref || '').trim())
}

export function pickSharedHermesComputer(
  computers: OrgoComputerSummary[],
  exactTemplateRef?: string
): OrgoComputerSummary | undefined {
  if (exactTemplateRef) {
    return computers.find(computer => computer.templateRef === exactTemplateRef)
  }

  return computers.find(computer => isHermesAgentTemplate(computer.templateRef)) || computers[0]
}

export async function listOrgoWorkspaces(apiKey: string, fetchImpl: typeof fetch = fetch): Promise<OrgoWorkspaceSummary[]> {
  const payload = await orgoRequest(apiKey, '/workspaces', {}, fetchImpl)

  return unwrapList(payload, ['workspaces', 'data', 'projects']).map(asWorkspace).filter(Boolean) as OrgoWorkspaceSummary[]
}

export async function createOrgoWorkspace(
  apiKey: string,
  name: string,
  fetchImpl: typeof fetch = fetch
): Promise<OrgoWorkspaceSummary> {
  const payload = await orgoRequest(apiKey, '/workspaces', {
    method: 'POST',
    body: JSON.stringify({ name: name.trim() || 'Hermes Bots' })
  }, fetchImpl)

  const workspace = asWorkspace(payload)

  if (!workspace) {
    throw new OrgoDesktopError('invalid-response', 'Orgo did not return a workspace.')
  }

  return workspace
}

export async function listOrgoComputers(
  apiKey: string,
  workspaceId?: string,
  fetchImpl: typeof fetch = fetch
): Promise<OrgoComputerSummary[]> {
  const query = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : ''
  const payload = await orgoRequest(apiKey, `/computers${query}`, {}, fetchImpl)

  return unwrapList(payload, ['computers', 'data', 'desktops']).map(asComputer).filter(Boolean) as OrgoComputerSummary[]
}

export async function resolveHermesAgentTemplateRef(
  apiKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  if (isBotProduct()) {
    return BOT_TEMPLATE_REF
  }

  try {
    const payload = await orgoRequest(apiKey, '/templates/global', {}, fetchImpl)

    const refs = unwrapList(payload, ['templates', 'data'])
      .map(item => {
        if (typeof item === 'string') {
          return item
        }

        const record = unwrapRecord(item, ['template'])

        return String(record.ref ?? '').trim()
      })
      .filter(isHermesAgentTemplate)
      .sort()

    return refs.at(-1) || BOT_TEMPLATE_REF
  } catch {
    return BOT_TEMPLATE_REF
  }
}

export async function createOrgoComputer(
  apiKey: string,
  input: { workspaceId: string; name?: string; templateRef?: string },
  fetchImpl: typeof fetch = fetch
): Promise<OrgoComputerSummary> {
  const payload = await orgoRequest(apiKey, '/computers', {
    method: 'POST',
    body: JSON.stringify({
      workspace_id: input.workspaceId,
      name: input.name?.trim() || 'Shared computer',
      template_ref: input.templateRef || BOT_TEMPLATE_REF,
      os: 'linux',
      ram: 8,
      cpu: 4
    })
  }, fetchImpl)

  const computer = asComputer(payload)

  if (!computer) {
    throw new OrgoDesktopError('invalid-response', 'Orgo did not return a computer.')
  }

  return computer
}

export async function getOrgoComputer(
  apiKey: string,
  computerId: string,
  fetchImpl: typeof fetch = fetch
): Promise<OrgoComputerSummary> {
  const payload = await orgoRequest(apiKey, `/computers/${encodeURIComponent(normalizeOrgoComputerId(computerId))}`, {}, fetchImpl)
  const computer = asComputer(payload)

  if (!computer) {
    throw new OrgoDesktopError('invalid-response', 'Orgo did not return computer details.')
  }

  return computer
}

export async function ensureOrgoComputerRunning(
  apiKey: string,
  computerId: string,
  fetchImpl: typeof fetch = fetch,
  sleep: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))
): Promise<OrgoComputerSummary> {
  const id = normalizeOrgoComputerId(computerId)
  let computer = await getOrgoComputer(apiKey, id, fetchImpl)

  if (computer.status === 'running') {
    return computer
  }

  await orgoRequest(apiKey, `/computers/${encodeURIComponent(id)}/start`, { method: 'POST' }, fetchImpl)

  for (let attempt = 0; attempt < 20; attempt += 1) {
    computer = await getOrgoComputer(apiKey, id, fetchImpl)

    if (computer.status === 'running') {
      return computer
    }

    if (computer.status === 'error') {
      throw new OrgoDesktopError('unavailable', 'The Orgo computer entered an error state.')
    }

    await sleep(1_500)
  }

  throw new OrgoDesktopError('unavailable', 'Timed out waiting for the Orgo computer to start.')
}

export function parseOrgoBashResult(value: unknown): OrgoBashResult {
  const record = unwrapRecord(value, ['data', 'result'])
  const exitCode = typeof record.exit_code === 'number' ? record.exit_code : null
  const output = String(record.output ?? record.stdout ?? '')
  const accepted = record.success !== false

  return {
    output,
    exitCode,
    success: accepted && (exitCode === null || exitCode === 0)
  }
}

export async function runOrgoBash(
  apiKey: string,
  computerId: string,
  command: string,
  fetchImpl: typeof fetch = fetch
): Promise<OrgoBashResult> {
  const payload = await orgoRequest(
    apiKey,
    `/computers/${encodeURIComponent(normalizeOrgoComputerId(computerId))}/bash`,
    { method: 'POST', body: JSON.stringify({ command }) },
    fetchImpl
  )

  return parseOrgoBashResult(payload)
}

export function extractTailscaleAuthUrl(output: string): string {
  return String(output || '').match(/https:\/\/login\.tailscale\.com\/a\/[A-Za-z0-9_-]+/)?.[0] || ''
}

export function parseTailscaleStatus(output: string): TailscaleNodeStatus {
  const text = String(output || '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')

  if (start === -1 || end < start) {
    return {
      installed: Boolean(text),
      connected: false,
      dnsName: '',
      backendState: '',
      authUrl: extractTailscaleAuthUrl(text)
    }
  }

  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      BackendState?: string
      Self?: { DNSName?: string; Online?: boolean }
      AuthURL?: string
    }

    const backendState = String(parsed.BackendState || '')
    const dnsName = String(parsed.Self?.DNSName || '').replace(/\.$/, '')

    return {
      installed: true,
      connected: backendState === 'Running' && parsed.Self?.Online !== false && Boolean(dnsName),
      dnsName,
      backendState,
      authUrl: String(parsed.AuthURL || '') || extractTailscaleAuthUrl(text)
    }
  } catch {
    return {
      installed: true,
      connected: false,
      dnsName: '',
      backendState: 'InvalidStatus',
      authUrl: extractTailscaleAuthUrl(text)
    }
  }
}

export function tailscaleHostnameForComputer(computerId: string): string {
  return `hermes-bots-${normalizeOrgoComputerId(computerId).slice(0, 8)}`
}

export async function getOrgoTailscaleStatus(
  apiKey: string,
  computerId: string,
  fetchImpl: typeof fetch = fetch
): Promise<TailscaleNodeStatus> {
  const result = await runOrgoBash(apiKey, computerId, 'tailscale status --json 2>/dev/null || true', fetchImpl)

  return parseTailscaleStatus(result.output)
}

/** Join the Orgo VM to the user's tailnet and enable Tailscale SSH. The API key
 * remains in Electron; the returned auth URL carries only Tailscale's one-time
 * node authorization challenge. */
export async function beginOrgoTailscaleSetup(
  apiKey: string,
  computerId: string,
  fetchImpl: typeof fetch = fetch
): Promise<TailscaleNodeStatus> {
  await ensureOrgoComputerRunning(apiKey, computerId, fetchImpl)

  const install = await runOrgoBash(apiKey, computerId, TAILSCALE_INSTALL_COMMAND, fetchImpl)

  if (!install.success) {
    throw new OrgoDesktopError('unavailable', install.output.trim() || 'Could not install Tailscale on Orgo.')
  }

  await runOrgoBash(apiKey, computerId, TAILSCALE_START_COMMAND, fetchImpl)

  const current = await getOrgoTailscaleStatus(apiKey, computerId, fetchImpl)

  if (current.connected) {
    await runOrgoBash(apiKey, computerId, 'tailscale set --ssh=true >/dev/null 2>&1 || true', fetchImpl)

    return current
  }

  const hostname = tailscaleHostnameForComputer(computerId)

  const login = await runOrgoBash(
    apiKey,
    computerId,
    `tailscale up --ssh --hostname=${hostname} --timeout=10s 2>&1 || true`,
    fetchImpl
  )

  const next = await getOrgoTailscaleStatus(apiKey, computerId, fetchImpl)

  return {
    ...next,
    installed: true,
    authUrl: next.authUrl || extractTailscaleAuthUrl(login.output)
  }
}

/** Confirm Hermes is on the shared VM. Prefer Orgo's curated
 *  `system/hermes-agent@*` snapshot; only run install.sh on a blank computer. */
export async function ensureHermesInstalledOnOrgo(
  apiKey: string,
  computerId: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ installed: boolean; installedNow: boolean; output: string; fromTemplate: boolean }> {
  const computer = await ensureOrgoComputerRunning(apiKey, computerId, fetchImpl)
  const fromTemplate = isHermesAgentTemplate(computer.templateRef)
  const compatibleTemplate = isBotProduct() ? computer.templateRef === BOT_TEMPLATE_REF : fromTemplate
  const probe = await runOrgoBash(apiKey, computerId, HERMES_ORGO_PROBE_COMMAND, fetchImpl)

  if (probe.success) {
    return { installed: true, installedNow: false, fromTemplate, output: probe.output }
  }

  if (compatibleTemplate) {
    return {
      installed: true,
      installedNow: false,
      fromTemplate: true,
      output: probe.output || computer.templateRef || BOT_TEMPLATE_REF
    }
  }

  if (isBotProduct()) {
    throw new OrgoDesktopError(
      'unavailable',
      `Hermes Bots will not install an unpinned Hermes build. Use the ${BOT_TEMPLATE_REF} Orgo template or select a computer that already has Hermes installed.`
    )
  }

  const install = await runOrgoBash(apiKey, computerId, HERMES_ORGO_INSTALL_COMMAND, fetchImpl)

  if (!install.success) {
    throw new OrgoDesktopError(
      'unavailable',
      install.output.trim() || 'Could not install Hermes on the Orgo computer.'
    )
  }

  const verify = await runOrgoBash(apiKey, computerId, HERMES_ORGO_PROBE_COMMAND, fetchImpl)

  if (!verify.success) {
    throw new OrgoDesktopError('unavailable', 'Hermes installed on Orgo but `hermes` is not on PATH.')
  }

  return { installed: true, installedNow: true, fromTemplate: false, output: verify.output || install.output }
}

/** Place the Orgo credential in the remote Hermes secret environment, never
 * in a profile's MCP definition. Hermes resolves `${env:ORGO_API_KEY}` when it
 * starts the untrusted MCP server. */
export async function persistOrgoEnvironmentOnRemote(
  apiKey: string,
  computerId: string,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const id = normalizeOrgoComputerId(computerId)
  const encodedKey = Buffer.from(String(apiKey || '').trim(), 'utf8').toString('base64')

  const script = [
    'from pathlib import Path',
    'import base64, os',
    "path = Path('/root/.hermes/.env')",
    'path.parent.mkdir(parents=True, exist_ok=True)',
    "values = {'ORGO_API_KEY': base64.b64decode('" + encodedKey + "').decode(), 'ORGO_DEFAULT_COMPUTER_ID': '" + id + "'}",
    "lines = path.read_text().splitlines() if path.exists() else []",
    "kept = [line for line in lines if not any(line.startswith(key + '=') for key in values)]",
    "path.write_text('\\n'.join(kept + [key + '=' + value for key, value in values.items()]) + '\\n')",
    'os.chmod(path, 0o600)'
  ].join('; ')

  const result = await runOrgoBash(
    apiKey,
    id,
    `python3 -c ${JSON.stringify(script)}`,
    fetchImpl
  )

  if (!result.success) {
    throw new OrgoDesktopError('unavailable', result.output.trim() || 'Could not configure Orgo for remote Hermes.')
  }
}

export async function doctorOrgoComputer(
  apiKey: string,
  computerId: string,
  fetchImpl: typeof fetch = fetch
): Promise<OrgoDoctorResult> {
  const empty: OrgoDoctorResult = {
    ok: false,
    apiAuth: false,
    computerStatus: 'unknown',
    vncAvailable: false,
    mcpReady: false,
    hermesInstalled: false,
    message: 'Connect an Orgo computer first.'
  }

  if (!apiKey.trim()) {
    return empty
  }

  try {
    const computer = await ensureOrgoComputerRunning(apiKey, computerId, fetchImpl)
    let vncAvailable = false

    try {
      await fetchOrgoDesktopSession({ apiKey, computerId: computer.id }, fetchImpl)
      vncAvailable = true
    } catch {
      vncAvailable = false
    }

    const mcpReady = Boolean(computer.id && apiKey.trim())
    let hermesInstalled = false

    try {
      const probe = await runOrgoBash(apiKey, computer.id, HERMES_ORGO_PROBE_COMMAND, fetchImpl)
      hermesInstalled = probe.success || isHermesAgentTemplate(computer.templateRef)
    } catch {
      hermesInstalled = false
    }

    const ok = computer.status === 'running' && vncAvailable && mcpReady && hermesInstalled

    return {
      ok,
      apiAuth: true,
      computerStatus: computer.status,
      vncAvailable,
      mcpReady,
      hermesInstalled,
      message: ok
        ? 'Shared computer is ready with Hermes installed.'
        : hermesInstalled
          ? 'The computer is reachable but VNC or MCP is not ready yet.'
          : 'Orgo is up, but Hermes is not installed on the computer yet.'
    }
  } catch (error) {
    const serialized = serializeOrgoDesktopError(error)

    return {
      ...empty,
      apiAuth: serialized.code !== 'auth-failed',
      message: serialized.message,
      computerStatus: serialized.code === 'computer-not-found' ? 'missing' : 'error'
    }
  }
}

export function serializeOrgoBrokerError(error: unknown): { code: OrgoDesktopErrorCode; message: string } {
  return serializeOrgoDesktopError(error)
}
