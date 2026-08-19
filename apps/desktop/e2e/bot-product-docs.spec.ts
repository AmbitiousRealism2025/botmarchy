import fs from 'node:fs'
import path from 'node:path'

import type { ElectronApplication, Page } from '@playwright/test'

import { setupMockBackend, setupNoProvider } from './fixtures'
import { expect, test } from './test'

const screenshotDirectory = path.resolve(import.meta.dirname, '../../../docs/images/onboarding')

async function showSetupStep(page: Page, step: 'bot' | 'composio' | 'orgo' | 'provider' | 'ready' | 'tailscale') {
  await page.evaluate(nextStep => {
    window.localStorage.setItem(
      'hermes-bot-setup-v2',
      JSON.stringify({ complete: false, skipped: false, step: nextStep })
    )
  }, step)
  await page.reload()
}

async function capture(app: ElectronApplication, page: Page, filename: string) {
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.show()
  })
  await page.bringToFront()
  await page.setViewportSize({ width: 1220, height: 800 })
  await page.getByText('CONNECTING', { exact: true }).waitFor({ state: 'hidden', timeout: 10_000 })
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(screenshotDirectory, filename) })
}

test.describe('Hermes Bots onboarding documentation', () => {
  test('captures the complete setup journey', async () => {
    fs.mkdirSync(screenshotDirectory, { recursive: true })

    const configured = await setupMockBackend()

    try {
      await expect(configured.page.getByRole('heading', { name: 'Your cloud computer' })).toBeVisible({
        timeout: 120_000
      })
      await capture(configured.app, configured.page, '01-cloud-computer.png')

      await showSetupStep(configured.page, 'tailscale')
      await expect(configured.page.getByRole('heading', { name: 'Private cloud connection' })).toBeVisible({
        timeout: 120_000
      })
      await capture(configured.app, configured.page, '02-private-connection.png')

      await showSetupStep(configured.page, 'bot')
      await expect(configured.page.getByRole('heading', { name: 'Name your first bot' })).toBeVisible({
        timeout: 120_000
      })
      await capture(configured.app, configured.page, '04-first-bot.png')

      await showSetupStep(configured.page, 'composio')
      await expect(configured.page.getByRole('heading', { name: 'Connect apps' })).toBeVisible({
        timeout: 120_000
      })
      await capture(configured.app, configured.page, '05-connect-apps.png')

      await showSetupStep(configured.page, 'ready')
      await expect(configured.page.getByRole('heading', { name: 'Ready' })).toBeVisible({ timeout: 120_000 })
      await capture(configured.app, configured.page, '06-ready.png')

      await configured.page.evaluate(() => {
        window.localStorage.setItem(
          'hermes-bot-setup-v2',
          JSON.stringify({ complete: true, skipped: false, step: 'ready' })
        )
      })
      await configured.page.reload()
      await expect(configured.page.locator('.bot-product-shell')).toBeVisible({ timeout: 120_000 })
      await capture(configured.app, configured.page, '07-bot-workspace.png')
    } finally {
      await configured.cleanup()
    }

    const noProvider = await setupNoProvider()

    try {
      await showSetupStep(noProvider.page, 'provider')
      await expect(noProvider.page.getByText(/Codex/i).first()).toBeVisible({ timeout: 120_000 })
      await capture(noProvider.app, noProvider.page, '03-provider.png')
    } finally {
      await noProvider.cleanup()
    }
  })
})
