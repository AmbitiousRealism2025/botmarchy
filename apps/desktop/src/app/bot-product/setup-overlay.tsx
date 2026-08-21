import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from 'react'

import { syncConnectorsToRoster } from '@/app/connectors/provision'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getGlobalModelInfo } from '@/hermes'
import { ESCAPE_PRIORITY, isTopEscapeLayer, pushEscapeLayer } from '@/lib/escape-layers'
import { Loader2 } from '@/lib/icons'
import { isBotProduct } from '@/lib/product'
import { cn } from '@/lib/utils'
import { $desktopOnboarding } from '@/store/onboarding'

import { parseSelfhostTarget } from './selfhost-parse'

const STORAGE_KEY = 'hermes-bot-setup-v2'
export const BOT_PROVIDER_SETUP_READY_EVENT = 'hermes-bots:provider-setup-ready'
export const BOT_PROVIDER_SETUP_COMPLETE_EVENT = 'hermes-bots:provider-setup-complete'
export const BOT_FIRST_PROFILE_EVENT = 'hermes-bots:first-profile'

type SetupStep = 'bot' | 'composio' | 'home' | 'provider' | 'ready' | 'selfhost'

interface SetupDoctorFlags {
  bot: boolean
  composio: boolean
  computer: boolean
  provider: boolean
}

interface SetupState {
  botModel?: string
  botProfile?: string
  botProvider?: string
  complete: boolean
  /** P2.13: persisted so a reload while parked on 'ready' can't render a
   *  false report (rows unchecked, wrong home label). */
  doctor?: SetupDoctorFlags
  skipped: boolean
  step: SetupStep
}

/** Structured sshError codes from testConnectionConfig (DesktopConnectionTestResult).
 * These are stable identifiers, not message text — map them to actionable copy.
 * This is the PRIMARY error path for the self-hosted Connect button. */
const SELFHOST_TEST_ERRORS: Record<string, string> = {
  'auth-failed':
    'SSH rejected the login. Check the user name, and make sure your key is authorized on that computer (ssh-copy-id).',
  'hermes-not-found':
    'Hermes was not found on that computer. Install it with the pinned command from the Botmarchy README, then try again.',
  'host-key-changed':
    'That computer’s host key changed (often after a reinstall). Clear the old entry with `ssh-keygen -R <host>` and try again.',
  timeout: 'Could not reach that computer in time. Check the address, and that it is online (same tailnet or LAN).',
  'unreachable':
    'Could not reach that computer. Check the address, port, and that it is online and reachable from this machine.',
  'unsupported-platform':
    'Botmarchy remote mode supports Linux, macOS, and Windows hosts. That computer reported another platform.',
  'update-required':
    'The Hermes on that computer is too old for desktop remote mode. Update it to the pinned Botmarchy release and try again.'
}

/** True when the optional advanced SSH port field holds a usable value:
 * empty (unset) or a decimal integer in 1..65535. */
function isValidAdvancedPort(raw: string): boolean {
  const trimmed = raw.trim()

  if (!trimmed) {
    return true
  }

  return /^\d+$/.test(trimmed) && Number(trimmed) >= 1 && Number(trimmed) <= 65535
}

/**
 * Fallback formatter for self-hosted connect failures. The primary path is
 * structured (SELFHOST_TEST_ERRORS ← testConnectionConfig's sshError codes);
 * this only handles residual cases — an apply-time throw (post-verify) or a
 * test result with an unmapped code. Matches the stable message prefixes
 * that `sshErrorMessage` (electron/ssh-connection.ts) and remote-lifecycle
 * actually generate; otherwise passes the upstream message through
 * (truncated). Deliberately no broad /timed out/ branch: remote-dashboard
 * ready-timeouts contain that phrase but are not network failures.
 */
