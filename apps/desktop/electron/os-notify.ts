/**
 * Omarchy OS-notification exec builder (PB-16 F2 / composite review P1.2).
 *
 * The notification daemon runs `--exec` through a shell on click, so the
 * exec string is a shell sink. This module is the ONLY place it is built:
 * the renderer never supplies a command — it names a bot PROFILE and main
 * constructs one of exactly two fixed shapes. Anything that is not a valid
 * profile name falls back to the argument-less focus command (still a
 * fixed string, nothing interpolated).
 */

/** Profile names route deep links and remote acks; mirror the gateway's
 *  `_PROFILE_ID_RE` shape so renderer and remote agree on one charset. */
export const BOT_PROFILE_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/

export function osNotifyExecFor(botProfile: unknown): string {
  if (typeof botProfile === 'string' && BOT_PROFILE_RE.test(botProfile)) {
    return `botmarchy-focus --bot ${botProfile}`
  }

  // Missing, empty, or malformed → plain focus. Never rejects outright: a
  // bad profile should not kill the notification, and the fallback has no
  // interpolation surface at all.
  return 'botmarchy-focus'
}
