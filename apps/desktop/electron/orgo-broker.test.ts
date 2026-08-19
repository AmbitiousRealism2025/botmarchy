import assert from 'node:assert/strict'

import { test } from 'vitest'

import {
  beginOrgoTailscaleSetup,
  BOT_ORGO_WORKSPACE_NAME,
  createOrgoComputer,
  doctorOrgoComputer,
  ensureHermesInstalledOnOrgo,
  ensureOrgoComputerRunning,
  extractTailscaleAuthUrl,
  listOrgoComputers,
  listOrgoWorkspaces,
  orgoMcpEntry,
  orgoProcessEnv,
  parseTailscaleStatus,
  persistOrgoEnvironmentOnRemote,
  pickOrgoWorkspaceByName,
  pickSharedHermesComputer,
  resolveHermesAgentTemplateRef
} from './orgo-broker'
import { BOT_TEMPLATE_REF } from './product'

const COMPUTER_ID = 'ef2f6e29-3864-494b-a82c-15280c5d9f9e'
const WORKSPACE_ID = 'ws-shared'

function json(data: unknown, status = 200) {
  return Response.json(data, { status })
}

async function withDesktopProduct<T>(product: 'bot' | 'hermes', run: () => Promise<T>): Promise<T> {
  const previous = process.env.HERMES_DESKTOP_PRODUCT
  process.env.HERMES_DESKTOP_PRODUCT = product

  try {
    return await run()
  } finally {
    if (previous === undefined) {
      delete process.env.HERMES_DESKTOP_PRODUCT
    } else {
      process.env.HERMES_DESKTOP_PRODUCT = previous
    }
  }
}

const withBotProduct = <T>(run: () => Promise<T>) => withDesktopProduct('bot', run)
const withHermesProduct = <T>(run: () => Promise<T>) => withDesktopProduct('hermes', run)

test('MCP entry references the process env instead of copying the API key', () => {
  const entry = orgoMcpEntry(COMPUTER_ID)

  assert.equal(entry.trust, 'untrusted')
  assert.equal(entry.env.ORGO_API_KEY, '${env:ORGO_API_KEY}')
  assert.equal(entry.env.ORGO_DEFAULT_COMPUTER_ID, COMPUTER_ID)
  assert.equal(entry.command, 'npx')
  assert.deepEqual(orgoProcessEnv({ apiKey: 'orgo-secret', computerId: COMPUTER_ID }), {
    ORGO_API_KEY: 'orgo-secret',
    ORGO_DEFAULT_COMPUTER_ID: COMPUTER_ID
  })
})

test('lists workspaces and computers without exposing the key in parsed results', async () => {
  const calls: string[] = []

  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input)
    calls.push(url)

    if (url.endsWith('/workspaces')) {
      return json({ workspaces: [{ id: WORKSPACE_ID, name: 'Bots' }] })
    }

    if (url.endsWith(`/workspaces/${WORKSPACE_ID}`)) {
      return json({
        id: WORKSPACE_ID,
        name: 'Bots',
        desktops: [{ id: COMPUTER_ID, name: 'Shared', status: 'stopped', workspace_id: WORKSPACE_ID }]
      })
    }

    return json({}, 404)
  }) as typeof fetch

  const workspaces = await listOrgoWorkspaces('orgo-secret', fetchImpl)
  const computers = await listOrgoComputers('orgo-secret', WORKSPACE_ID, fetchImpl)

  assert.deepEqual(workspaces, [{ id: WORKSPACE_ID, name: 'Bots', status: undefined }])
  assert.equal(computers[0]?.id, COMPUTER_ID)
  assert.equal(JSON.stringify(computers).includes('orgo-secret'), false)
  assert.equal(calls.some(url => url.includes('/computers')), false)
})

