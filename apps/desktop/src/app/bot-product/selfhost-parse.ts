/**
 * Pure parsing for the self-hosted SSH target input in bot onboarding.
 *
 * Semantically aligned with the main process's `normalizeSshConfig`
 * (apps/desktop/electron/connection-config.ts) for what users actually type
 * into one box: `user@host`, `host`, `host:port`, `user@host:port`,
 * `[v6]:port`, a bare IPv6 literal (no port — brackets are only required
 * when a port is present), or a Tailscale IP / MagicDNS name. Kept in the
 * renderer as a pure function so it is unit-testable and never blocks on
 * IPC. Stricter than the main process where the main process would silently
 * pass garbage through to ssh (malformed IPv6, labels with leading/trailing
 * hyphens); identical for every form ssh would actually connect to.
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

const LABEL_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/

function isValidIpv4(host: string): boolean {
  if (!IPV4_RE.test(host)) {
    return false
  }

  return host.split('.').every(part => Number(part) <= 255)
}

/** RFC 4291 literal with optional zone id (`fe80::1%eth0`), as ssh accepts. */
function isValidIpv6(host: string): boolean {
  let literal = host
  const zone = literal.indexOf('%')

  if (zone >= 0) {
    if (!/^[a-zA-Z0-9._~-]+$/.test(literal.slice(zone + 1))) {
      return false
    }

    literal = literal.slice(0, zone)
  }

  if (!/^[0-9a-fA-F:%]+$/.test(literal)) {
    return false
  }

  const compressed = literal.split('::')

  if (compressed.length > 2) {
    return false
  }

  const groups =
    compressed.length === 2
      ? [...(compressed[0] === '' ? [] : compressed[0].split(':')), ...(compressed[1] === '' ? [] : compressed[1].split(':'))]
      : literal === ''
        ? []
        : literal.split(':')

  if (compressed.length === 2) {
    // `::` must expand to at least one zero group.
    if (groups.length > 7) {
      return false
    }
  } else if (groups.length !== 8) {
    return false
  }

  return groups.every(group => /^[0-9a-fA-F]{1,4}$/.test(group))
}

/** Bare multi-colon input is IPv6-shaped (validity checked separately). */
function looksLikeIpv6(host: string): boolean {
  return (host.match(/:/g) || []).length >= 2
}

function isValidHostname(host: string): boolean {
  // Single-label names (omarchy-1, box) and dotted names, per-label rules:
  // no leading/trailing hyphen, alphanumeric boundaries.
  return host.split('.').every(label => LABEL_RE.test(label))
}

function isValidHost(host: string): boolean {
  if (!host || host.includes(' ') || host.includes('..') || host.startsWith('.') || host.endsWith('.')) {
    return false
  }

  // Something IPv4-shaped with out-of-range octets is malformed, not a
  // hostname — reject rather than letting the hostname regex accept it.
  if (IPV4_RE.test(host)) {
    return isValidIpv4(host)
  }

  if (looksLikeIpv6(host)) {
    return isValidIpv6(host)
  }

  return isValidHostname(host)
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

    if (!isValidIpv6(host)) {
      return { error: `"${host}" is not a valid IPv6 address.` }
    }

    if (bracketed[2]) {
      port = Number(bracketed[2])
    }
  } else {
    const colons = (host.match(/:/g) || []).length

    if (colons >= 2) {
      // Bare IPv6 without a port is unambiguous — accept it (normalizeSshConfig
      // does). With a port it would be ambiguous; require brackets.
      if (!isValidIpv6(host)) {
        return { error: 'Wrap IPv6 addresses in brackets, like [::1]:2222.' }
      }
    } else if (colons === 1) {
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
