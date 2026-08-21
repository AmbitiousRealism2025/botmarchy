/**
 * Bot-build Content-Security-Policy (composite review P2.3).
 *
 * The renderer displays untrusted model output; sanitizer correctness was
 * the ONLY thing standing between an escape and renderer XSS (and the
 * preload turns that into local RCE — see the review's P1.1/P1.2 chain).
 * This builds a restrictive meta CSP injected ONLY into bot production
 * builds (vite plugin in vite.config.ts consumes botCspFor).
 *
 * Notable choices:
 *  - Scripts: 'self' + build-time sha256 hashes of the index.html inline
 *    scripts (the pre-paint script) — never 'unsafe-inline'. The hash is
 *    computed AFTER vite's %VITE_% replacement, so it pins the exact bytes
 *    that ship.
 *  - connect-src: loopback only. The bot SKU's two modes are local and SSH
 *    (both reach the gateway on 127.0.0.1 — the SSH path through a tunnel),
 *    and main now enforces that (P2.5); the CSP is the renderer-side
 *    backstop.
 *  - style-src 'unsafe-inline': the app styles via CSS custom properties and
 *    style attributes broadly; styles are not the XSS vector class CSP
 *    exists for here.
 *  - object-src 'none' / base-uri 'none': nothing legitimate uses them.
 */
import { createHash } from 'node:crypto'

export const BOT_CSP_DIRECTIVES = [
  "default-src 'self'",
  // script hashes appended per-build by botCspFor()
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* http://localhost:* ws://localhost:*",
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "frame-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'none'"
]

/** sha256 hash of an inline script body, in CSP source-list form. */
export function cspHashFor(scriptBody: string): string {
  return `'sha256-${createHash('sha256').update(scriptBody, 'utf8').digest('base64')}'`
}

/** Extract inline <script> bodies (no src attribute) from an HTML document. */
export function inlineScriptBodies(html: string): string[] {
  const bodies: string[] = []
  const pattern = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null

  while ((match = pattern.exec(html)) !== null) {
    bodies.push(match[1])
  }

  return bodies
}

/** Build the full CSP policy string for a rendered index.html. */
export function botCspFor(html: string): string {
  const hashes = inlineScriptBodies(html).map(cspHashFor)
  const scriptSrc = ["script-src 'self'", ...hashes].join(' ')

  return [scriptSrc, ...BOT_CSP_DIRECTIVES.filter(d => !d.startsWith('script-src'))].join('; ')
}

/** Inject the CSP meta as the first element of <head>. Idempotent. */
export function injectBotCsp(html: string): string {
  if (html.includes('http-equiv="Content-Security-Policy"')) {
    return html
  }

  const csp = botCspFor(html)

  return html.replace(/<head([^>]*)>/i, (head: string) => `${head}\n    <meta http-equiv="Content-Security-Policy" content="${csp.replace(/"/g, '&quot;')}" />`)
}