test('reuses only the dedicated Hermes Bots workspace', () => {
  const workspaces = [
    { id: 'first', name: 'Existing project' },
    { id: WORKSPACE_ID, name: ' hermes bots ' }
  ]

  assert.equal(pickOrgoWorkspaceByName(workspaces, BOT_ORGO_WORKSPACE_NAME)?.id, WORKSPACE_ID)
  assert.equal(pickOrgoWorkspaceByName(workspaces, 'Missing'), undefined)
})

test('creates a computer from the curated template', async () => {
  let body = ''

  const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
    body = String(init?.body || '')

    return json({ id: COMPUTER_ID, name: 'Shared computer', status: 'creating' })
  }) as typeof fetch

  const computer = await createOrgoComputer('orgo-secret', { workspaceId: WORKSPACE_ID }, fetchImpl)
  assert.equal(computer.id, COMPUTER_ID)
  assert.match(body, /system\/hermes-agent@1\.0\.0/)
})

test('pins the Bot product to its tested Orgo template', async () => {
  let requested = false

  const result = await withBotProduct(() =>
    resolveHermesAgentTemplateRef('orgo-secret', (async () => {
      requested = true

      return json({ templates: [{ ref: 'system/hermes-agent@9.9.9' }] })
    }) as typeof fetch)
  )

  assert.equal(result, BOT_TEMPLATE_REF)
  assert.equal(requested, false)
})

test('ensure-running starts a stopped computer then waits for running', async () => {
  const statuses = ['stopped', 'starting', 'running']

  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input)

    if (url.endsWith('/start')) {
      return json({ success: true })
    }

    return json({ id: COMPUTER_ID, name: 'Shared', status: statuses.shift() || 'running' })
  }) as typeof fetch

  const computer = await ensureOrgoComputerRunning('orgo-secret', COMPUTER_ID, fetchImpl, async () => undefined)
  assert.equal(computer.status, 'running')
})

test('doctor reports auth, status, and VNC readiness', async () => {
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input)

    if (url.endsWith('/start')) {
      return json({ success: true })
    }

    if (url.endsWith('/vnc-password')) {
      return json({ password: 'vncsecret' })
    }

    if (url.endsWith('/bash')) {
      return json({ success: true, exit_code: 0, output: 'hermes 0.17.0' })
    }

    return json({
      id: COMPUTER_ID,
      name: 'Shared',
      status: 'running',
      instance_id: '8b517302'
    })
  }) as typeof fetch

  const result = await doctorOrgoComputer('orgo-secret', COMPUTER_ID, fetchImpl)
  assert.equal(result.ok, true)
  assert.equal(result.apiAuth, true)
  assert.equal(result.vncAvailable, true)
  assert.equal(result.mcpReady, true)
  assert.equal(result.hermesInstalled, true)
})

test('installs Hermes on a computer that does not have it yet', async () => {
  const commands: string[] = []

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    let versionProbes = 0

    if (url.endsWith('/bash')) {
      const body = JSON.parse(String(init?.body || '{}')) as { command?: string }
      const command = String(body.command || '')
      commands.push(command)

      if (command.includes('hermes --version')) {
        versionProbes = commands.filter(item => item.includes('hermes --version')).length

        if (versionProbes === 1) {
          return json({ success: true, exit_code: 127, output: 'hermes: not found' })
        }

        return json({ success: true, exit_code: 0, output: 'hermes 0.17.0' })
      }

      if (command.includes('install.sh')) {
        return json({ success: true, exit_code: 0, output: 'Hermes installed' })
      }
    }

    return json({ id: COMPUTER_ID, name: 'Shared', status: 'running', instance_id: '8b517302' })
  }) as typeof fetch

  const result = await withHermesProduct(() =>
    ensureHermesInstalledOnOrgo('orgo-secret', COMPUTER_ID, fetchImpl)
  )

  assert.equal(result.installed, true)
  assert.equal(result.installedNow, true)
  assert.equal(commands.some(command => command.includes('install.sh')), true)
})

