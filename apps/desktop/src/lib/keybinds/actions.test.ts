/** SKU policy for the rebindable-hotkey registry (review F5): the dark-only
 *  bot SKU must not register `appearance.toggleMode` — a registered action
 *  with no handler shows up as a dead, rebindable binding in the panel. */
import { describe, expect, it, vi } from 'vitest'

describe('KEYBIND_ACTIONS — SKU policy', () => {
  it('generic SKU ships the light/dark toggle', async () => {
    vi.resetModules()

    const { KEYBIND_ACTION_IDS } = await import('@/lib/keybinds/actions')

    expect(KEYBIND_ACTION_IDS).toContain('appearance.toggleMode')
  })

  it('bot SKU does not register the toggle (dark-only: no modes to switch)', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_HERMES_DESKTOP_PRODUCT', 'bot')

    const { KEYBIND_ACTION_IDS, KEYBIND_ACTIONS } = await import('@/lib/keybinds/actions')

    expect(KEYBIND_ACTION_IDS).not.toContain('appearance.toggleMode')
    // Everything else is untouched — the registry is only pruned, not reshaped.
    expect(KEYBIND_ACTION_IDS).toContain('nav.commandPalette')
    expect(KEYBIND_ACTION_IDS).toContain('keybinds.openPanel')
    expect(KEYBIND_ACTIONS.every(action => action.id !== 'appearance.toggleMode')).toBe(true)
  })
})
