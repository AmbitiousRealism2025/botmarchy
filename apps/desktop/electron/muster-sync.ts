/**
 * Muster target sync (composite review P2.14).
 *
 * The Muster bar plugin polls the gateway over SSH using its own config
 * chain (shell.json → ~/.config/botmarchy/muster.json). Before this, the
 * app never wrote that file — a host change in Settings left the bar
 * polling the old box until it (never, per the stale-binding bug) dimmed.
 *
 * When the bot product applies a GLOBAL ssh connection, the plugin's
 * target file is updated to match: `user@host[:port]`, the one format
 * every Muster consumer parses. Existing keys (interval) are preserved;
 * the file is only touched when the target actually changes.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { isBotProduct } from './product'

/** Same conservative charset the plugin validates with (first char alnum/dot). */
const MUSTER_TARGET_RE = /^[A-Za-z0-9.][A-Za-z0-9._-]*(@[A-Za-z0-9._-]+)?(:[1-9][0-9]{0,4})?$/

export function musterTargetFor(block: { host?: unknown; port?: unknown; user?: unknown }): string {
  const host = typeof block.host === 'string' ? block.host.trim() : ''
  const user = typeof block.user === 'string' ? block.user.trim() : ''
  const port = Number(block.port)

  if (!host) {
    return ''
  }

  const base = user ? `${user}@${host}` : host

  return Number.isFinite(port) && port > 0 && port !== 22 ? `${base}:${port}` : base
}

export function musterConfigPath(home: string = String(process.env.HOME || '')): string {
  return path.join(home, '.config', 'botmarchy', 'muster.json')
}

/** Read-modify-write {ssh: target} into the plugin's config, preserving
 *  other keys. Returns what happened (for logging/tests). */
export function syncMusterTarget(
  config: { mode?: string; remote?: Record<string, unknown> },
  filePath: string = musterConfigPath()
): 'skipped-not-bot' | 'skipped-not-ssh' | 'skipped-invalid' | 'unchanged' | 'written' {
  if (!isBotProduct()) {
    return 'skipped-not-bot'
  }

  if (config.mode !== 'ssh' || !config.remote || typeof config.remote !== 'object') {
    return 'skipped-not-ssh'
  }

  const target = musterTargetFor(config.remote as { host?: unknown; port?: unknown; user?: unknown })

  if (!target || !MUSTER_TARGET_RE.test(target)) {
    return 'skipped-invalid'
  }

  let existing: Record<string, unknown> = {}

  try {
    if (existsSync(filePath)) {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8'))

      if (parsed && typeof parsed === 'object') {
        existing = parsed as Record<string, unknown>
      }
    }
  } catch {
    // Corrupt/unreadable: rewrite fresh rather than brick the chain.
    existing = {}
  }

  if (existing.ssh === target) {
    return 'unchanged'
  }

  try {
    mkdirSync(path.dirname(filePath), { recursive: true })
    writeFileSync(filePath, `${JSON.stringify({ ...existing, ssh: target }, null, 2)}\n`, 'utf8')
  } catch {
    // The bar widget is an optional companion — a failed sync must never
    // fail the connection apply. The plugin's own first-run flow still
    // writes this file if we couldn't.
    return 'skipped-invalid'
  }

  return 'written'
}
