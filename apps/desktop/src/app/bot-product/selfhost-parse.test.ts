import { describe, expect, it } from 'vitest'

import { parseSelfhostTarget } from './selfhost-parse'

describe('parseSelfhostTarget', () => {
  it('parses a bare host', () => {
    expect(parseSelfhostTarget('omarchy-1')).toEqual({ target: { host: 'omarchy-1', user: '', port: null } })
  })

  it('parses user@host', () => {
    expect(parseSelfhostTarget('ambitiousrealism@omarchy-1.tail9106ac.ts.net')).toEqual({
      target: { host: 'omarchy-1.tail9106ac.ts.net', user: 'ambitiousrealism', port: null }
    })
  })

  it('parses user@host:port', () => {
    expect(parseSelfhostTarget('root@box.lan:2222')).toEqual({
      target: { host: 'box.lan', user: 'root', port: 2222 }
    })
  })

  it('parses host:port without user', () => {
    expect(parseSelfhostTarget('100.83.160.47:9119')).toEqual({
      target: { host: '100.83.160.47', user: '', port: 9119 }
    })
  })

  it('parses a bare Tailscale IP', () => {
    expect(parseSelfhostTarget('100.83.160.47')).toEqual({
      target: { host: '100.83.160.47', user: '', port: null }
    })
  })

  it('parses bracketed IPv6 with port', () => {
    expect(parseSelfhostTarget('[fd7a:115c:a1e0::1]:2222')).toEqual({
      target: { host: 'fd7a:115c:a1e0::1', user: '', port: 2222 }
    })
  })

  it('parses user@bracketed IPv6 without port', () => {
    expect(parseSelfhostTarget('me@[fd7a:115c:a1e0::1]')).toEqual({
      target: { host: 'fd7a:115c:a1e0::1', user: 'me', port: null }
    })
  })

  it('trims whitespace', () => {
    expect(parseSelfhostTarget('  user@host  ')).toEqual({ target: { host: 'host', user: 'user', port: null } })
  })

  it('empty input yields an empty error (not yet typed)', () => {
    expect(parseSelfhostTarget('')).toEqual({ error: '' })
    expect(parseSelfhostTarget('   ')).toEqual({ error: '' })
  })

  it('rejects an invalid port', () => {
    expect(parseSelfhostTarget('host:abc').error).toBeTruthy()
    expect(parseSelfhostTarget('host:0').error).toBeTruthy()
    expect(parseSelfhostTarget('host:99999').error).toBeTruthy()
  })

  it('rejects unbracketed IPv6 with colons', () => {
    expect(parseSelfhostTarget('fd7a:115c:a1e0::1').error).toBeTruthy()
  })

  it('rejects invalid user names', () => {
    expect(parseSelfhostTarget('1bad@host').error).toBeTruthy()
    expect(parseSelfhostTarget('@host').error).toBeTruthy()
  })

  it('rejects invalid hosts', () => {
    expect(parseSelfhostTarget('user@').error).toBeTruthy()
    expect(parseSelfhostTarget('bad host').error).toBeTruthy()
    expect(parseSelfhostTarget('host..name').error).toBeTruthy()
  })

  it('accepts IPv4 with each octet in range only', () => {
    expect(parseSelfhostTarget('192.168.1.10').target).toBeTruthy()
    expect(parseSelfhostTarget('999.168.1.10').error).toBeTruthy()
  })
})
