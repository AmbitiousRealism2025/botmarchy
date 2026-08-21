/**
 * Muster target sync (composite review P2.14): the app's SSH apply keeps
 * the bar plugin's config in step with the chosen box.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { musterTargetFor, syncMusterTarget } from './muster-sync'

const isBot = vi.spyOn(await import('./product'), 'isBotProduct')

let dir: string
let file: string

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'muster-sync-'))
  file = path.join(dir, 'botmarchy', 'muster.json')
  isBot.mockReturnValue(true)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  isBot.mockReset()
})

describe('musterTargetFor', () => {
  it('builds user@host[:port], omitting port 22', () => {
    expect(musterTargetFor({ host: 'omarchy-1', user: 'me', port: 22 })).toBe('me@omarchy-1')
    expect(musterTargetFor({ host: 'omarchy-1', user: 'me', port: 2222 })).toBe('me@omarchy-1:2222')
    expect(musterTargetFor({ host: 'omarchy-1' })).toBe('omarchy-1')
    expect(musterTargetFor({})).toBe('')
  })
})

describe('syncMusterTarget', () => {
  it('writes the target into the plugin config (creating the dir)', () => {
    const result = syncMusterTarget({ mode: 'ssh', remote: { host: 'omarchy-1', user: 'me', port: 2222 } }, file)

    expect(result).toBe('written')

    const persisted = JSON.parse(readFileSync(file, 'utf8'))

    expect(persisted.ssh).toBe('me@omarchy-1:2222')
  })

  it('preserves the interval key when rewriting', () => {
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify({ interval: 10, ssh: 'old@box' }))

    syncMusterTarget({ mode: 'ssh', remote: { host: 'omarchy-1', user: 'me' } }, file)

    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ interval: 10, ssh: 'me@omarchy-1' })
  })

  it('is a no-op when the target is unchanged (no write churn)', () => {
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify({ ssh: 'me@omarchy-1' }))

    expect(syncMusterTarget({ mode: 'ssh', remote: { host: 'omarchy-1', user: 'me' } }, file)).toBe('unchanged')
  })

  it('recovers from a corrupt config by rewriting fresh', () => {
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, '{not json')

    expect(syncMusterTarget({ mode: 'ssh', remote: { host: 'omarchy-1' } }, file)).toBe('written')

    expect(JSON.parse(readFileSync(file, 'utf8')).ssh).toBe('omarchy-1')
  })

  it('skips for the generic SKU and non-ssh modes', () => {
    isBot.mockReturnValue(false)

    expect(syncMusterTarget({ mode: 'ssh', remote: { host: 'h' } }, file)).toBe('skipped-not-bot')

    isBot.mockReturnValue(true)

    expect(syncMusterTarget({ mode: 'local' }, file)).toBe('skipped-not-ssh')
  })

  it('never writes a target the plugin would reject (charset gate)', () => {
    expect(syncMusterTarget({ mode: 'ssh', remote: { host: '-oProxyCommand=evil' } }, file)).toBe('skipped-invalid')
    expect(syncMusterTarget({ mode: 'ssh', remote: { host: 'h; rm -rf /' } }, file)).toBe('skipped-invalid')
  })
})
