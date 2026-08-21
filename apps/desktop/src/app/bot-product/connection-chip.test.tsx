/**
 * Bot SKU connection chip (composite review P1.11): the titlebar surface for
 * "which box / is the link up" in a SKU whose statusbar is unmounted.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { $connection, $gatewayState } from '@/store/session'

import { BotConnectionChip } from './connection-chip'

function LocationProbe() {
  const location = useLocation()

  return <div data-testid="location">{location.pathname}{location.search}</div>
}

describe('BotConnectionChip', () => {
  beforeEach(() => {
    $gatewayState.set('idle')
    $connection.set({
      baseUrl: 'http://127.0.0.1:1',
      isFullscreen: false,
      mode: 'remote',
      nativeOverlayWidth: 0,
      remoteHost: 'omarchy-1.tail9106ac.ts.net',
      remoteKind: 'ssh',
      token: '',
      wsUrl: ''
    })
  })

  afterEach(() => {
    cleanup()
    $gatewayState.set('idle')
    $connection.set(null)
  })

  it('names the SSH host when the connection is remote/ssh', () => {
    render(
      <MemoryRouter>
        <BotConnectionChip />
      </MemoryRouter>
    )

    expect(screen.getByRole('button', { name: /omarchy-1\.tail9106ac\.ts\.net/ })).toBeTruthy()
  })

  it('says local for a local connection (still answers "is the link up")', () => {
    $connection.set({
      baseUrl: 'http://127.0.0.1:1',
      isFullscreen: false,
      mode: 'local',
      nativeOverlayWidth: 0,
      token: '',
      wsUrl: ''
    })

    render(
      <MemoryRouter>
        <BotConnectionChip />
      </MemoryRouter>
    )

    expect(screen.getByRole('button', { name: /local/ })).toBeTruthy()
  })

  it('reflects gateway health in the accessible label and navigates to gateway settings on click', () => {
    $gatewayState.set('open')

    render(
      <MemoryRouter>
        <BotConnectionChip />
        <LocationProbe />
      </MemoryRouter>
    )

    const chip = screen.getByRole('button', { name: /open/i })
    expect(chip.getAttribute('aria-label')).toContain('omarchy-1.tail9106ac.ts.net')

    fireEvent.click(chip)
    expect(screen.getByTestId('location').textContent).toBe('/settings?tab=gateway')
  })

  it('carries the degraded state in the label (error ≠ open)', () => {
    $gatewayState.set('error')

    render(
      <MemoryRouter>
        <BotConnectionChip />
      </MemoryRouter>
    )

    expect(screen.getByRole('button', { name: /error/ })).toBeTruthy()
  })
})
