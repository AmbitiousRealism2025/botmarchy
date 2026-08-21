import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { $activeGatewayProfile } from '@/store/profile'
import type { CronJob } from '@/types/hermes'

const api = vi.hoisted(() => ({
  createCronJob: vi.fn(),
  deleteCronJob: vi.fn(),
  getCronJobRuns: vi.fn(),
  getCronJobs: vi.fn(),
  pauseCronJob: vi.fn(),
  resumeCronJob: vi.fn(),
  setApiRequestProfile: vi.fn(),
  triggerCronJob: vi.fn(),
  updateCronJob: vi.fn()
}))

vi.mock('@/hermes', () => api)

import { RoutinesRailPane } from './index'

const JOB: CronJob = {
  enabled: true,
  id: 'routine-1',
  name: 'Morning briefing',
  prompt: 'Summarize the inbox.',
  schedule: { display: 'Every day at 9:00 AM', expr: '0 9 * * *' },
  state: 'scheduled'
}

describe('RoutinesRailPane', () => {
  beforeEach(() => {
    Object.values(api).forEach(mock => mock.mockReset())
    api.getCronJobs.mockResolvedValue([JOB])
    api.getCronJobRuns.mockResolvedValue([])
    api.updateCronJob.mockResolvedValue(JOB)
    $activeGatewayProfile.set('default')
    // Setting the profile atom runs its subscription, which routes API
    // requests through the desktop bridge.
    Object.defineProperty(window, 'hermesDesktop', {
      configurable: true,
      value: { api: vi.fn().mockResolvedValue([]) }
    })
  })

  afterEach(() => {
    cleanup()
    $activeGatewayProfile.set('default')
    delete (window as { hermesDesktop?: unknown }).hermesDesktop
    vi.restoreAllMocks()
  })

  it('renders the active agent routines with no computer surface', async () => {
    render(<RoutinesRailPane />)

    expect(await screen.findByText('Morning briefing')).toBeTruthy()
    // The Orgo Computer section is gone from the rail: no screen host, no
    // fullscreen affordance, no configuration form (BOT-3).
    expect(screen.queryByLabelText('Orgo computer screen')).toBeNull()
    expect(screen.queryByLabelText(/Open computer fullscreen/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /Save and connect/i })).toBeNull()
  })

  it('opens the routine editor over the list and returns on back', async () => {
    render(<RoutinesRailPane />)

    fireEvent.click(await screen.findByText('Morning briefing'))
    expect(await screen.findByRole('button', { name: 'Back to details' })).toBeTruthy()
    // The list hides while the editor owns the rail.
    expect(screen.getByText('Routine')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Back to details' }))
    expect(await screen.findByText('Morning briefing')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Back to details' })).toBeNull()
  })

  it('refreshes the list after the editor saves a change', async () => {
    api.getCronJobs.mockResolvedValueOnce([JOB])
    api.getCronJobs.mockResolvedValueOnce([{ ...JOB, name: 'Renamed briefing' }])
    api.updateCronJob.mockResolvedValue({ ...JOB, name: 'Renamed briefing' })

    render(<RoutinesRailPane />)
    fireEvent.click(await screen.findByText('Morning briefing'))

    // Save from the editor: onClose(true) bumps the list revision so the
    // fresh name arrives without a remount of the whole rail.
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Renamed briefing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(api.getCronJobs).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Renamed briefing')).toBeTruthy()
  })
})
