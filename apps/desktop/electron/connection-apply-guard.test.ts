/**
 * Transactional-apply guard (composite review P2.4) — the pure decision:
 * a CHANGED global ssh config must be probed in main before persisting.
 */
import { describe, expect, it } from 'vitest'

import { shouldProbeBeforeApply, sshFingerprintOf } from './connection-apply-guard'

const ssh = (host: string, extra: Record<string, unknown> = {}) => ({
  mode: 'ssh',
  remote: { host, ...extra }
})

describe('sshFingerprintOf', () => {
  it('identifies a config by its load-bearing fields', () => {
    expect(sshFingerprintOf({ host: 'a', user: 'me' })).toBe(sshFingerprintOf({ host: 'a', user: 'me' }))
    expect(sshFingerprintOf({ host: 'a' })).not.toBe(sshFingerprintOf({ host: 'b' }))
    expect(sshFingerprintOf({ host: 'a', port: 2222 })).not.toBe(sshFingerprintOf({ host: 'a', port: 22 }))
    expect(sshFingerprintOf(null)).toBe('')
  })
})

describe('shouldProbeBeforeApply', () => {
  it('probes a NEW ssh config (the wizard path, but enforced in main)', () => {
    expect(shouldProbeBeforeApply(ssh('omarchy-1', { user: 'me' }), { mode: 'local' })).toBe(true)
  })

  it('probes a CHANGED ssh config', () => {
    expect(shouldProbeBeforeApply(ssh('box-b'), ssh('box-a'))).toBe(true)
    expect(shouldProbeBeforeApply(ssh('box', { port: 2222 }), ssh('box', { port: 22 }))).toBe(true)
  })

  it('never requires a live box for an UNCHANGED config (relaunch, no-op save)', () => {
    expect(shouldProbeBeforeApply(ssh('box', { user: 'me' }), ssh('box', { user: 'me' }))).toBe(false)
  })

  it('skips non-ssh modes (no probe contract) and empty hosts (coerce rejects)', () => {
    expect(shouldProbeBeforeApply({ mode: 'local' }, ssh('box'))).toBe(false)
    expect(shouldProbeBeforeApply({ mode: 'ssh', remote: { host: '' } }, ssh('box'))).toBe(false)
  })
})
