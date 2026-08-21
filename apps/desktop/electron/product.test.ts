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
  assert.equal(BOT_APP_NAME, 'Botmarchy')
  // Invariant (not a change-detector): the bot runtime pins a system
  // hermes-agent template ref — never a bare tag, never another family.
  assert.match(BOT_TEMPLATE_REF, /^system\/hermes-agent@/)
  assert.equal(BOT_UPDATE_POLICY, 'source-release')
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
