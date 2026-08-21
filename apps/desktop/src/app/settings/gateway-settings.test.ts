import { describe, expect, it } from 'vitest'

import { normalizeGatewayConfigForSku, savedCloudConnectionUrl } from './gateway-settings'

describe('savedCloudConnectionUrl', () => {
  it('normalizes the URL of a persisted cloud connection', () => {
    expect(savedCloudConnectionUrl({ mode: 'cloud', remoteUrl: ' HTTPS://AGENT.EXAMPLE/ ' })).toBe(
      'https://agent.example'
    )
  })

  it('does not treat a stale cloud URL on a local config as connected', () => {
    expect(savedCloudConnectionUrl({ mode: 'local', remoteUrl: 'https://agent.example' })).toBe('')
  })

  it('does not treat a remote gateway URL as a connected cloud agent', () => {
    expect(savedCloudConnectionUrl({ mode: 'remote', remoteUrl: 'https://agent.example' })).toBe('')
  })
})

describe('normalizeGatewayConfigForSku — Botmarchy connection-mode policy (PB-5 review)', () => {
  it('bot SKU normalizes persisted cloud and remote modes to local', () => {
    expect(normalizeGatewayConfigForSku({ mode: 'cloud' }, true)).toEqual({ mode: 'local' })
    expect(normalizeGatewayConfigForSku({ mode: 'remote' }, true)).toEqual({ mode: 'local' })
  })

  it('bot SKU keeps the charter modes and the rest of the config untouched', () => {
    const local = { mode: 'local' as const, remoteUrl: 'https://x' }
    const ssh = { mode: 'ssh' as const, remoteUrl: 'https://x' }

    expect(normalizeGatewayConfigForSku(local, true)).toBe(local)
    expect(normalizeGatewayConfigForSku(ssh, true)).toBe(ssh)
  })

  it('generic SKU is untouched for every mode (no behavior change)', () => {
    for (const mode of ['local', 'ssh', 'cloud', 'remote'] as const) {
      expect(normalizeGatewayConfigForSku({ mode }, false)).toEqual({ mode })
    }
  })
})
