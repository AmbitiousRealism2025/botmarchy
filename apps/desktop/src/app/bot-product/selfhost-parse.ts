/**
 * Pure parsing for the self-hosted SSH target input in bot onboarding.
 *
 * Mirrors the semantics of the main process's `normalizeSshConfig`
 * (apps/desktop/electron/connection-config.ts) for what users actually type
 * into one box: `user@host`, `host`, `host:port`, `user@host:port`,
 * `[v6]:port`, or a bare Tailscale IP / MagicDNS name. Kept in the renderer
 * as a pure function so it is unit-testable and never blocks on IPC.
 */

export interface SelfhostTarget {
  host: string
  /** Empty string means "default ssh user" (resolved by ssh config / agent). */
  user: string
  /** null means "no explicit port" (ssh default 22 or ssh-config override). */
  port: number | null
}

export interface SelfhostParseResult {
  error?: string
  target?: SelfhostTarget
}

const HOSTNAME_RE = /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/
const IPV6_RE = /^[0-9a-fA-F:]+$/

function looksLikeIpv6(host: string): boolean {
  return host.includes(':') && IPV6_RE.test(host) && host.split(':').length > 2
}

function looksLikeIpv4(host: string): boolean {
  if (!IPV4_RE.test(host)) {
    return false
  }

  return host.split('.').every(part => Number(part) <= 255)
}

function isValidHost(host: string): boolean {
  if (!host || host.includes(' ') || host.includes('..') || host.startsWith('.') || host.endsWith('.')) {
    return false
  }

  // Something IPv4-shaped with out-of-range octets is malformed, not a
  // hostname — reject rather than letting the hostname regex accept it.
  if (IPV4_RE.test(host)) {
    return looksLikeIpv4(host)
  }

  // Tailscale MagicDNS names and IPv6 literals can be longer than DNS
  // hostname limits; accept anything hostname-shaped or a valid IP literal.
  return looksLikeIpv6(host) || HOSTNAME_RE.test(host)
}

export function parseSelfhostTarget(raw: string): SelfhostParseResult {
  const input = String(raw || '').trim()

  if (!input) {
    return { error: '' }
  }

  let host = input
  let user = ''
  let port: number | null = null

  // Split user@ first (an IPv6 literal never contains '@').
  const at = input.lastIndexOf('@')

  if (at > 0) {
    user = input.slice(0, at).trim()
    host = input.slice(at + 1).trim()

    if (!user || !/^[a-zA-Z_][a-zA-Z0-9._-]*$/.test(user)) {
      return { error: 'That user name does not look right.' }
    }
  }

  // Bracketed IPv6 with optional port: [::1]:2222
  const bracketed = /^\[([^\]]+)](?::(\d+))?$/.exec(host)

  if (bracketed) {
    host = bracketed[1]

    if (bracketed[2]) {
      port = Number(bracketed[2])
    }
  } else {
    // Unbracketed multi-colon input is malformed for anything we support:
    // an IPv6 literal must be wrapped in brackets (port would be ambiguous).
    const colons = (host.match(/:/g) || []).length

    if (colons >= 2) {
      return { error: 'Wrap IPv6 addresses in brackets, like [::1]:2222.' }
    }

    if (colons === 1) {
      const [name, rawPort] = host.split(':')

      if (!/^\d+$/.test(rawPort)) {
        return { error: `"${rawPort}" is not a valid port.` }
      }

      host = name
      port = Number(rawPort)
    }
  }

  if (!isValidHost(host)) {
    return { error: `"${host}" does not look like a host name or IP.` }
  }

  if (port !== null && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    return { error: 'Port must be between 1 and 65535.' }
  }

  return { target: { host, user, port } }
}
