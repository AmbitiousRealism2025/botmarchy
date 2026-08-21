/**
 * Botmarchy Omarchy garnish (PB-6): dark base + accent garnish contract.
 *
 * The token math runs SKU-independent; bridge tests stub
 * VITE_HERMES_DESKTOP_PRODUCT=bot the same way the bot build defines it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __resetOmarchyGarnishForTests,
  applyBotmarchyGarnish,
  contrastForegroundFor,
  FALLBACK_GARNISH,
  getOmarchyGarnishTokens,
  initOmarchyThemeBridge,
  sanitizeOmarchyGarnishTokens,
  setOmarchyGarnishTokens
} from './omarchy-theme'

const cssVar = (name: string) => window.document.documentElement.style.getPropertyValue(name)

describe('omarchy garnish tokens', () => {
  beforeEach(() => {
    __resetOmarchyGarnishForTests()
    window.document.documentElement.style.cssText = ''
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    // hermesDesktop is optional on Window; drop any test shim.
    Reflect.deleteProperty(window, 'hermesDesktop')
  })

  it('sanitizes untrusted IPC payloads', () => {
    expect(sanitizeOmarchyGarnishTokens(null)).toBeNull()
    expect(sanitizeOmarchyGarnishTokens({})).toBeNull()
    // Non-hex accent must never paint.
    expect(sanitizeOmarchyGarnishTokens({ accent: 'rgb(1 2 3)', accentForeground: '#000000' })).toBeNull()
    expect(sanitizeOmarchyGarnishTokens({ accent: '#12345', accentForeground: '#000000' })).toBeNull()

    // Valid accent, absent/invalid foreground → REPAIRED from the accent
    // via contrast math (never one fixed color — review F3).
    expect(sanitizeOmarchyGarnishTokens({ accent: '#89b4fa' })).toEqual({
      accent: '#89b4fa',
      accentForeground: '#0d0d0e',
      themeName: 'Omarchy'
    })
    expect(sanitizeOmarchyGarnishTokens({ accent: '#8d5312', accentForeground: 'not-a-color' })?.accentForeground).toBe(
      '#fcfcfc'
    )

    expect(sanitizeOmarchyGarnishTokens({ accent: '#89b4fa', accentForeground: '#cdd6f4', themeName: 'nord' })).toEqual(
      { accent: '#89b4fa', accentForeground: '#cdd6f4', themeName: 'nord' }
    )
  })

  it('applies raw tokens plus the derived garnish set on :root', () => {
    applyBotmarchyGarnish()

    // Raw tokens carry the resolved palette.
    expect(cssVar('--botmarchy-accent')).toBe(FALLBACK_GARNISH.accent)
    expect(cssVar('--botmarchy-accent-foreground')).toBe(FALLBACK_GARNISH.accentForeground)

    // Derived overrides REFERENCE the raw tokens (var(), not a copy) so a
    // token swap repaints every garnish consumer in one setProperty pass.
    expect(cssVar('--dt-primary')).toBe('var(--botmarchy-accent)')
    expect(cssVar('--dt-primary-foreground')).toBe('var(--botmarchy-accent-foreground)')
    expect(cssVar('--dt-ring')).toBe('var(--botmarchy-accent)')
    expect(cssVar('--ui-selection-background')).toBe('color-mix(in srgb, var(--botmarchy-accent) 45%, transparent)')
    expect(cssVar('--ui-row-active-background')).toBe('color-mix(in srgb, var(--botmarchy-accent) 16%, transparent)')
    expect(cssVar('--ui-control-active-background')).toBe(
      'color-mix(in srgb, var(--botmarchy-accent) 16%, transparent)'
    )
  })

  it('paints exactly the garnish contract — garnish level, not a re-theme', () => {
    applyBotmarchyGarnish()

    // The painted set IS the contract (independent of the implementation's
    // maps): the two raw tokens plus the derived garnish slots — and nothing
    // else. themeName never reaches the CSSOM (review F7); surface palette
    // roles stay owned by the fixed dark theme.
    const painted = window.document.documentElement.style.cssText
      .split(';')
      .map(decl => decl.trim().split(':')[0])
      .filter(Boolean)
      .sort()

    expect(painted).toEqual(
      [
        '--botmarchy-accent',
        '--botmarchy-accent-foreground',
        '--dt-primary',
        '--dt-primary-foreground',
        '--dt-ring',
        '--ui-control-active-background',
        '--ui-row-active-background',
        '--ui-selection-background'
      ].sort()
    )

    expect(cssVar('--botmarchy-theme-name')).toBe('')
    expect(cssVar('--dt-background')).toBe('')
    expect(cssVar('--ui-bg-chrome')).toBe('')
  })

  it('contrastForegroundFor picks the higher-ratio candidate across the luminance range', () => {
    expect(contrastForegroundFor('#ffd24a')).toBe('#0d0d0e')
    expect(contrastForegroundFor('#89b4fa')).toBe('#0d0d0e') // mid-luminance flip case
    expect(contrastForegroundFor('#8d5312')).toBe('#fcfcfc')
    expect(contrastForegroundFor('#101014')).toBe('#fcfcfc')
  })

  it('swaps tokens live and repaints', () => {
    applyBotmarchyGarnish()

    const swapped = setOmarchyGarnishTokens({ accent: '#89b4fa', accentForeground: '#cdd6f4', themeName: 'nord' })

    expect(swapped).toBe(true)
    expect(cssVar('--botmarchy-accent')).toBe('#89b4fa')
    expect(getOmarchyGarnishTokens().themeName).toBe('nord')
  })

  it('rejects malformed live updates without losing the current garnish', () => {
    applyBotmarchyGarnish()

    expect(setOmarchyGarnishTokens({ accent: 'javascript:' })).toBe(false)
    expect(cssVar('--botmarchy-accent')).toBe(FALLBACK_GARNISH.accent)
  })

  it('no-ops identical tokens (idempotent updates)', () => {
    applyBotmarchyGarnish()

    expect(setOmarchyGarnishTokens({ ...FALLBACK_GARNISH })).toBe(false)
  })

  describe('bridge (bot SKU)', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_HERMES_DESKTOP_PRODUCT', 'bot')
    })

    it('get() populates tokens; changed() repaints on theme switch', async () => {
      const listeners: Array<(tokens: unknown) => void> = []

      window.hermesDesktop = {
        omarchyTheme: {
          get: () => Promise.resolve({ accent: '#8d5312', accentForeground: '#050A13', themeName: 'aether' }),
          changed: (cb: (tokens: unknown) => void) => {
            listeners.push(cb)

            return () => undefined
          }
        }
      } as unknown as typeof window.hermesDesktop

      initOmarchyThemeBridge()
      await vi.waitFor(() => expect(cssVar('--botmarchy-accent')).toBe('#8d5312'))

      // Simulate `omarchy theme set` from another process.
      for (const listener of listeners) {
        listener({ accent: '#89b4fa', accentForeground: '#cdd6f4', themeName: 'nord' })
      }

      expect(cssVar('--botmarchy-accent')).toBe('#89b4fa')
      expect(cssVar('--dt-primary')).toBe('var(--botmarchy-accent)')

      // Idempotent: a second init (peer window pattern) never re-subscribes.
      const before = listeners.length
      initOmarchyThemeBridge()
      expect(listeners.length).toBe(before)
    })

    it('missing preload surface is a silent no-op', () => {
      window.hermesDesktop = {} as typeof window.hermesDesktop

      expect(() => initOmarchyThemeBridge()).not.toThrow()
      expect(cssVar('--botmarchy-accent')).toBe('')
    })
  })

  it('bridge: generic SKU never touches the IPC surface', () => {
    window.hermesDesktop = {
      omarchyTheme: {
        get: () => {
          throw new Error('generic SKU must not call the bridge')
        },
        changed: () => () => undefined
      }
    } as unknown as typeof window.hermesDesktop

    expect(() => initOmarchyThemeBridge()).not.toThrow()
  })
})
