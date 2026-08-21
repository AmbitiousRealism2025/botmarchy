/**
 * Bot SKU appearance pane (PB-6, charter principle 2): the product is
 * dark-only — the light/dark/system mode switch must not exist in the bot
 * build, while the generic Hermes SKU keeps it.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'
import { ThemeProvider } from '@/themes/context'

import { AppearanceSettings } from './appearance-settings'

function renderAppearance() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <ThemeProvider>
          <AppearanceSettings />
        </ThemeProvider>
      </I18nProvider>
    </QueryClientProvider>
  )
}

describe('AppearanceSettings — SKU mode policy', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
  })

  it('generic SKU shows the Light/Dark/System segmented control', () => {
    renderAppearance()

    expect(screen.getByRole('button', { name: /^Light$/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^System$/ })).toBeTruthy()
  })

  it('bot SKU renders no mode switch — light mode is unreachable from Settings', () => {
    vi.stubEnv('VITE_HERMES_DESKTOP_PRODUCT', 'bot')

    renderAppearance()

    expect(screen.queryByRole('button', { name: /^Light$/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Dark$/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^System$/ })).toBeNull()
  })
})
