/**
 * Botmarchy Omarchy garnish (PB-6, charter design principle 2).
 *
 * Dark-only base + theme garnish: the app keeps its fixed dark palette for
 * every surface, and paints the desktop's active Omarchy accent onto the
 * states that say "this window belongs here" — text selection, focus rings,
 * active roster rows, primary buttons. Never a full re-theme.
 *
 * Token flow: electron/omarchy-theme.ts resolves the theme (Omarchy's own
 * resolver) → preload `hermesDesktop.omarchyTheme` → this module stores the
 * tokens and applies them as `--botmarchy-*` custom properties plus a tight
 * set of derived overrides. themes/context.tsx re-applies the garnish after
 * every theme application, so skin/mode switches can't clobber it.
 */

import { isBotProduct } from '@/lib/product'

export interface OmarchyGarnishTokens {
  accent: string
  accentForeground: string
  themeName: string
}

/** Built-in garnish when no Omarchy theme resolves (non-Omarchy hosts, dev on
 *  other OSes): Botmarchy gold, matching the app's existing selection tint. */
export const FALLBACK_GARNISH: OmarchyGarnishTokens = {
  accent: '#ffd24a',
  accentForeground: '#1a1205',
  themeName: 'Botmarchy'
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/

function relativeLuminance(hex: string): number {
  const n = (i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const [r, g, b] = [n(0), n(1), n(2)].map(lin)

  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]

  return (hi + 0.05) / (lo + 0.05)
}

// Keep in sync with the duplicated helper in electron/omarchy-theme.ts
// (separate tsconfigs — see review F3).
const FG_DARK = '#0d0d0e'
const FG_LIGHT = '#fcfcfc'

/** Contrast-derived foreground for the accent — same math as the main
 *  process picker, applied at the IPC trust boundary to REPAIR an absent or
 *  invalid incoming pair (never trust a stale/foreign foreground). */
export function contrastForegroundFor(accent: string): string {
  return contrastRatio(accent, FG_DARK) >= contrastRatio(accent, FG_LIGHT) ? FG_DARK : FG_LIGHT
}

/** Garnish-level application: raw tokens + the derived overrides. The derived
 *  set is deliberately tiny — everything else keeps the fixed dark palette.
 *  themeName stays in module state only (never a CSS custom property — no
 *  consumer, and unsanitized text has no business in the CSSOM; review F7). */
const GARNISH_RAW: Record<string, (t: OmarchyGarnishTokens) => string> = {
  '--botmarchy-accent': t => t.accent,
  '--botmarchy-accent-foreground': t => t.accentForeground
}

const GARNISH_DERIVED: Record<string, string> = {
  // Primary buttons.
  '--dt-primary': 'var(--botmarchy-accent)',
  '--dt-primary-foreground': 'var(--botmarchy-accent-foreground)',
  // Focus rings.
  '--dt-ring': 'var(--botmarchy-accent)',
  // Text selection.
  '--ui-selection-background': 'color-mix(in srgb, var(--botmarchy-accent) 45%, transparent)',
  // Active roster rows / active controls (roster selected bot, active pills).
  '--ui-row-active-background': 'color-mix(in srgb, var(--botmarchy-accent) 16%, transparent)',
  '--ui-control-active-background': 'color-mix(in srgb, var(--botmarchy-accent) 16%, transparent)'
}

export const GARNISH_PROPERTIES = [...Object.keys(GARNISH_RAW), ...Object.keys(GARNISH_DERIVED)]

let current: OmarchyGarnishTokens = FALLBACK_GARNISH
let bridgeStarted = false

/** Validate untrusted (IPC-origin) tokens; null when they'd paint garbage.
 *  An absent/invalid accentForeground is REPAIRED from the accent (contrast
 *  math) rather than trusted or defaulted to one fixed color (review F3). */
export function sanitizeOmarchyGarnishTokens(input: unknown): OmarchyGarnishTokens | null {
  if (!input || typeof input !== 'object') {
    return null
  }

  const { accent, accentForeground, themeName } = input as Record<string, unknown>

  if (typeof accent !== 'string' || !HEX_RE.test(accent)) {
    return null
  }

  return {
    accent,
    accentForeground:
      typeof accentForeground === 'string' && HEX_RE.test(accentForeground)
        ? accentForeground
        : contrastForegroundFor(accent),
    themeName: typeof themeName === 'string' && themeName ? themeName : 'Omarchy'
  }
}

/** Paint the garnish onto a root (idempotent; called after every applyTheme). */
export function applyBotmarchyGarnish(root: { style: Pick<CSSStyleDeclaration, 'setProperty'> } = document.documentElement) {
  for (const [key, value] of Object.entries(GARNISH_RAW)) {
    root.style.setProperty(key, value(current))
  }

  for (const [key, value] of Object.entries(GARNISH_DERIVED)) {
    root.style.setProperty(key, value)
  }
}

export function getOmarchyGarnishTokens(): OmarchyGarnishTokens {
  return current
}

/** Swap in new tokens (from IPC) and repaint. Invalid payloads keep the
 *  current palette — a malformed theme must never blank the accent. */
export function setOmarchyGarnishTokens(input: unknown) {
  const next = sanitizeOmarchyGarnishTokens(input)

  if (!next || next.accent === current.accent) {
    return false
  }

  current = next

  if (typeof document !== 'undefined') {
    applyBotmarchyGarnish()
  }

  return true
}

/**
 * Subscribe to the main-process theme source. Idempotent (multi-window safe:
 * every renderer imports this module through themes/context.tsx). No-op in
 * the generic Hermes SKU and where the preload surface is missing.
 */
export function initOmarchyThemeBridge() {
  if (bridgeStarted || !isBotProduct() || typeof window === 'undefined') {
    return
  }

  const bridge = window.hermesDesktop?.omarchyTheme

  if (!bridge) {
    return
  }

  bridgeStarted = true

  void bridge.get().then(tokens => {
    if (tokens) {
      setOmarchyGarnishTokens(tokens)
    }
  })

  bridge.changed(tokens => {
    if (tokens) {
      setOmarchyGarnishTokens(tokens)
    }
  })
}

/** Test-only: restore module state between test cases. */
export function __resetOmarchyGarnishForTests() {
  current = FALLBACK_GARNISH
  bridgeStarted = false
}
