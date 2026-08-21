import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getGlobalModelInfo } from '@/hermes'

import { $desktopOnboarding } from '@/store/onboarding'

import { BotSetupOverlay, createFirstBotProfile, isBotProviderSetupReady } from './setup-overlay'

vi.mock('@/hermes', () => ({
  getGlobalModelInfo: vi.fn()
}))

vi.mock('@/lib/product', () => ({
  isBotProduct: () => true
}))

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('first bot profile setup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    ['openai-codex', 'gpt-5.6-sol'],
    ['xai-oauth', 'grok-4.6']
  ])('pins the connected %s model onto the created profile', async (provider, model) => {
    vi.mocked(getGlobalModelInfo).mockResolvedValue({ provider, model })
    const requestGateway = vi.fn().mockResolvedValue({})

    await expect(createFirstBotProfile('Research Assistant', requestGateway)).resolves.toEqual({
      model,
      name: 'research-assistant',
      provider
    })
    expect(requestGateway).toHaveBeenCalledWith('profiles.create', {
      name: 'research-assistant',
      description: 'Research Assistant',
      clone_from: null,
      no_skills: false,
      model,
      provider
    })
  })

  it('does not create an unpinned-model profile when model resolution fails', async () => {
    vi.mocked(getGlobalModelInfo).mockResolvedValue({ provider: '', model: '' })
    const requestGateway = vi.fn().mockResolvedValue({})

    await expect(createFirstBotProfile('Assistant', requestGateway)).rejects.toThrow(
      /connected GPT or Grok model could not be resolved/
    )
    expect(requestGateway).not.toHaveBeenCalled()
  })
})