export function formatSelfhostError(error: unknown, fallback: string): string {
  const detail =
    (error instanceof Error ? error.message : String(error || ''))
      .replace(/^Error invoking remote method '[^']+':\s*/i, '')
      .trim() || fallback

  if (/^Could not reach .* over SSH/i.test(detail)) {
    return 'Could not reach that computer. Check the address, port, and that it is online and reachable from this machine.'
  }

  if (/^The host key for .* has CHANGED/i.test(detail)) {
    return 'That computer’s host key changed (often after a reinstall). Verify the change is expected, then clear the old entry with `ssh-keygen -R <host>` and try again.'
  }

  if (/^SSH authentication to .* failed/i.test(detail)) {
    return 'SSH rejected the login. Check the user name, load passphrase keys into your ssh-agent, or authorize your key on that computer (ssh-copy-id).'
  }

  if (/Hermes is not installed on the remote host/i.test(detail)) {
    return 'Hermes was not found on that computer. Install it with the pinned command from the Botmarchy README, then try again.'
  }

  if (/is not an executable on the remote host/i.test(detail)) {
    return 'The Hermes path set for this host is not executable. Check the path, or clear it to auto-detect.'
  }

  if (/does not support --ssh-session-token-file/i.test(detail)) {
    return 'The Hermes on that computer is too old for desktop remote mode. Update it to the pinned Botmarchy release and try again.'
  }

  if (/Could not resolve/i.test(detail)) {
    return 'That host name did not resolve. Check the spelling, or use its Tailscale IP.'
  }

  return detail.length > 600 ? `${detail.slice(0, 600)}…` : detail
}

export interface FirstBotProfile {
  model: string
  name: string
  provider: string
}

function readSetup(): SetupState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)

    if (!raw) {
      return { complete: false, skipped: false, step: 'home' }
    }

    const parsed = JSON.parse(raw) as Partial<SetupState>

    const doctorFlags =
      parsed.doctor && typeof parsed.doctor === 'object'
        ? {
            bot: Boolean(parsed.doctor.bot),
            composio: Boolean(parsed.doctor.composio),
            computer: Boolean(parsed.doctor.computer),
            provider: Boolean(parsed.doctor.provider)
          }
        : undefined

    // Legacy states from the Orgo-first wizard (orgo/tailscale) are remapped:
    // v1 Botmarchy is local-only (charter), so onboarding always restarts
    // from the home-choice step.
    const step: SetupStep =
      parsed.step === 'provider' ||
      parsed.step === 'bot' ||
      parsed.step === 'composio' ||
      parsed.step === 'selfhost' ||
      parsed.step === 'ready' ||
      parsed.step === 'home'
        ? parsed.step
        : 'home'

    return {
      botModel: typeof parsed.botModel === 'string' ? parsed.botModel : undefined,
      botProfile: typeof parsed.botProfile === 'string' ? parsed.botProfile : undefined,
      botProvider: typeof parsed.botProvider === 'string' ? parsed.botProvider : undefined,
      complete: Boolean(parsed.complete),
      doctor: doctorFlags,
      skipped: Boolean(parsed.skipped),
      step
    }
  } catch {
    return { complete: false, skipped: false, step: 'home' }
  }
}

