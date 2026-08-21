/**
 * OS engage notification (PB-16 F2) — extracted from the roster activity
 * detector so the seam is unit-testable without mounting the roster UI.
 *
 * Omarchy surfaces the event in the OS notification center WITH an action:
 * clicking runs `botmarchy-focus --bot <profile>`, which lands the user in
 * that bot's chat via the hermes:// deep link. Coalesced per bot so a
 * chatty court doesn't spam the OS surface; feature-detected end-to-end
 * (missing bridge → no-op; missing `omarchy` CLI → main-process no-op).
 */

export interface OsEngageBot {
  name?: string | null
}

const osEngageLastFired = new Map<string, number>()
const OS_ENGAGE_COALESCE_MS = 5 * 60 * 1000

function notifyOsEngage(bot: OsEngageBot, label: string, preview: string, inbound: boolean): boolean {
  const key = String(bot.name || '')
  const now = Date.now()

  if (now - (osEngageLastFired.get(key) || 0) < OS_ENGAGE_COALESCE_MS) {
    return false
  }

  osEngageLastFired.set(key, now)

  // bot.name is the PROFILE name (what the deep link routes by). Main
  // builds the exec command itself from this profile (P1.2: the renderer
  // never supplies the string the daemon will shell-exec).
  window.hermesDesktop?.osNotify?.({
    title: inbound ? `${label} has a new message` : `${label} has new activity`,
    body: preview.slice(0, 140) || 'Open the chat to see it.',
    botProfile: key || undefined
  }).catch(() => undefined)

  return true
}

/** Test surface: fire + reset the coalescing window. */
export const __testOsEngage = {
  fire: notifyOsEngage,
  reset: () => osEngageLastFired.clear()
}
