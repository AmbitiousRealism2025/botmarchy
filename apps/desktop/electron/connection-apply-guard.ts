/**
 * Transactional-apply guard (composite review P2.4).
 *
 * Verify-then-apply used to be a renderer convention: apply persisted
 * whatever the renderer sent. A renderer bug (or a Settings
 * save-without-apply) could rehome the backend onto an unproven config.
 * The main process now probes a CHANGED ssh config before persisting —
 * this module is the pure decision half so the policy is unit-testable.
 */
export interface FingerprintLike {
  mode?: string
  remote?: Record<string, unknown> | null
}

/** Stable identity of an ssh block (host/user/port/key/path). Extracted so
 *  the guard test covers the real comparison shape. */
export function sshFingerprintOf(remote: Record<string, unknown> | null | undefined): string {
  if (!remote || typeof remote !== 'object') {
    return ''
  }

  const pick = (key: string) => {
    const value = remote[key]

    return typeof value === 'string' ? value.trim() : value === undefined || value === null ? '' : String(value)
  }

  return ['host', 'user', 'port', 'keyPath', 'remoteHermesPath'].map(k => `${k}=${pick(k)}`).join('|')
}

/**
 * Decide whether apply must prove the new ssh config before persisting.
 *  - No probe when the mode isn't ssh (local/url applies have no probe
 *    contract) or the apply is per-profile scoped (profile overrides are
 *    validated on their own connect path).
 *  - No probe when the fingerprint is UNCHANGED — re-applying the same,
 *    already-working config (relaunch, no-op save) must not need a live
 *    box. This keeps "restart the app while the box is asleep" working.
 */
export function shouldProbeBeforeApply(
  incoming: FingerprintLike,
  existing: FingerprintLike
): boolean {
  if (incoming.mode !== 'ssh') {
    return false
  }

  const incomingHost = typeof incoming.remote?.host === 'string' ? incoming.remote.host.trim() : ''

  if (!incomingHost) {
    return false
  }

  const incomingFingerprint = sshFingerprintOf(incoming.remote)
  const existingFingerprint = existing.mode === 'ssh' ? sshFingerprintOf(existing.remote) : ''

  return incomingFingerprint !== existingFingerprint
}