describe('bot setup overlay', () => {
  it('exports a skippable overlay component', () => {
    expect(typeof BotSetupOverlay).toBe('function')
  })

  it('opens on the home-choice step: this machine or another computer', () => {
    render(
      createElement(BotSetupOverlay, {
        enabled: true,
        requestGateway: async <T,>() => {
          return {} as T
        }
      })
    )

    expect(screen.getByRole('heading', { name: 'Where do your bots live?' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'This machine' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Another computer I own' })).toBeTruthy()
    // No Orgo surface anywhere in the bot wizard (charter: local-only v1).
    expect(screen.queryByPlaceholderText('Orgo API key')).toBeNull()
    expect(screen.queryByRole('button', { name: /cloud computer/i })).toBeNull()
  })

  it('routes This machine straight to provider onboarding and marks setup ready', () => {
    const readyListener = vi.fn()
    window.addEventListener('hermes-bots:provider-setup-ready', readyListener)

    const view = render(
      createElement(BotSetupOverlay, {
        enabled: true,
        requestGateway: async <T,>() => {
          return {} as T
        }
      })
    )

    fireEvent.click(screen.getByRole('button', { name: 'This machine' }))

    expect(readyListener).toHaveBeenCalled()
    // The overlay unmounts its step UI — provider onboarding takes over.
    expect(view.container.querySelector('h1')).toBeNull()

    window.removeEventListener('hermes-bots:provider-setup-ready', readyListener)
  })

  it('promotes the self-hosted path to a primary choice', () => {
    render(
      createElement(BotSetupOverlay, {
        enabled: true,
        requestGateway: async <T,>() => {
          return {} as T
        }
      })
    )

    fireEvent.click(screen.getByRole('button', { name: 'Another computer I own' }))

    expect(screen.getByRole('heading', { name: 'Use your own computer' })).toBeTruthy()
    expect(
      screen.getByPlaceholderText('user@host — e.g. me@omarchy-1.tail9106ac.ts.net')
    ).toBeTruthy()
    // Back returns to the home choice, never to an Orgo step.
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('heading', { name: 'Where do your bots live?' })).toBeTruthy()
  })

  it('keeps provider onboarding gated until a home computer is chosen — every persisted shape', () => {
    // Table over the full persisted-state contract: every valid step, the
    // terminal shortcuts, BOTH historical legacy steps, corrupt JSON, and an
    // unknown future value (PB-4 review gap: the old test sampled three).
    const cases: Array<[string, boolean]> = [
      ['{"complete":false,"skipped":false,"step":"home"}', false],
      ['{"complete":false,"skipped":false,"step":"selfhost"}', false],
      ['{"complete":false,"skipped":false,"step":"provider"}', true],
      ['{"complete":false,"skipped":false,"step":"bot"}', true],
      ['{"complete":false,"skipped":false,"step":"composio"}', true],
      ['{"complete":false,"skipped":false,"step":"ready"}', true],
      ['{"complete":true,"skipped":false,"step":"ready"}', true],
      ['{"complete":false,"skipped":true,"step":"ready"}', true],
      // Legacy pre-fork steps remap to home (not ready).
      ['{"complete":false,"skipped":false,"step":"orgo"}', false],
      ['{"complete":false,"skipped":false,"step":"tailscale"}', false],
      // Corrupt / unknown values restart at home (not ready, never stuck).
      ['{not json', false],
      ['{"complete":false,"skipped":false,"step":"quantum"}', false]
    ]

    for (const [raw, ready] of cases) {
      localStorage.setItem('hermes-bot-setup-v2', raw)
      expect(isBotProviderSetupReady(), raw).toBe(ready)
    }
  })

  it.each(['orgo', 'tailscale'])('remaps legacy %s wizard state to the home-choice step', step => {
    localStorage.setItem('hermes-bot-setup-v2', JSON.stringify({ complete: false, skipped: false, step }))

    render(
      createElement(BotSetupOverlay, {
        enabled: true,
        requestGateway: async <T,>() => {
          return {} as T
        }
      })
    )

    expect(screen.getByRole('heading', { name: 'Where do your bots live?' })).toBeTruthy()
  })

  it('renders nothing on the FIRST render when persisted at provider (no synthetic-home flash)', () => {
    localStorage.setItem(
      'hermes-bot-setup-v2',
      JSON.stringify({ complete: false, skipped: false, step: 'provider' })
    )

    const view = render(
      createElement(BotSetupOverlay, {
        enabled: true,
        requestGateway: async <T,>() => {
          return {} as T
        }
      })
    )

    // Synchronous after render — the old mount-time hydration effect painted
    // a synthetic home screen first (PB-4 review F3).
    expect(screen.queryByRole('heading', { name: 'Where do your bots live?' })).toBeNull()
    expect(view.container.querySelector('h1')).toBeNull()
  })

  it('offers no Skip on the selfhost step — Back is the only exit (no skip-vs-apply race)', () => {
    render(
      createElement(BotSetupOverlay, {
        enabled: true,
        requestGateway: async <T,>() => {
          return {} as T
        }
      })
    )

    fireEvent.click(screen.getByRole('button', { name: 'Another computer I own' }))

    expect(screen.getByRole('heading', { name: 'Use your own computer' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Skip remaining setup' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy()
  })
})

describe('provider-skip hand-off (composite review P1.6)', () => {
  const renderOverlay = () =>
    render(
      createElement(BotSetupOverlay, {
        enabled: true,
        requestGateway: async <T,>() => {
          return {} as T
        }
      })
    )

  const parkAtProvider = () => {
    localStorage.setItem(
      'hermes-bot-setup-v2',
      JSON.stringify({ complete: false, skipped: false, step: 'provider' })
    )
  }

  it('treats the provider overlay\'s first-run skip as a wizard skip (no stranding)', () => {
    parkAtProvider()
    act(() => {
      $desktopOnboarding.set({ ...$desktopOnboarding.get(), firstRunSkipped: false, manual: false })
    })
    renderOverlay()

    // The wizard renders null while parked at provider (the provider
    // overlay owns this phase) — the old bug: dismissing it with "later"
    // fired NO event, so this state persisted forever with nothing
    // re-offering the remaining steps.
    expect(document.body.textContent || '').not.toContain('Where do your bots live?')

    // "I'll choose a provider later": the store flip must retire the wizard.
    act(() => {
      $desktopOnboarding.set({ ...$desktopOnboarding.get(), firstRunSkipped: true })
    })

    const persisted = JSON.parse(localStorage.getItem('hermes-bot-setup-v2') || '{}')
    expect(persisted.skipped).toBe(true)
  })

  it('a wizard parked at provider across a restart retires at mount when the skip is already cached', () => {
    parkAtProvider()
    act(() => {
      $desktopOnboarding.set({ ...$desktopOnboarding.get(), firstRunSkipped: true, manual: false })
    })

    // Mount AFTER the skip (fresh page load): no transition will ever fire —
    // the retire must come from observing the cached state.
    renderOverlay()

    const persisted = JSON.parse(localStorage.getItem('hermes-bot-setup-v2') || '{}')
    expect(persisted.skipped).toBe(true)
  })

  it('a provider completing via Settings after the skip does not resurrect the wizard', () => {
    parkAtProvider()
    $desktopOnboarding.set({ ...$desktopOnboarding.get(), firstRunSkipped: true, manual: false })
    renderOverlay()

    // User finishes provider setup in Settings → wiring fires the COMPLETE
    // event. With firstRunSkipped set, the wizard must not advance to the
    // bot step and pop over the live session (the late-hijack).
    fireEvent(window, new CustomEvent('hermes-bots:provider-setup-complete'))

    // The wizard retired at mount (skip already cached); the COMPLETE event
    // must not advance it to 'bot' and pop over the live session.
    const persisted = JSON.parse(localStorage.getItem('hermes-bot-setup-v2') || '{}')
    expect(persisted.step).toBe('ready')
    expect(persisted.skipped).toBe(true)
  })

  it('the visible hand-off still advances: completing the provider overlay mid-wizard goes to the bot step', () => {
    parkAtProvider()
    $desktopOnboarding.set({ ...$desktopOnboarding.get(), firstRunSkipped: false, manual: false })
    renderOverlay()

    fireEvent(window, new CustomEvent('hermes-bots:provider-setup-complete'))

    const persisted = JSON.parse(localStorage.getItem('hermes-bot-setup-v2') || '{}')
    expect(persisted.step).toBe('bot')
  })
})

describe('wizard dialog semantics (composite review P1.10)', () => {
  it('renders as a modal dialog labelled by its heading', () => {
    localStorage.setItem('hermes-bot-setup-v2', JSON.stringify({ complete: false, skipped: false, step: 'home' }))

    render(
      createElement(BotSetupOverlay, {
        enabled: true,
        requestGateway: async <T,>() => ({}) as T
      })
    )

    const dialog = screen.getByRole('dialog', { name: 'Where do your bots live?' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })

  it('Enter submits the selfhost form (real form semantics, not a dead input)', () => {
    localStorage.setItem('hermes-bot-setup-v2', JSON.stringify({ complete: false, skipped: false, step: 'home' }))

    window.hermesDesktop = {
      testConnectionConfig: vi.fn().mockResolvedValue({ reachable: true, sshError: null }),
      applyConnectionConfig: vi.fn().mockResolvedValue({})
    } as unknown as typeof window.hermesDesktop

    render(
      createElement(BotSetupOverlay, {
        enabled: true,
        requestGateway: async <T,>() => ({}) as T
      })
    )

    fireEvent.click(screen.getByRole('button', { name: 'Another computer I own' }))
    const target = screen.getByPlaceholderText(/me@omarchy-1/)
    fireEvent.change(target, { target: { value: 'me@omarchy-1.tail9106ac.ts.net' } })
    fireEvent.submit(target.closest('form')!)

    expect(window.hermesDesktop.testConnectionConfig).toHaveBeenCalled()
  })

  it('Escape on the selfhost step returns to the home choice', () => {
    localStorage.setItem('hermes-bot-setup-v2', JSON.stringify({ complete: false, skipped: false, step: 'selfhost' }))

    render(
      createElement(BotSetupOverlay, {
        enabled: true,
        requestGateway: async <T,>() => ({}) as T
      })
    )

    expect(screen.getByRole('heading', { name: 'Use your own computer' })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.getByRole('heading', { name: 'Where do your bots live?' })).toBeTruthy()
  })
})

describe('selfhost Connect flow (PB-4 review F1/F4)', () => {
  type Deferred = { resolve: (v: unknown) => void; reject: (e: unknown) => void }

  const defer = (): Deferred => {
    let resolve!: (v: unknown) => void
    let reject!: (e: unknown) => void

    const promise = new Promise((res, rej) => {
      resolve = res
      reject = rej
    })

    return { resolve, reject, ...{ promise } } as Deferred & { promise: Promise<unknown> }
  }

  const deferredPromise = () => {
    const d = defer()

    const promise = new Promise<unknown>((res, rej) => {
      d.resolve = res
      d.reject = rej
    })

    return { promise, resolve: d.resolve, reject: d.reject }
  }

  /** Bridge with individually-mockable IPC handlers; call-order is tracked. */
  const bridgeWith = (handlers: { test?: unknown; apply?: unknown }) => {
    const calls: string[] = []

    const bridge = {
      testConnectionConfig: vi.fn(() => {
        calls.push('test')

        return handlers.test instanceof Promise ? handlers.test : Promise.resolve(handlers.test)
      }),
      applyConnectionConfig: vi.fn(() => {
        calls.push('apply')

        return handlers.apply instanceof Promise ? handlers.apply : Promise.resolve(handlers.apply)
      })
    }

    ;(window as unknown as { hermesDesktop: unknown }).hermesDesktop = bridge

    return { bridge, calls }
  }

  const openSelfhost = () => {
    render(
      createElement(BotSetupOverlay, {
        enabled: true,
        requestGateway: async <T,>() => {
          return {} as T
        }
      })
    )

    fireEvent.click(screen.getByRole('button', { name: 'Another computer I own' }))
    fireEvent.change(screen.getByPlaceholderText('user@host — e.g. me@omarchy-1.tail9106ac.ts.net'), {
      target: { value: 'me@omarchy-1.tail9106ac.ts.net' }
    })
  }

  afterEach(() => {
    Reflect.deleteProperty(window, 'hermesDesktop')
  })

  it('tests before it applies, applies the exact payload, and announces ready only after apply', async () => {
    const { bridge, calls } = bridgeWith({ test: { reachable: true, sshError: null } })
    const readyListener = vi.fn()
    window.addEventListener('hermes-bots:provider-setup-ready', readyListener)

    openSelfhost()
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

    await vi.waitFor(() => expect(readyListener).toHaveBeenCalled())

    expect(calls).toEqual(['test', 'apply'])
    expect(bridge.testConnectionConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'ssh',
        sshHost: 'omarchy-1.tail9106ac.ts.net',
        sshUser: 'me',
        sshPort: 22
      })
    )
    expect(bridge.applyConnectionConfig).toHaveBeenCalledTimes(1)

    window.removeEventListener('hermes-bots:provider-setup-ready', readyListener)
  })

  it('does NOT apply when the connection test fails — stable error copy, no ready event', async () => {
    const { bridge } = bridgeWith({ test: { reachable: false, sshError: 'auth-failed' } })
    const readyListener = vi.fn()
    window.addEventListener('hermes-bots:provider-setup-ready', readyListener)

    openSelfhost()
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

    await vi.waitFor(() => expect(screen.getByText(/API key|password|key/i)).toBeTruthy())

    expect(bridge.applyConnectionConfig).not.toHaveBeenCalled()
    expect(readyListener).not.toHaveBeenCalled()

    window.removeEventListener('hermes-bots:provider-setup-ready', readyListener)
  })

  it('disables Connect and Back while the test is pending (busy state)', async () => {
    const pending = deferredPromise()
    bridgeWith({ test: pending.promise })

    openSelfhost()
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

    // While busy the button relabels to "Testing connection…" and disables,
    // alongside Back and the inputs.
    await vi.waitFor(() =>
      expect((screen.getByRole('button', { name: /Testing connection/ }) as HTMLButtonElement).disabled).toBe(true)
    )
    expect((screen.getByRole('button', { name: 'Back' }) as HTMLButtonElement).disabled).toBe(true)

    pending.resolve({ reachable: true, sshError: null })

    // Resolving SUCCESS completes the flow: apply runs, the wizard advances
    // to the provider handover and unmounts its step UI.
    await vi.waitFor(() => expect(screen.queryByRole('heading', { name: 'Use your own computer' })).toBeNull())
  })

  it('discards a stale attempt that resolves after the overlay unmounted — apply never fires', async () => {
    const pending = deferredPromise()
    const { bridge } = bridgeWith({ test: pending.promise })

    openSelfhost()
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

    // The wizard disappears (complete via storage state, or window close) —
    // the pending test result must NOT apply a machine configuration after
    // dismissal (PB-4 review F1).
    cleanup()

    pending.resolve({ reachable: true, sshError: null })
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(bridge.applyConnectionConfig).not.toHaveBeenCalled()
  })
})