test('does not install an unpinned latest Hermes build in the Bot product', async () => {
  const commands: string[] = []

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)

    if (url.endsWith('/bash')) {
      const body = JSON.parse(String(init?.body || '{}')) as { command?: string }
      commands.push(String(body.command || ''))

      return json({ success: true, exit_code: 127, output: 'hermes: not found' })
    }

    return json({ id: COMPUTER_ID, name: 'Shared', status: 'running', instance_id: '8b517302' })
  }) as typeof fetch

  await assert.rejects(
    () => withBotProduct(() => ensureHermesInstalledOnOrgo('orgo-secret', COMPUTER_ID, fetchImpl)),
    /will not install an unpinned Hermes build/
  )
  assert.equal(commands.some(command => command.includes('install.sh')), false)
})

test('skips the installer when Hermes is already on PATH', async () => {
  const commands: string[] = []

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)

    if (url.endsWith('/bash')) {
      const body = JSON.parse(String(init?.body || '{}')) as { command?: string }
      commands.push(String(body.command || ''))

      return json({ success: true, exit_code: 0, output: 'hermes 0.17.0' })
    }

    return json({ id: COMPUTER_ID, name: 'Shared', status: 'running', instance_id: '8b517302' })
  }) as typeof fetch

  const result = await ensureHermesInstalledOnOrgo('orgo-secret', COMPUTER_ID, fetchImpl)
  assert.equal(result.installedNow, false)
  assert.equal(commands.some(command => command.includes('install.sh')), false)
})

test('uses Orgo curated Hermes template and does not reinstall on that snapshot', async () => {
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)

    if (url.endsWith('/templates/global')) {
      return json({
        templates: [
          { ref: 'system/claude-code@1.0.0' },
          { ref: 'system/hermes-agent@1.0.0' },
          { ref: 'system/hermes-agent@1.1.0' }
        ]
      })
    }

    if (url.endsWith('/bash')) {
      assert.equal(String(init?.body || '').includes('install.sh'), false)

      return json({ success: true, exit_code: 127, output: 'not on PATH yet' })
    }

    return json({
      id: COMPUTER_ID,
      name: 'Shared',
      status: 'running',
      instance_id: '8b517302',
      template_ref: 'system/hermes-agent@1.0.0'
    })
  }) as typeof fetch

  assert.equal(
    await withHermesProduct(() => resolveHermesAgentTemplateRef('orgo-secret', fetchImpl)),
    'system/hermes-agent@1.1.0'
  )
  assert.equal(
    pickSharedHermesComputer([
      { id: 'aaaaaaaa-3864-494b-a82c-15280c5d9f9e', name: 'Claude', status: 'running', templateRef: 'system/claude-code@1.0.0' },
      { id: COMPUTER_ID, name: 'Hermes', status: 'running', templateRef: 'system/hermes-agent@1.0.0' }
    ])?.id,
    COMPUTER_ID
  )
  assert.equal(
    pickSharedHermesComputer(
      [{ id: COMPUTER_ID, name: 'Newer Hermes', status: 'running', templateRef: 'system/hermes-agent@1.1.0' }],
      BOT_TEMPLATE_REF
    ),
    undefined
  )

  const result = await ensureHermesInstalledOnOrgo('orgo-secret', COMPUTER_ID, fetchImpl)
  assert.equal(result.fromTemplate, true)
  assert.equal(result.installedNow, false)
  assert.equal(result.installed, true)
})

test('parses Tailscale status and one-time login URLs', () => {
  assert.deepEqual(
    parseTailscaleStatus(
      JSON.stringify({
        BackendState: 'Running',
        Self: { DNSName: 'hermes-bots-ef2f6e29.example.ts.net.', Online: true }
      })
    ),
    {
      installed: true,
      connected: true,
      dnsName: 'hermes-bots-ef2f6e29.example.ts.net',
      backendState: 'Running',
      authUrl: ''
    }
  )
  assert.equal(
    extractTailscaleAuthUrl('To authenticate, visit: https://login.tailscale.com/a/abc_123'),
    'https://login.tailscale.com/a/abc_123'
  )
})

