/**
 * Omarchy theme garnish resolver (PB-6, charter design principle 2).
 *
 * Botmarchy is dark-only and Omarchy theme-aware: at launch (and live, via a
 * directory watch) the app asks Omarchy's own resolver for the active theme's
 * semantic palette and distills it into two garnish tokens (accent + the
 * contrast foreground that rides it). The renderer applies them as CSS custom
 * properties — selection, focus rings, active markers, primary buttons. Garnish
 * level, never a full re-theme.
 *
 * Everything OS/Electron-shaped is injected so the resolution chain is unit
 * testable; main.ts owns the IPC + broadcast wiring.
 */

/** Distilled from an Omarchy theme — the smallest garnish contract. */
export interface OmarchyGarnishTokens {
  accent: string
  /** Contrast foreground for text/icons sitting on the accent. */
  accentForeground: string
  /** Theme display name, for logs and the About surface. */
  themeName: string
}

/** `omarchy-theme-color --all` emits `key<TAB>value` per resolved palette key. */
export function parseOmarchyColorTable(stdout: string): Record<string, string> {
  const colors: Record<string, string> = {}

  for (const line of stdout.split('\n')) {
    const tab = line.indexOf('\t')

    if (tab <= 0) {
      continue
    }

    const key = line.slice(0, tab).trim()
    const value = line.slice(tab + 1).trim()

    if (key && value) {
      colors[key] = value
    }
  }

  return colors
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/

/** Relative luminance of a #rrggbb color (0–1). */
function relativeLuminance(hex: string): number {
  const n = (i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
  // sRGB → linear, then Rec. 709 luma.
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const [r, g, b] = [n(0), n(1), n(2)].map(lin)

  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2.x contrast ratio between two #rrggbb colors. */
function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]

  return (hi + 0.05) / (lo + 0.05)
}

// The two fixed foreground candidates — keep in sync with the duplicated
// helper in src/app/bot-product/omarchy-theme.ts (separate tsconfigs).
const FG_DARK = '#0d0d0e'
const FG_LIGHT = '#fcfcfc'

/** Contrast-derived foreground for text/icons on an accent fill: the fixed
 *  candidate with the HIGHER ratio against the accent wins. Replaces an
 *  earlier luminance-threshold pick, which flipped at mid-luminance accents
 *  (#89b4fa chose near-white at 2.05:1 when near-black gives 9.23:1) and
 *  trusted themes' selection_foreground (tuned for selection_background,
 *  not for the accent) — review F3. */
export function contrastForegroundFor(accent: string): string {
  return contrastRatio(accent, FG_DARK) >= contrastRatio(accent, FG_LIGHT) ? FG_DARK : FG_LIGHT
}

/**
 * Distill a resolved Omarchy palette into garnish tokens.
 *
 * `accent` is the semantic key every current theme defines. For robustness
 * against raw/legacy tables the fallback chain interleaves the semantic and
 * ANSI spellings of the same hues (mirroring omarchy-theme-color's alias
 * cascade: blue ≙ color4, magenta ≙ color5, foreground ≙ color7). The
 * contrast foreground is DERIVED from the validated accent (WCAG ratio
 * comparison against fixed near-black/near-white candidates) — never taken
 * from `selection_foreground`, which themes tune for their selection
 * background, not for the accent (review F3). Returns null when nothing
 * usable resolved — callers keep their previous/fallback palette rather than
 * painting an unvalidated string.
 */
export function pickOmarchyGarnishTokens(
  colors: Record<string, string>,
  themeName: string
): OmarchyGarnishTokens | null {
  const accent =
    [
      colors.accent,
      colors.blue,
      colors.color4,
      colors.magenta,
      colors.color5,
      colors.foreground,
      colors.color7
    ].find(v => typeof v === 'string' && HEX_RE.test(v)) ?? null

  if (!accent) {
    return null
  }

  return { accent, accentForeground: contrastForegroundFor(accent), themeName }
}

export interface OmarchyThemePaths {
  /** `~/.local/state/omarchy/current` — `theme set` rm -rf's + mv's `theme/` inside it. */
  currentDir: string
  /** `~/.local/state/omarchy/current/theme.name` — display name of the active theme. */
  themeNameFile: string
}

export function omarchyThemePaths(homeDir: string): OmarchyThemePaths {
  return {
    currentDir: `${homeDir}/.local/state/omarchy/current`,
    themeNameFile: `${homeDir}/.local/state/omarchy/current/theme.name`
  }
}

export interface ExecFileLike {
  (file: string, args: string[], options: { timeout: number }, callback: (err: Error | null, stdout: string) => void): void
}

export interface ReadFileLike {
  (path: string, encoding: 'utf-8'): string
}

export interface ExistsLike {
  (path: string): boolean
}

/**
 * Resolve the active theme once. Shells out to `omarchy-theme-color --all` so
 * Botmarchy sees the exact palette every other Omarchy consumer resolves
 * (alias cascade, derived shades, legacy ANSI names included). Any failure —
 * no Omarchy, no theme, resolver error, non-hex garbage — is a plain null so
 * the renderer keeps its built-in dark garnish.
 */
export function resolveOmarchyThemeTokens(
  deps: { execFile: ExecFileLike; readFile: ReadFileLike; exists: ExistsLike; paths: OmarchyThemePaths },
  callback: (tokens: OmarchyGarnishTokens | null) => void
): void {
  if (!deps.exists(deps.paths.currentDir)) {
    callback(null)

    return
  }

  deps.execFile(
    'omarchy-theme-color',
    ['--all'],
    { timeout: 2500 },
    (err, stdout) => {
      if (err) {
        callback(null)

        return
      }

      let themeName = 'Omarchy'

      try {
        const raw = deps.readFile(deps.paths.themeNameFile, 'utf-8').trim()

        if (raw) {
          themeName = raw
        }
      } catch {
        // Name is cosmetic; the palette still resolves.
      }

      callback(pickOmarchyGarnishTokens(parseOmarchyColorTable(stdout), themeName))
    }
  )
}

export interface WatchLike {
  (dir: string, listener: (event: string, filename: string | null) => void): { close: () => void }
}

/**
 * Watch for theme switches. `omarchy theme set` REPLACES the `theme/`
 * directory (rm -rf + mv), so watching `colors.toml` itself dies with its
 * inode — the watch must sit on `current/` and listen for `theme` renames.
 * Debounced: theme-set is a flurry of writes; one re-resolve per settle.
 */
export function watchOmarchyThemeDir(
  deps: { watch: WatchLike; paths: OmarchyThemePaths; debounceMs?: number; onTrigger: () => void }
): { close: () => void } | null {
  const debounceMs = deps.debounceMs ?? 300
  let timer: ReturnType<typeof setTimeout> | null = null
  let watcher: { close: () => void } | null = null

  try {
    watcher = deps.watch(deps.paths.currentDir, (event, filename) => {
      // The theme dir swap surfaces as rename events naming `theme`; be
      // liberal (filename can be null on some platforms) — an occasional
      // spurious re-resolve is cheap, a missed switch is the bug.
      if (filename !== null && filename !== 'theme' && filename !== 'theme.name' && filename !== 'theme.name.tmp') {
        return
      }

      if (timer) {
        clearTimeout(timer)
      }

      timer = setTimeout(() => {
        timer = null
        deps.onTrigger()
      }, debounceMs)
    })
  } catch {
    return null
  }

  return {
    close: () => {
      if (timer) {
        clearTimeout(timer)
      }

      watcher?.close()
    }
  }
}

export interface OmarchyThemeService {
  getTokens(): OmarchyGarnishTokens | null
  start(): void
  stop(): void
}

/**
 * Long-running garnish source: resolve at start, re-resolve on theme switches,
 * hand fresh tokens to `onUpdate` (which broadcasts to renderer windows).
 * Pure DI — main.ts supplies execFile/fs/electron primitives.
 *
 * Lifecycle (review F6): `start()` is idempotent (duplicate calls are
 * no-ops) and a stopped service never restarts. Resolves carry a monotonic
 * generation (review F4) so an overlapping slower resolve that completes
 * late is discarded instead of broadcasting a stale accent.
 */
export function createOmarchyThemeService(deps: {
  execFile: ExecFileLike
  readFile: ReadFileLike
  exists: ExistsLike
  watch: WatchLike
  paths: OmarchyThemePaths
  /** Watch debounce override (tests); defaults to 300ms. */
  watchDebounceMs?: number
  log?: (message: string) => void
  onUpdate: (tokens: OmarchyGarnishTokens | null) => void
}): OmarchyThemeService {
  let tokens: OmarchyGarnishTokens | null = null
  let watcher: { close: () => void } | null = null
  let stopped = false
  let started = false
  let resolveGeneration = 0
  let announcedUnavailable = false

  const resolve = () => {
    if (stopped || !started) {
      return
    }

    const generation = ++resolveGeneration

    resolveOmarchyThemeTokens(deps, next => {
      if (stopped || !started || generation !== resolveGeneration) {
        return
      }

      if (!next) {
        // First miss tells the renderer to fall back to the built-in garnish;
        // a miss AFTER a hit keeps serving the last resolved palette (the
        // watch can fire mid-swap, before the new colors.toml lands).
        if (tokens) {
          deps.log?.('[omarchy-theme] re-resolve missed (mid-swap?) — keeping last palette')
        } else if (!announcedUnavailable) {
          announcedUnavailable = true
          deps.log?.('[omarchy-theme] no Omarchy theme resolvable — renderer keeps built-in garnish')
          deps.onUpdate(null)
        }

        return
      }

      const changed = tokens?.accent !== next.accent
      tokens = next

      if (changed) {
        deps.log?.(`[omarchy-theme] active theme "${next.themeName}" — accent ${next.accent}`)
      }

      deps.onUpdate(next)
    })
  }

  return {
    getTokens: () => tokens,
    start: () => {
      if (stopped || started) {
        return
      }

      started = true
      resolve()
      watcher = watchOmarchyThemeDir({
        watch: deps.watch,
        paths: deps.paths,
        debounceMs: deps.watchDebounceMs,
        onTrigger: resolve
      })

      if (!watcher) {
        deps.log?.('[omarchy-theme] watch unavailable — theme changes need an app restart')
      }
    },
    stop: () => {
      stopped = true
      started = false
      watcher?.close()
      watcher = null
    }
  }
}
