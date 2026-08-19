import { describe, expect, it } from 'vitest'

import { BotSetupOverlay } from './setup-overlay'

describe('bot setup overlay', () => {
  it('exports a skippable overlay component', () => {
    expect(typeof BotSetupOverlay).toBe('function')
  })
})
