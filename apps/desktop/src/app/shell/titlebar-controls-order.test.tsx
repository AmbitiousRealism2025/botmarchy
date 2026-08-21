/**
 * Titlebar right-cluster composition (composite review P2.18 rewrite):
 * rendered-behavior tests — the computer toggle sits immediately after the
 * settings gear in the DOM, and the bot SKU paints only the tools that act.
 * Replaces the source-order assertions (which passed on broken wiring).
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

const isBot = vi.spyOn(await import('@/lib/product'), 'isBotProduct')

import { TitlebarControls } from './titlebar-controls'

afterEach(() => {
  cleanup()
  isBot.mockReset()
})

function rightCluster(): HTMLElement {
  // The appControls cluster is the aria-labelled group on the right.
  return screen.getByLabelText(/app controls/i)
}

describe('TitlebarControls right cluster', () => {
  it('places the computer toggle immediately after the settings gear (generic SKU)', () => {
    isBot.mockReturnValue(false)

    render(
      <MemoryRouter>
        <TitlebarControls onOpenSettings={() => {}} />
      </MemoryRouter>
    )

    const cluster = rightCluster()
    const buttons = within(cluster).getAllByRole('button')
    const labels = buttons.map(b => b.getAttribute('data-titlebar-tool') || b.getAttribute('aria-label') || '')
    const settings = labels.findIndex(l => /settings/i.test(l))
    const computer = labels.findIndex(l => /computer/i.test(l))

    expect(settings).toBeGreaterThan(-1)
    expect(computer).toBe(settings + 1)
  })

  it('the bot SKU paints no dead right-sidebar tool (P2.6)', () => {
    isBot.mockReturnValue(true)

    render(
      <MemoryRouter>
        <TitlebarControls onOpenSettings={() => {}} />
      </MemoryRouter>
    )

    const cluster = rightCluster()

    const labels = within(cluster)
      .getAllByRole('button')
      .map(b => b.getAttribute('data-titlebar-tool') || '')

    expect(labels.some(l => /right-sidebar/i.test(l))).toBe(false)
  })
})
