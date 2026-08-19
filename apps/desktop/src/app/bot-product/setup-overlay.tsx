import { useEffect, useState } from 'react'

import { syncConnectorsToRoster } from '@/app/connectors/provision'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { DesktopTailscaleStatus } from '@/global'
import { isBotProduct } from '@/lib/product'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'hermes-bot-setup-v2'
export const BOT_PROVIDER_SETUP_READY_EVENT = 'hermes-bots:provider-setup-ready'
export const BOT_PROVIDER_SETUP_COMPLETE_EVENT = 'hermes-bots:provider-setup-complete'

type SetupStep = 'bot' | 'composio' | 'orgo' | 'provider' | 'ready' | 'tailscale'

interface SetupState {
  complete: boolean
  skipped: boolean
  step: SetupStep
}

function readSetup(): SetupState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)

    if (!raw) {
      return { complete: false, skipped: false, step: 'orgo' }
    }

    const parsed = JSON.parse(raw) as Partial<SetupState>

    const step: SetupStep =
      parsed.step === 'tailscale' ||
      parsed.step === 'provider' ||
      parsed.step === 'bot' ||
      parsed.step === 'composio' ||
      parsed.step === 'ready'
        ? parsed.step
        : 'orgo'

    return { complete: Boolean(parsed.complete), skipped: Boolean(parsed.skipped), step }
  } catch {
    return { complete: false, skipped: false, step: 'orgo' }
  }
}