test('starts Tailscale and returns the VM authorization challenge', async () => {
  const commands: string[] = []

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)

    if (url.endsWith('/bash')) {
      const body = JSON.parse(String(init?.body || '{}')) as { command?: string }
      const command = String(body.command || '')
      commands.push(command)

      if (command.includes('tailscale status')) {
        return json({ success: true, exit_code: 0, output: '{"BackendState":"NeedsLogin"}' })
      }

      if (command.includes('tailscale up')) {
        return json({
          success: true,
          exit_code: 0,
          output: 'https://login.tailscale.com/a/setup123'
        })
      }

      return json({ success: true, exit_code: 0, output: '' })
    }

    return json({ id: COMPUTER_ID, name: 'Shared', status: 'running', instance_id: '8b517302' })
  }) as typeof fetch

  const status = await beginOrgoTailscaleSetup('orgo-secret', COMPUTER_ID, fetchImpl)
  assert.equal(status.authUrl, 'https://login.tailscale.com/a/setup123')
  assert.equal(commands.some(command => command.includes('--ssh')), true)
  assert.equal(commands.some(command => command.includes('timeout 12s tailscale up')), true)
  assert.equal(commands.some(command => command.includes('timeout 3s tailscale status')), true)
  assert.equal(commands.some(command => command.includes('pkill -x tailscaled')), true)
  assert.equal(commands.some(command => command.includes('nohup tailscaled')), true)
})

test('falls back to tailscale login when up omits the authorization URL', async () => {
  const commands: string[] = []

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)

    if (url.endsWith('/bash')) {
      const command = String((JSON.parse(String(init?.body || '{}')) as { command?: string }).command || '')
      commands.push(command)

      if (command.includes('tailscale login')) {
        return json({ success: true, exit_code: 0, output: 'https://login.tailscale.com/a/fallback123' })
      }

      if (command.includes('tailscale status')) {
        return json({ success: true, exit_code: 0, output: '{"BackendState":"NeedsLogin"}' })
      }

      return json({ success: true, exit_code: 0, output: '' })
    }

    return json({ id: COMPUTER_ID, name: 'Shared', status: 'running', instance_id: '8b517302' })
  }) as typeof fetch

  const status = await beginOrgoTailscaleSetup('orgo-secret', COMPUTER_ID, fetchImpl)
  assert.equal(status.authUrl, 'https://login.tailscale.com/a/fallback123')
  assert.equal(commands.some(command => command.includes('tailscale login')), true)
  assert.equal(commands.some(command => command.includes('timeout 12s')), true)
})

test('reports a missing Tailscale authorization URL instead of silently stalling', async () => {
  const fetchImpl = (async (input: string | URL | Request) =>
    String(input).endsWith('/bash')
      ? json({ success: true, exit_code: 0, output: '' })
      : json({ id: COMPUTER_ID, name: 'Shared', status: 'running', instance_id: '8b517302' })) as typeof fetch

  await assert.rejects(
    beginOrgoTailscaleSetup('orgo-secret', COMPUTER_ID, fetchImpl),
    /Tailscale did not return a cloud-computer authorization URL/
  )
})

test('writes the Orgo key to the remote secret env rather than MCP config', async () => {
  let command = ''

  const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
    command = String((JSON.parse(String(init?.body || '{}')) as { command?: string }).command || '')

    return json({ success: true, exit_code: 0, output: '' })
  }) as typeof fetch

  await persistOrgoEnvironmentOnRemote('orgo-secret', COMPUTER_ID, fetchImpl)
  assert.match(command, /ORGO_API_KEY/)
  assert.equal(command.includes('orgo-secret'), false)
  assert.match(command, /chmod/)
})
