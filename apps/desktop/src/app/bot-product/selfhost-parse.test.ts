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

  it('accepts a bare IPv6 literal without port (normalizeSshConfig parity)', () => {
    expect(parseSelfhostTarget('::1')).toEqual({ target: { host: '::1', user: '', port: null } })
    expect(parseSelfhostTarget('fd7a:115c:a1e0::1')).toEqual({
      target: { host: 'fd7a:115c:a1e0::1', user: '', port: null }
    })
    expect(parseSelfhostTarget('1:2:3:4:5:6:7:8')).toEqual({
      target: { host: '1:2:3:4:5:6:7:8', user: '', port: null }
    })
  })

  it('accepts an IPv6 zone id in brackets', () => {
    expect(parseSelfhostTarget('[fe80::1%eth0]:2222')).toEqual({
      target: { host: 'fe80::1%eth0', user: '', port: 2222 }
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
    expect(parseSelfhostTarget('host:').error).toBeTruthy()
    expect(parseSelfhostTarget('host:0').error).toBeTruthy()
    expect(parseSelfhostTarget('host:99999').error).toBeTruthy()
    expect(parseSelfhostTarget('host:65536').error).toBeTruthy()
  })

  it('accepts port 65535', () => {
    expect(parseSelfhostTarget('host:65535').target?.port).toBe(65535)
  })

  it('rejects malformed IPv6 literals', () => {
    expect(parseSelfhostTarget('[:::]').error).toBeTruthy()
    expect(parseSelfhostTarget('[1:2:3:4:5:6:7:8:9]').error).toBeTruthy() // 9 groups
    expect(parseSelfhostTarget('[1:2:3:4:5:6:7:8::]').error).toBeTruthy() // 8 + compression
    expect(parseSelfhostTarget('[1:2:3:4:5:6:7:8:9]:22').error).toBeTruthy()
    expect(parseSelfhostTarget('[::g]').error).toBeTruthy()
    expect(parseSelfhostTarget('[12345::]').error).toBeTruthy() // 5-digit group
    expect(parseSelfhostTarget('[1::2::3]').error).toBeTruthy() // double compression
  })

  it('rejects malformed IPv6 in bare form', () => {
    expect(parseSelfhostTarget('1:2:3::4::5').error).toBeTruthy()
    expect(parseSelfhostTarget(':::').error).toBeTruthy()
  })

  it('rejects malformed bare multi-colon input that is not valid IPv6', () => {
    expect(parseSelfhostTarget('1:2::3::4').error).toBeTruthy()
    expect(parseSelfhostTarget('zz::1').error).toBeTruthy()
  })

  it('rejects invalid user names', () => {
    expect(parseSelfhostTarget('1bad@host').error).toBeTruthy()
    expect(parseSelfhostTarget('@host').error).toBeTruthy()
  })

  it('rejects invalid hosts', () => {
    expect(parseSelfhostTarget('user@').error).toBeTruthy()
    expect(parseSelfhostTarget('bad host').error).toBeTruthy()
    expect(parseSelfhostTarget('host..name').error).toBeTruthy()
    expect(parseSelfhostTarget('.host').error).toBeTruthy()
    expect(parseSelfhostTarget('host.').error).toBeTruthy()
  })

  it('rejects invalid DNS labels (leading/trailing hyphens)', () => {
    expect(parseSelfhostTarget('foo.-bar').error).toBeTruthy()
    expect(parseSelfhostTarget('foo-.bar').error).toBeTruthy()
    expect(parseSelfhostTarget('-foo.bar').error).toBeTruthy()
    expect(parseSelfhostTarget('foo.bar-').error).toBeTruthy()
  })

  it('rejects multiple @ as a user-name problem', () => {
    expect(parseSelfhostTarget('a@b@host').error).toBeTruthy()
  })

  it('accepts IPv4 with each octet in range only', () => {
    expect(parseSelfhostTarget('192.168.1.10').target).toBeTruthy()
    expect(parseSelfhostTarget('999.168.1.10').error).toBeTruthy()
  })
})
