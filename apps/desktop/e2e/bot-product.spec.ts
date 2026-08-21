/**
 * Bot SKU shell coverage. These tests run against a Bot product build
 * (`VITE_HERMES_DESKTOP_PRODUCT=bot`). Generic Hermes builds skip them.
 */
import { type MockBackendFixture, setupMockBackend } from './fixtures'
import { expect, test } from './test'

const isBotSku = process.env.VITE_HERMES_DESKTOP_PRODUCT === 'bot' || process.env.HERMES_DESKTOP_PRODUCT === 'bot'

let fixture: MockBackendFixture | null = null

test.beforeAll(async () => {
  test.skip(!isBotSku, 'Set VITE_HERMES_DESKTOP_PRODUCT=bot to run Bot SKU e2e')
  fixture = await setupMockBackend()
})

test.afterAll(async () => {
  await fixture?.cleanup()
  fixture = null
})

test.describe('bot product shell', () => {
  test('lands in a bot-focused window', async () => {
    const page = fixture!.page
    await expect(page.getByRole('heading', { name: 'Where do your bots live?' })).toBeVisible({ timeout: 120_000 })
    const title = await page.title()
    // The fork's product name — a regression to the upstream title must fail
    // (PB-4 review nit: the old /Botmarchy|Hermes|Bots/ regex accepted it).
    expect(title).toContain('Botmarchy')
    await expect(page.locator('.bot-product-shell')).toBeVisible({
      timeout: 60_000
    })
  })

  test('does not expose generic Files/Review/Terminal chrome', async () => {
    const page = fixture!.page
    await expect(page.locator('[data-pane-id="files"]')).toHaveCount(0)
    await expect(page.locator('[data-pane-id="review"]')).toHaveCount(0)
    await expect(page.locator('[data-pane-id="terminal"]')).toHaveCount(0)
  })

  // ─── Dark-only + Omarchy garnish (PB-6, charter principle 2) ────────────

  test('is dark-only: <html> paints .dark with hermes-mode=dark', async () => {
    const page = fixture!.page

    // The rendered mode is dark regardless of stored mode or OS preference —
    // the boot paint applies it before any interaction. (The Settings surface
    // itself — no Light/System switch in the bot SKU — is covered by the
    // appearance-settings component test; reaching Settings needs a connected
    // gateway, which the mock env never satisfies for the bot SKU.)
    await expect(page.locator('html')).toHaveClass(/dark/, { timeout: 30_000 })
    await expect(page.locator('html')).toHaveAttribute('data-hermes-mode', 'dark')

    // Color-scheme pinned dark too — native scrollbars/inputs never flip to a
    // light OS theme.
    const scheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)
    expect(scheme).toBe('dark')
  })

  test('paints the Omarchy garnish: accent tokens drive selection/focus/primary', async () => {
    const page = fixture!.page

    // Raw garnish tokens exist on :root with a valid hex accent (resolved from
    // the live Omarchy theme, or the built-in Botmarchy gold fallback).
    const accent = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--botmarchy-accent').trim()
    )

    expect(accent).toMatch(/^#[0-9a-fA-F]{6}$/)

    // getComputedStyle substitutes var() in custom properties, so the derived
    // garnish slots must read back as the SAME accent — proof the garnish
    // chain (token → --dt-primary/--dt-ring/--ui-selection-background) is
    // painted and live, not frozen at a fallback.
    const derived = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement)

      return {
        primary: s.getPropertyValue('--dt-primary').trim(),
        ring: s.getPropertyValue('--dt-ring').trim(),
        selection: s.getPropertyValue('--ui-selection-background').trim()
      }
    })

    expect(derived.primary.toLowerCase()).toBe(accent.toLowerCase())
    expect(derived.ring.toLowerCase()).toBe(accent.toLowerCase())
    expect(derived.selection.toLowerCase()).toContain(accent.toLowerCase())
  })
})
