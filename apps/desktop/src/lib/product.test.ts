import { describe, expect, it } from 'vitest'

import {
  allowsGenericHermesUpdates,
  BOT_PROVIDER_IDS,
  BOT_UPDATE_POLICY,
  filterBotProviders,
  isBotProduct,
  isBotProviderId
} from './product'

describe('bot product providers', () => {
  it('recognizes Codex and Grok only', () => {
    expect(isBotProviderId('openai-codex')).toBe(true)
    expect(isBotProviderId('xai-oauth')).toBe(true)
    expect(isBotProviderId('nous')).toBe(false)
    expect(BOT_PROVIDER_IDS).toHaveLength(2)
  })

  it('filters to Codex and Grok only in the Bot SKU', () => {
    const providers = [{ id: 'nous' }, { id: 'openai-codex' }, { id: 'xai-oauth' }]
    const filtered = isBotProduct() ? filterBotProviders(providers) : providers.filter(p => isBotProviderId(p.id))
    expect(filtered.map(p => p.id)).toEqual(['openai-codex', 'xai-oauth'])
  })

  it('uses release-level updates for the Bot SKU', () => {
    expect(BOT_UPDATE_POLICY).toBe('release-dmg')
    expect(allowsGenericHermesUpdates()).toBe(!isBotProduct())
  })
})