function writeSetup(state: SetupState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function isBotProviderSetupReady(): boolean {
  const setup = readSetup()

  return setup.complete || setup.skipped || !['orgo', 'tailscale'].includes(setup.step)
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

function StatusRow({ ok, title, detail }: { ok: boolean; title: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-primary/[0.06] p-3.5">
      <span
        className={cn(
          'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs',
          ok ? 'bg-emerald-500/15 text-emerald-400' : 'bg-primary/10 text-muted-foreground'
        )}
      >
        {ok ? '✓' : '–'}
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
  const [setup, setSetup] = useState<SetupState>({ complete: false, skipped: false, step: 'orgo' })
  const [botName, setBotName] = useState('Assistant')
  const [composioKey, setComposioKey] = useState('')
  const [orgoKey, setOrgoKey] = useState('')
  const [localTailscale, setLocalTailscale] = useState<DesktopTailscaleStatus | null>(null)
  const [remoteTailscale, setRemoteTailscale] = useState<DesktopTailscaleStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [doctor, setDoctor] = useState<{
    provider: boolean
    bot: boolean
    composio: boolean
    orgo: boolean
  }>({ provider: false, bot: false, composio: false, orgo: false })

  useEffect(() => {
    setSetup(readSetup())
  }, [])

  useEffect(() => {
    const completeProvider = () => {
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

  useEffect(() => {
    if (setup.step !== 'tailscale') {
      return undefined
    }

    let cancelled = false

    const refresh = async () => {
      try {
        const [local, remote] = await Promise.all([
          window.hermesDesktop?.orgoDesktop.tailscaleLocalStatus(),
          window.hermesDesktop?.orgoDesktop.tailscaleStatus()
        ])

        if (!cancelled) {
          setLocalTailscale(local || null)
          setRemoteTailscale(remote || null)
        }
      } catch {
        // Setup buttons surface actionable errors; polling stays quiet.
      }
    }

    void refresh()
    const timer = window.setInterval(() => void refresh(), 2000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [setup.step])

  if (!isBotProduct() || !enabled || setup.complete || setup.skipped) {
    return null
  }

  if (setup.step === 'provider') {
    return null
  }

  const finish = (skipped = false) => {
    const next: SetupState = { complete: true, skipped, step: 'ready' }
    writeSetup(next)
    setSetup(next)
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

  const createBot = async () => {
    setBusy(true)
    setError('')

    try {
      const title = botName.trim() || 'Assistant'
      const name = slugify(title) || 'assistant'
      await requestGateway('profiles.create', {
        name,
        description: title,
        clone_from: null,
        no_skills: false
      })
      await syncConnectorsToRoster([{ name }])
      setDoctor(current => ({ ...current, bot: true, provider: true }))
      goToStep('composio')
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

  const saveOrgo = async () => {
    setBusy(true)
    setError('')

    try {
      const key = orgoKey.trim()

      if (!key) {
        goToStep('provider')
        announceProviderSetupReady()

        return
      }

      await window.hermesDesktop?.orgoDesktop.saveKey(key)
      const provisioned = await window.hermesDesktop?.orgoDesktop.provision()

      if (!provisioned?.computerId) {
        throw new Error('Orgo did not return a shared computer.')
      }

      await window.hermesDesktop?.orgoDesktop.ensureRunning()
      const remote = await window.hermesDesktop?.orgoDesktop.beginTailscale()
      const local = await window.hermesDesktop?.orgoDesktop.tailscaleLocalStatus()
      setRemoteTailscale(remote || null)
      setLocalTailscale(local || null)
      goToStep('tailscale')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not set up the shared computer.')
    } finally {
      setBusy(false)
    }
  }

  const openTailscale = async () => {
    setBusy(true)
    setError('')

    try {
      await window.hermesDesktop?.orgoDesktop.openTailscale()
      const local = await window.hermesDesktop?.orgoDesktop.tailscaleLocalStatus()
      setLocalTailscale(local || null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not open Tailscale.')
    } finally {
      setBusy(false)
    }
  }

  const authorizeComputer = async () => {
    setBusy(true)
    setError('')

    try {
      const remote = await window.hermesDesktop?.orgoDesktop.beginTailscale()
      setRemoteTailscale(remote || null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start Tailscale on the shared computer.')
    } finally {
      setBusy(false)
    }
  }

  const connectCloudHermes = async () => {
    setBusy(true)
    setError('')

    try {
      const result = await window.hermesDesktop?.orgoDesktop.connectRemoteHermes()

      if (!result?.connection || result.connection.mode !== 'ssh') {
        throw new Error('Hermes did not switch to the shared computer.')
      }

      setDoctor(current => ({ ...current, orgo: true }))
      goToStep('provider')
      announceProviderSetupReady()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not connect Hermes to the shared computer.')
    } finally {
      setBusy(false)
    }
  }

  const heading =
    setup.step === 'orgo'
      ? 'Your cloud computer'
      : setup.step === 'tailscale'
        ? 'Private cloud connection'
        : setup.step === 'bot'
          ? 'Name your first bot'
          : setup.step === 'composio'
            ? 'Connect apps'
            : 'Ready'

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Hermes Bots</div>
        <h1 className="mt-1 text-xl font-semibold">{heading}</h1>
        {setup.step === 'orgo' ? (
          <div className="mt-4 grid gap-3">
            <p className="text-sm text-muted-foreground">
              Add Orgo to keep Hermes, every bot, and their memory running in the cloud. Skip only if you want this Mac
              to host Hermes.
            </p>
            <Input
              onChange={event => setOrgoKey(event.target.value)}
              placeholder="Orgo API key"
              type="password"
              value={orgoKey}
            />
            <Button disabled={busy} onClick={() => void saveOrgo()}>
              {orgoKey.trim() ? 'Create cloud computer' : 'Use this Mac instead'}
            </Button>
          </div>
        ) : null}
        {setup.step === 'tailscale' ? (
          <div className="mt-4 grid gap-2">
            <p className="mb-1 text-sm text-muted-foreground">
              Tailscale gives this Mac a private SSH connection to Hermes on your Orgo computer.
            </p>
            <StatusRow
              detail={
                localTailscale?.connected
                  ? localTailscale.dnsName || 'This Mac is connected.'
                  : localTailscale?.installed
                    ? 'Open Tailscale and sign in.'
                    : 'Install Tailscale, then sign in.'
              }
              ok={Boolean(localTailscale?.connected)}
              title="This Mac"
            />
            <StatusRow
              detail={
                remoteTailscale?.connected
                  ? remoteTailscale.dnsName
                  : remoteTailscale?.authUrl
                    ? 'Approve the computer in the browser window.'
                    : 'Start authorization to add it to your tailnet.'
              }
              ok={Boolean(remoteTailscale?.connected)}
              title="Cloud computer"
            />
            {!localTailscale?.connected ? (
              <Button disabled={busy} onClick={() => void openTailscale()} variant="secondary">
                {localTailscale?.installed ? 'Open Tailscale' : 'Get Tailscale'}
              </Button>
            ) : null}
            {!remoteTailscale?.connected ? (
              <Button disabled={busy} onClick={() => void authorizeComputer()} variant="secondary">
                Authorize cloud computer
              </Button>
            ) : null}
            <Button
              disabled={busy || !localTailscale?.connected || !remoteTailscale?.connected}
              onClick={() => void connectCloudHermes()}
            >
              Connect Hermes
            </Button>
          </div>
        ) : null}
        {setup.step === 'bot' ? (
          <div className="mt-4 grid gap-3">
            <p className="text-sm text-muted-foreground">This is the bot you will land in after setup. You can add more later.</p>
            <Input autoFocus onChange={event => setBotName(event.target.value)} value={botName} />
            <Button disabled={busy} onClick={() => void createBot()}>
              Continue
            </Button>
          </div>
        ) : null}
        {setup.step === 'composio' ? (
          <div className="mt-4 grid gap-3">
            <p className="text-sm text-muted-foreground">Optional. Paste a Composio Connect key (`ck_…`) to give every bot the same apps.</p>
            <Input onChange={event => setComposioKey(event.target.value)} placeholder="ck_…" value={composioKey} />
            <Button disabled={busy} onClick={() => void saveComposio()}>
              {composioKey.trim() ? 'Save and continue' : 'Skip for now'}
            </Button>
          </div>
        ) : null}
        {setup.step === 'ready' ? (
          <div className="mt-4 grid gap-2">
            <StatusRow detail="Codex or Grok is connected." ok={doctor.provider} title="Runtime + model" />
            <StatusRow detail="Ready to chat." ok={doctor.bot} title="First bot" />
            <StatusRow detail={doctor.composio ? 'Key saved for every bot.' : 'Skipped — add later from Connectors.'} ok={doctor.composio} title="Connect apps" />
            <StatusRow detail={doctor.orgo ? 'Computer is selected and MCP is ready.' : 'Skipped — add later from the computer drawer.'} ok={doctor.orgo} title="Shared computer" />
            <Button className="mt-2" onClick={() => finish(false)}>
              Open Bot Chat
            </Button>
          </div>
        ) : null}
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        {setup.step === 'tailscale' ? (
          <button className="mt-4 text-xs text-muted-foreground underline" onClick={useLocalHermes} type="button">
            Use this Mac instead
          </button>
        ) : setup.step !== 'ready' && setup.step !== 'orgo' ? (
          <button className="mt-4 text-xs text-muted-foreground underline" onClick={() => finish(true)} type="button">
            Skip remaining setup
          </button>
        ) : null}
      </div>
    </div>
  )
}
