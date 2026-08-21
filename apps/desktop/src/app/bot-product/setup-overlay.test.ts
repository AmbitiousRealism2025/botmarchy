import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getGlobalModelInfo } from '@/hermes'

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

  it('keeps provider onboarding gated until a home computer is chosen', () => {
    localStorage.setItem(
      'hermes-bot-setup-v2',
      JSON.stringify({ complete: false, skipped: false, step: 'home' })
    )
    expect(isBotProviderSetupReady()).toBe(false)

    localStorage.setItem(
      'hermes-bot-setup-v2',
      JSON.stringify({ complete: false, skipped: false, step: 'selfhost' })
    )
    expect(isBotProviderSetupReady()).toBe(false)

    localStorage.setItem(
      'hermes-bot-setup-v2',
      JSON.stringify({ complete: false, skipped: false, step: 'bot' })
    )
    expect(isBotProviderSetupReady()).toBe(true)
  })

  it('remaps legacy Orgo-first wizard state to the home-choice step', () => {
    localStorage.setItem(
      'hermes-bot-setup-v2',
      JSON.stringify({ complete: false, skipped: false, step: 'orgo' })
    )

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
})
