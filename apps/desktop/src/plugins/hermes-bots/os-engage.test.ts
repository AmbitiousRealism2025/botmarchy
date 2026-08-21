/**
 * OS engage notification (PB-16 F2): the bot roster's inbound-activity
 * detector fans out to the OS surface with a vetted engage command.
 * These tests exercise the exported seam directly — the full chain
 * (roster poll → detector) is integration; the OS CLI call is
 * environment-dependent and covered by live verification.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The module under test imports the full plugin graph; the os-notify seam
// lives in a small extracted helper to keep it testable without mounting
// the roster. Import the helper directly.
import { __testOsEngage } from './os-engage'

describe('notifyOsEngage (PB-16 F2)', () => {
  beforeEach(() => {
    __testOsEngage.reset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(window, 'hermesDesktop')
  })

  it('sends one OS notification with the vetted engage command', () => {
    const calls: unknown[] = []
    window.hermesDesktop = {
      osNotify: vi.fn(payload => {
        calls.push(payload)
        return Promise.resolve({ ok: true })
      })
    } as unknown as typeof window.hermesDesktop

    const fired = __testOsEngage.fire(
      { name: 'test-bot' },
      'testbot',
      'Quick systems check — acknowledged',
      true
    )

    expect(fired).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      title: 'testbot has a new message',
      body: 'Quick systems check — acknowledged',
      botProfile: 'test-bot'
    })
  })

  it('coalesces per bot within the quiet window, but a DIFFERENT bot still fires', () => {
    window.hermesDesktop = {
      osNotify: vi.fn(() => Promise.resolve({ ok: true }))
    } as unknown as typeof window.hermesDesktop

    expect(__testOsEngage.fire({ name: 'a' }, 'A', 'x', true)).toBe(true)
    expect(__testOsEngage.fire({ name: 'a' }, 'A', 'y', true)).toBe(false) // coalesced
    expect(__testOsEngage.fire({ name: 'b' }, 'B', 'z', true)).toBe(true) // other bot fires
  })

  it('no-ops silently when the bridge is absent (non-Omarchy hosts)', () => {
    expect(() => __testOsEngage.fire({ name: 'a' }, 'A', 'x', true)).not.toThrow()
  })

  it('falls back to plain focus when the profile is unknown', () => {
    const calls: unknown[] = []
    window.hermesDesktop = {
      osNotify: vi.fn((p: unknown) => {
        calls.push(p)
        return Promise.resolve({ ok: true })
      })
    } as unknown as typeof window.hermesDesktop

    __testOsEngage.fire({}, 'Mystery', 'x', false)
    expect(calls[0]).toMatchObject({ botProfile: undefined })
  })
})