function writeSetup(state: SetupState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function isBotProviderSetupReady(): boolean {
  const setup = readSetup()

  // The home/selfhost steps choose WHERE bots live: provider onboarding must
  // not proceed before a computer is selected.
  return setup.complete || setup.skipped || !['home', 'selfhost'].includes(setup.step)
}

export function markBotProviderSetupComplete(): void {
  window.dispatchEvent(new CustomEvent(BOT_PROVIDER_SETUP_COMPLETE_EVENT))
}

function announceProviderSetupReady(): void {
  window.dispatchEvent(new CustomEvent(BOT_PROVIDER_SETUP_READY_EVENT))
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
}

export async function createFirstBotProfile(
  titleValue: string,
  requestGateway: <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T>
): Promise<FirstBotProfile> {
  const title = titleValue.trim() || 'Assistant'
  const name = slugify(title) || 'assistant'
  const modelInfo = await getGlobalModelInfo()
  const model = String(modelInfo.model || '').trim()
  const provider = String(modelInfo.provider || '').trim()

  if (!model || !provider) {
    throw new Error('The connected GPT or Grok model could not be resolved. Reconnect the provider and try again.')
  }

  await requestGateway('profiles.create', {
    name,
    description: title,
    clone_from: null,
    no_skills: false,
    model,
    provider
  })

  return { model, name, provider }
}

function announceFirstBotProfile(profile: FirstBotProfile, open: boolean): void {
  window.dispatchEvent(
    new CustomEvent(BOT_FIRST_PROFILE_EVENT, {
      detail: { ...profile, open }
    })
  )
}

function StatusRow({
  ok,
  title,
  detail,
  neutral
}: {
  ok: boolean
  title: string
  detail: string
  /** P3.22: "not applicable" (e.g. Connect apps skipped by choice) is NOT
   *  "not done" — a hollow marker, not the same dash an incomplete step
   *  paints. */
  neutral?: boolean
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-primary/[0.06] p-3.5">
      <span
        className={cn(
          'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs',
          ok
            ? 'bg-emerald-500/15 text-emerald-400'
            : neutral
              ? 'border border-dashed border-muted-foreground/40 text-muted-foreground'
              : 'bg-primary/10 text-muted-foreground'
        )}
        title={neutral && !ok ? 'Optional — skipped' : undefined}
      >
        {ok ? '✓' : neutral ? '◦' : '–'}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{detail}</div>
      </div>
    </div>
  )
}

export function BotSetupOverlay({
  enabled,
  requestGateway
}: {
  enabled: boolean
  requestGateway: <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T>
}) {
  const [setup, setSetup] = useState<SetupState>(readSetup)
  const [botName, setBotName] = useState('Assistant')
  const [composioKey, setComposioKey] = useState('')
  const [selfhostTarget, setSelfhostTarget] = useState('')
  const [selfhostPort, setSelfhostPort] = useState('')
  const [selfhostKeyPath, setSelfhostKeyPath] = useState('')
  const [selfhostHermesPath, setSelfhostHermesPath] = useState('')
  const [selfhostAdvanced, setSelfhostAdvanced] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Async-completion guard (PB-4 review F1): a stale connect attempt — after
  // unmount, or superseded by a newer attempt — must never apply a machine
  // configuration or advance the wizard. Every awaited hop re-checks both.
  const mountedRef = useRef(true)
  const connectAttemptRef = useRef(0)

  useEffect(
    () => () => {
      mountedRef.current = false
    },
    []
  )

  const [doctor, setDoctorRaw] = useState<SetupDoctorFlags>(
    () => setup.doctor ?? { provider: false, bot: false, composio: false, computer: false }
  )

  // P2.13: every doctor transition persists with the setup state — a reload
  // while parked on 'ready' used to reset the flags and render a false
  // report (all rows unchecked, "Running on this machine" for an SSH box).
  const setDoctor = (update: SetupDoctorFlags | ((current: SetupDoctorFlags) => SetupDoctorFlags)) => {
    setDoctorRaw(current => {
      const next = typeof update === 'function' ? update(current) : update

      setSetup(state => {
        const persisted: SetupState = { ...state, doctor: next }
        writeSetup(persisted)

        return persisted
      })

      return next
    })
  }

  useEffect(() => {
    const completeProvider = () => {
      // Late-hijack guard (composite review P1.6): if the first-run
      // provider overlay was dismissed with "I'll choose a provider later"
      // and never re-opened manually, a provider finishing via Settings
      // must NOT resurrect this wizard over the live session — the advance
      // below is only for the visible hand-off.
      const onboarding = $desktopOnboarding.get()

      if (onboarding.firstRunSkipped && !onboarding.manual) {
        return
      }

      setDoctor(current => ({ ...current, provider: true }))
      setSetup(current => {
        if (current.step !== 'provider') {
          return current
        }

        const next = { ...current, step: 'bot' as const }
        writeSetup(next)

        return next
      })
    }

    window.addEventListener(BOT_PROVIDER_SETUP_COMPLETE_EVENT, completeProvider)

    return () => window.removeEventListener(BOT_PROVIDER_SETUP_COMPLETE_EVENT, completeProvider)
  }, [])

  // Provider-skip IS a wizard skip (composite review P1.6): "I'll choose a
  // provider later" dismisses the provider overlay without ever firing the
  // COMPLETE event, which used to strand this wizard at step 'provider' —
  // rendering null forever, with nothing re-offering the remaining steps.
  // The user said "later" to the up-front flow, so the whole first-run
  // wizard steps aside with it (they return via Settings).
  useEffect(() => {
    const retireIfSkipped = (onboarding: { firstRunSkipped: boolean; manual: boolean }) => {
      if (!onboarding.firstRunSkipped || onboarding.manual) {
        return
      }

      setSetup(current => {
        if (current.complete || current.skipped || current.step !== 'provider') {
          return current
        }

        const next: SetupState = { ...current, skipped: true, step: 'ready' }
        writeSetup(next)

        return next
      })
    }

    // Observe the CURRENT value too: a wizard parked at 'provider' across a
    // restart (store cached the skip, no new transition fires) must retire
    // at mount, not stay parked forever.
    retireIfSkipped($desktopOnboarding.get())

    return $desktopOnboarding.subscribe(retireIfSkipped)
  }, [])

  // Dialog semantics (composite review P1.10): the blocking overlay is a
  // real modal keyboard surface — Esc participates in the shared escape
  // layer (a nested Radix picker still wins), and focus is trapped so Tab
  // never walks the hidden app behind the backdrop.
  const dialogRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (setup.step === 'provider') {
      return
    }

    const releaseLayer = pushEscapeLayer(ESCAPE_PRIORITY.overlay)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || !isTopEscapeLayer(ESCAPE_PRIORITY.overlay)) {
        return
      }

      // Esc mirrors the step's back affordance (selfhost → home). Steps
      // without a back button keep their forward-only exits — Esc is not a
      // shortcut around required choices.
      if (setup.step === 'selfhost' && !busy) {
        event.preventDefault()
        goToStep('home')
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      releaseLayer()
    }
  }, [setup.step, busy])

  const trapTab = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') {
      return
    }

    const container = dialogRef.current

    if (!container) {
      return
    }

    const focusables = Array.from(
      container.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      )
    ).filter(element => element.offsetParent !== null || element === document.activeElement)

    if (focusables.length === 0) {
      return
    }

    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const activeElement = document.activeElement as HTMLElement | null

    if (event.shiftKey) {
      if (activeElement === first || !container.contains(activeElement)) {
        event.preventDefault()
        last.focus()
      }
    } else if (activeElement === last || !container.contains(activeElement)) {
      event.preventDefault()
      first.focus()
    }
  }

  if (!isBotProduct() || !enabled || setup.complete || setup.skipped) {
    return null
  }

  if (setup.step === 'provider') {
    return null
  }

  const finish = (skipped = false) => {
    const next: SetupState = { ...setup, complete: true, skipped, step: 'ready' }
    writeSetup(next)
    setSetup(next)

    if (setup.botProfile && setup.botModel && setup.botProvider) {
      announceFirstBotProfile(
        {
          model: setup.botModel,
          name: setup.botProfile,
          provider: setup.botProvider
        },
        true
      )
    }
  }

  const goToStep = (step: SetupStep) => {
    setSetup(current => {
      const next = { ...current, step }
      writeSetup(next)

      return next
    })
  }

  const useLocalHermes = () => {
    goToStep('provider')
    announceProviderSetupReady()
  }

  /** Connect to a user-owned computer over SSH — the self-hosted path.
   * Verify first via testConnectionConfig (which exercises the real SSH
   * bootstrap and returns structured sshError codes), and only then apply.
   * Applying persists connection.json and rehomes the backend; doing it on
   * an unverified host would strand a bad config that boots fail on next
   * launch (peer-review M1). */
  const connectSelfhost = async () => {
    const parsed = parseSelfhostTarget(selfhostTarget)

    if (!parsed.target) {
      setError(parsed.error || 'Enter the computer to connect to, like user@host.')

      return
    }

    const portOverride = Number(selfhostPort.trim())

    const port =
      selfhostPort.trim() && Number.isInteger(portOverride) && portOverride > 0 && portOverride <= 65535
        ? portOverride
        : parsed.target.port

    const payload = {
      mode: 'ssh' as const,
      profile: null,
      sshHost: parsed.target.host,
      sshUser: parsed.target.user,
      sshPort: port ?? 22,
      sshKeyPath: selfhostKeyPath.trim(),
      sshRemoteHermesPath: selfhostHermesPath.trim(),
      sshRemoteProfile: ''
    }

    const attempt = ++connectAttemptRef.current

    setBusy(true)
    setError('')

    try {
      const tested = await window.hermesDesktop?.testConnectionConfig(payload)

      // Unmounted (dismissed/complete) or superseded: discard the result —
      // especially before applyConnectionConfig, which rehomes the backend.
      if (!mountedRef.current || attempt !== connectAttemptRef.current) {
        return
      }

      // SSH-mode results use `reachable` (not `ok`): success is
      // {reachable: true, sshError: null}; failure carries a stable sshError
      // code plus a raw `error` message for the fallback path.
      if (tested && tested.reachable === false) {
        setError(
          (tested.sshError && SELFHOST_TEST_ERRORS[tested.sshError]) ||
            formatSelfhostError(tested.error || 'That computer did not pass the connection test.', 'That computer did not pass the connection test.')
        )

        return
      }

      await window.hermesDesktop?.applyConnectionConfig(payload)

      if (!mountedRef.current || attempt !== connectAttemptRef.current) {
        return
      }

      setDoctor(current => ({ ...current, computer: true }))
      goToStep('provider')
      announceProviderSetupReady()
    } catch (caught) {
      if (!mountedRef.current || attempt !== connectAttemptRef.current) {
        return
      }

      setError(formatSelfhostError(caught, 'Could not connect to that computer.'))
    } finally {
      if (mountedRef.current && attempt === connectAttemptRef.current) {
        setBusy(false)
      }
    }
  }

  const createBot = async () => {
    setBusy(true)
    setError('')

    try {
      const profile = await createFirstBotProfile(botName, requestGateway)

      setSetup(current => {
        const next = {
          ...current,
          botModel: profile.model,
          botProfile: profile.name,
          botProvider: profile.provider,
          step: 'composio' as const
        }

        writeSetup(next)

        return next
      })
      announceFirstBotProfile(profile, false)
      await syncConnectorsToRoster([{ name: profile.name }]).catch(() => undefined)
      setDoctor(current => ({ ...current, bot: true, provider: true }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the first bot.')
    } finally {
      setBusy(false)
    }
  }

  const saveComposio = async () => {
    setBusy(true)
    setError('')

    try {
      const key = composioKey.trim()

      if (key) {
        await window.hermesDesktop?.connectors?.saveKey(key)
        await syncConnectorsToRoster()
      }

      setDoctor(current => ({ ...current, composio: Boolean(key), provider: true }))
      goToStep('ready')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the Connect apps key.')
    } finally {
      setBusy(false)
    }
  }

  const heading =
    setup.step === 'home'
      ? 'Where do your bots live?'
      : setup.step === 'selfhost'
        ? 'Use your own computer'
        : setup.step === 'bot'
            ? 'Name your first bot'
            : setup.step === 'composio'
              ? 'Connect apps'
              : 'Ready'

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm"
      onKeyDown={trapTab}
    >
      <div
        aria-labelledby="bot-setup-heading"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl"
        ref={dialogRef}
        role="dialog"
      >
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Botmarchy</div>
        <h1 className="mt-1 text-xl font-semibold" id="bot-setup-heading">
          {heading}
        </h1>
        {setup.step === 'home' ? (
          <div className="mt-4 grid gap-3">
            <p className="text-sm text-muted-foreground">
              Your bots, memory, and conversations live on a computer you control. Pick one to start — you can change it
              later in Settings.
            </p>
            <Button autoFocus disabled={busy} onClick={useLocalHermes}>
              This machine
            </Button>
            <Button disabled={busy} onClick={() => goToStep('selfhost')} variant="secondary">
              Another computer I own
            </Button>
          </div>
        ) : null}
        {setup.step === 'selfhost' ? (
          <form
            className="mt-4 grid gap-3"
            onSubmit={event => {
              event.preventDefault()

              if (!busy && parseSelfhostTarget(selfhostTarget).target && isValidAdvancedPort(selfhostPort)) {
                void connectSelfhost()
              }
            }}
          >
            <p className="text-sm text-muted-foreground">
              Point Botmarchy at a computer you own. It needs SSH access and Hermes installed; bots, memory, and
              conversations live on that computer, reached over SSH — no cloud service involved.
            </p>
            <Input
              autoFocus
              disabled={busy}
              onChange={event => setSelfhostTarget(event.target.value)}
              placeholder="user@host — e.g. me@omarchy-1.tail9106ac.ts.net"
              spellCheck={false}
              value={selfhostTarget}
            />
            {(() => {
              const parsed = parseSelfhostTarget(selfhostTarget)

              if (parsed.target) {
                const label = [parsed.target.user || 'default user', parsed.target.host, parsed.target.port ? `port ${parsed.target.port}` : ''].filter(Boolean).join(' · ')

                return <p className="text-xs text-muted-foreground">Connecting as {label}</p>
              }

              if (parsed.error) {
                return <p className="text-xs text-destructive">{parsed.error}</p>
              }

              return null
            })()}
            <button
              aria-controls="bot-setup-selfhost-advanced"
              aria-expanded={selfhostAdvanced}
              className="justify-self-start text-xs text-muted-foreground underline"
              disabled={busy}
              onClick={() => setSelfhostAdvanced(current => !current)}
              type="button"
            >
              {selfhostAdvanced ? 'Hide options' : 'Port, SSH key, custom Hermes path'}
            </button>
            {selfhostAdvanced ? (
              <div className="grid gap-3 rounded-xl border border-border/70 p-3" id="bot-setup-selfhost-advanced">
                <label className="grid gap-1 text-xs text-muted-foreground">
                  SSH port
                  <Input
                    disabled={busy}
                    onChange={event => setSelfhostPort(event.target.value)}
                    placeholder="22"
                    value={selfhostPort}
                  />
                </label>
                {!isValidAdvancedPort(selfhostPort) ? (
                  <p className="text-xs text-destructive">
                    Port must be empty or a number between 1 and 65535.
                  </p>
                ) : null}
                <label className="grid gap-1 text-xs text-muted-foreground">
                  SSH key path (blank = default keys)
                  <Input
                    disabled={busy}
                    onChange={event => setSelfhostKeyPath(event.target.value)}
                    placeholder="~/.ssh/id_ed25519"
                    value={selfhostKeyPath}
                  />
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Hermes path on that computer (blank = auto-detect)
                  <Input
                    disabled={busy}
                    onChange={event => setSelfhostHermesPath(event.target.value)}
                    placeholder="~/.local/bin/hermes"
                    value={selfhostHermesPath}
                  />
                </label>
              </div>
            ) : null}
            {busy ? (
              <div aria-live="polite" className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <Loader2 aria-hidden className="size-4 animate-spin" />
                Verifying the computer over SSH — checking Hermes and the desktop remote contract…
              </div>
            ) : null}
            <Button
              aria-busy={busy}
              disabled={busy || !parseSelfhostTarget(selfhostTarget).target || !isValidAdvancedPort(selfhostPort)}
              type="submit"
            >
              {busy ? 'Testing connection…' : 'Connect'}
            </Button>
            <button
              className="justify-self-start text-xs text-muted-foreground underline"
              disabled={busy}
              onClick={() => goToStep('home')}
              type="button"
            >
              Back
            </button>
          </form>
        ) : null}
        {setup.step === 'bot' ? (
          <form
            className="mt-4 grid gap-3"
            onSubmit={event => {
              event.preventDefault()
              void createBot()
            }}
          >
            <p className="text-sm text-muted-foreground">This is the bot you will land in after setup. You can add more later.</p>
            <Input autoFocus onChange={event => setBotName(event.target.value)} value={botName} />
            <Button disabled={busy} type="submit">
              Continue
            </Button>
          </form>
        ) : null}
        {setup.step === 'composio' ? (
          <form
            className="mt-4 grid gap-3"
            onSubmit={event => {
              event.preventDefault()
              void saveComposio()
            }}
          >
            <p className="text-sm text-muted-foreground">Optional. Paste a Composio Connect key (`ck_…`) to give every bot the same apps.</p>
            <Input autoFocus onChange={event => setComposioKey(event.target.value)} placeholder="ck_…" value={composioKey} />
            <Button disabled={busy} type="submit">
              {composioKey.trim() ? 'Save and continue' : 'Skip for now'}
            </Button>
          </form>
        ) : null}
        {setup.step === 'ready' ? (
          <div className="mt-4 grid gap-2">
            <StatusRow detail="Codex or Grok is connected." ok={doctor.provider} title="Runtime + model" />
            <StatusRow detail="Ready to chat." ok={doctor.bot} title="First bot" />
            <StatusRow
              detail={doctor.composio ? 'Key saved for every bot.' : 'Skipped — add later from Connectors.'}
              neutral={!doctor.composio}
              ok={doctor.composio}
              title="Connect apps"
            />
            <StatusRow detail={doctor.computer ? 'Connected over SSH.' : 'Running on this machine.'} ok={doctor.computer} title="Home computer" />
            <Button autoFocus className="mt-2" onClick={() => finish(false)}>
              Open Bot Chat
            </Button>
          </div>
        ) : null}
        {error ? (
          <p className="mt-3 max-h-28 overflow-y-auto break-words text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {/* No skip on the selfhost step (PB-4 review F1/F2): finishing the
            wizard while an SSH attempt is pending could apply a machine
            config after the overlay is gone, and a pre-provider skip would
            behave differently before vs after a reload. Back returns to the
            home choice instead. */}
        {setup.step !== 'ready' && setup.step !== 'home' && setup.step !== 'selfhost' ? (
          <button
            className="mt-4 text-xs text-muted-foreground underline"
            disabled={busy}
            onClick={() => finish(true)}
            type="button"
          >
            Skip remaining setup
          </button>
        ) : null}
      </div>
    </div>
  )
}
