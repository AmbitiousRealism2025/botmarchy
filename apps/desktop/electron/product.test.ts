import assert from 'node:assert/strict'

import { test } from 'vitest'

import {
  allowsGenericHermesUpdates,
  BOT_APP_ID,
  BOT_APP_NAME,
  BOT_TEMPLATE_REF,
  BOT_UPDATE_POLICY,
  desktopAppId,
  desktopAppName,
  isBotProduct
} from './product'

test('generic desktop stays Hermes unless HERMES_DESKTOP_PRODUCT=bot', () => {
  assert.equal(BOT_TEMPLATE_REF, 'system/hermes-agent@1.0.0')
  assert.equal(BOT_UPDATE_POLICY, 'release-dmg')
  assert.equal(allowsGenericHermesUpdates(), !isBotProduct())

  if (process.env.HERMES_DESKTOP_PRODUCT === 'bot') {
    assert.equal(isBotProduct(), true)
    assert.equal(desktopAppName(), process.env.HERMES_DESKTOP_APP_NAME || BOT_APP_NAME)
    assert.equal(desktopAppId(), BOT_APP_ID)

    return
  }

  assert.equal(isBotProduct(), false)
  assert.equal(desktopAppId(), 'com.nousresearch.hermes')
})
