/**
 * Botmarchy onboarding wizard (PB-4): the first screen is a home choice —
 * "This machine" or "Another computer I own" — with no Orgo surface. These
 * tests run against a Bot product build and walk BOTH paths from fresh
 * localStorage against the real app shell.
 *
 * Path A (This machine): clicks through to provider onboarding.
 * Path B (Another computer): opens the self-hosted SSH step — the peer-reviewed
 * testConnectionConfig flow — without applying it (applying would rehome the
 * backend; the connect flow is covered by unit tests + manual runbook).
 */
import { type MockBackendFixture, setupMockBackend } from './fixtures'
import { expect, test } from './test'

const isBotSku = process.env.VITE_HERMES_DESKTOP_PRODUCT === 'bot' || process.env.HERMES_DESKTOP_PRODUCT === 'bot'

test.skip(!isBotSku, 'Set VITE_HERMES_DESKTOP_PRODUCT=bot to run Bot SKU e2e')

test.describe('bot onboarding wizard: two-choice home screen', () => {
  test('Path A — This machine skips straight to provider onboarding', async () => {
    let fixture: MockBackendFixture | null = null

    try {
      fixture = await setupMockBackend()

      const { page } = fixture

      // Fresh localStorage: the overlay opens on the home choice.
      await expect(page.getByRole('heading', { name: 'Where do your bots live?' })).toBeVisible({ timeout: 120_000 })
      await expect(page.getByRole('button', { name: 'This machine' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Another computer I own' })).toBeVisible()

      // No Orgo surface anywhere on the first screen.
      await expect(page.getByPlaceholder('Orgo API key')).toHaveCount(0)

      await page.getByRole('button', { name: 'This machine' }).click()

      // The wizard unmounts: the provider step hands over to
      // DesktopOnboardingOverlay (which the mock backend's configured
      // provider satisfies, landing in the workspace).
      await expect(page.getByRole('heading', { name: 'Where do your bots live?' })).toHaveCount(0)
    } finally {
      await fixture?.cleanup()
    }
  })

  test('Path B — Another computer opens the self-hosted SSH step, back returns home', async () => {
    let fixture: MockBackendFixture | null = null

    try {
      fixture = await setupMockBackend()

      const { page } = fixture

      await expect(page.getByRole('heading', { name: 'Where do your bots live?' })).toBeVisible({ timeout: 120_000 })

      await page.getByRole('button', { name: 'Another computer I own' }).click()

      // The self-hosted step: target input, structured SSH verify, advanced
      // options — the peer-reviewed flow promoted to a primary path.
      await expect(page.getByRole('heading', { name: 'Use your own computer' })).toBeVisible({ timeout: 30_000 })
      await expect(page.getByPlaceholder('user@host — e.g. me@omarchy-1.tail9106ac.ts.net')).toBeVisible()
      await expect(page.getByText('Port, SSH key, custom Hermes path')).toBeVisible()

      // Back returns to the home choice — never to an Orgo step.
      await page.getByRole('button', { name: 'Back' }).click()
      await expect(page.getByRole('heading', { name: 'Where do your bots live?' })).toBeVisible({ timeout: 30_000 })
    } finally {
      await fixture?.cleanup()
    }
  })

  test('legacy Orgo-first wizard state remaps to the home choice', async () => {
    let fixture: MockBackendFixture | null = null

    try {
      fixture = await setupMockBackend()

      const { page } = fixture

      await expect(page.getByRole('heading', { name: 'Where do your bots live?' })).toBeVisible({ timeout: 120_000 })

      // A stale persisted 'orgo' step (pre-PB-4 install) must not resurrect
      // the removed Orgo screen — onboarding restarts at the home choice.
      await page.evaluate(() => {
        window.localStorage.setItem(
          'hermes-bot-setup-v2',
          JSON.stringify({ complete: false, skipped: false, step: 'orgo' })
        )
      })
      await page.reload()

      await expect(page.getByRole('heading', { name: 'Where do your bots live?' })).toBeVisible({ timeout: 120_000 })
      await expect(page.getByPlaceholder('Orgo API key')).toHaveCount(0)
    } finally {
      await fixture?.cleanup()
    }
  })
})
