import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { __resetBackendSkinSync, ingestBackendSkin } from './backend-sync'
import { ThemeProvider } from './context'

// The live-authoring loop: Hermes writes/edits one skin file and every surface
// repaints. An in-place edit keeps the NAME — only the palette moves.
const bloomberg = (foreground: string) => ({
  name: 'bloomberg',
  colors: { background: '#000000', ui_text: foreground, ui_accent: '#ff8000' }
})

const cssVar = (name: string) => window.document.documentElement.style.getPropertyValue(name)

describe('ThemeProvider ← backend skin sync', () => {
  beforeEach(() => {
    window.localStorage.clear()
    __resetBackendSkinSync()
  })

  afterEach(cleanup)

  it('paints the exact Orgo Black surface contract by default', () => {
    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>
    )

    expect(window.document.documentElement.dataset.hermesTheme).toBe('orgo')
    expect(window.document.documentElement.dataset.hermesMode).toBe('dark')
    expect(cssVar('--ui-bg-chrome')).toBe('var(--orgo-app)')
    expect(cssVar('--ui-bg-sidebar')).toBe('var(--orgo-panel)')
    expect(cssVar('--ui-row-active-background')).toBe('var(--orgo-card)')
    expect(cssVar('--dt-popover')).toBe('var(--orgo-inset)')
  })

  it('migrates an existing legacy palette to Orgo Black once', () => {
    window.localStorage.setItem('hermes-desktop-theme-v2', 'slate')
    window.localStorage.setItem('hermes-desktop-mode-v1', 'system')

    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>
    )

    expect(window.document.documentElement.dataset.hermesTheme).toBe('orgo')
    expect(window.document.documentElement.dataset.hermesMode).toBe('dark')
    expect(window.localStorage.getItem('hermes-orgo-black-migration-v1')).toBe('1')
  })

  it('applies an activated backend skin', () => {
    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>
    )

    act(() => ingestBackendSkin(bloomberg('#ff9f0a'), { apply: true }))

    expect(cssVar('--theme-foreground')).toBe('#ff9f0a')
    expect(cssVar('--theme-background-seed')).toBe('#000000')
    expect(cssVar('--ui-bg-chrome')).toBe('')
  })

  it('repaints an in-place edit of the ACTIVE skin (same name, new palette)', () => {
    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>
    )

    act(() => ingestBackendSkin(bloomberg('#ff9f0a'), { apply: true }))
    expect(cssVar('--theme-foreground')).toBe('#ff9f0a')

    // Recolor the same skin file. The same-name apply guard correctly no-ops
    // (protects manual desktop picks), so the repaint must come from the
    // registry update reaching the active theme derivation.
    act(() => ingestBackendSkin(bloomberg('#ff2d95'), { apply: true }))
    expect(cssVar('--theme-foreground')).toBe('#ff2d95')
  })

  it('does not repaint an edit to an INACTIVE skin', () => {
    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>
    )

    act(() => ingestBackendSkin(bloomberg('#ff9f0a'), { apply: true }))

    // A different skin registered without apply (e.g. seeded on reconnect)
    // must not touch the painted theme.
    act(() =>
      ingestBackendSkin({ name: 'forest', colors: { background: '#001100', ui_text: '#66ff66' } }, { apply: false })
    )
    expect(cssVar('--theme-foreground')).toBe('#ff9f0a')
  })
})
