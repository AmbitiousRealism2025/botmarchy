import assert from 'node:assert/strict'

import { test } from 'vitest'

import { BOT_APP_ID, BOT_APP_NAME, desktopAppId, desktopAppName, isBotProduct } from './product'

test('generic desktop stays Hermes unless HERMES_DESKTOP_PRODUCT=bot', () => {
  if (process.env.HERMES_DESKTOP_PRODUCT === 'bot') {
    assert.equal(isBotProduct(), true)
    assert.equal(desktopAppName(), process.env.HERMES_DESKTOP_APP_NAME || BOT_APP_NAME)
    assert.equal(desktopAppId(), BOT_APP_ID)
    return
  }

  assert.equal(isBotProduct(), false)
  assert.equal(desktopAppId(), 'com.nousresearch.hermes')
})
