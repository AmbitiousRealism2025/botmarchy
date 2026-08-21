/**
 * Bot-build CSP builder (composite review P2.3) — real-function tests: hash
 * the actual inline script bytes, build the policy, and inject the meta.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { botCspFor, cspHashFor, injectBotCsp, inlineScriptBodies } from './bot-csp'

const INDEX_HTML = readFileSync(path.resolve(import.meta.dirname, '../index.html'), 'utf8')

describe('botCspFor', () => {
  it('pins every inline script by sha256 hash (never unsafe-inline)', () => {
    const csp = botCspFor(INDEX_HTML)

    const scriptSrc = csp.split(';').find(d => d.trim().startsWith('script-src')) || ''

    expect(scriptSrc).toContain("'self'")
    expect(scriptSrc).not.toContain('unsafe-inline')  // styles may; scripts never
    expect(csp).toMatch(/'sha256-[A-Za-z0-9+/=]{20,}'/)
    // Every inline body in the real index.html contributes exactly its hash.
    for (const body of inlineScriptBodies(INDEX_HTML)) {
      expect(csp).toContain(cspHashFor(body))
    }
  })

  it('keeps the renderer loopback-only for connections and blocks objects/base', () => {
    const csp = botCspFor(INDEX_HTML)

    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain('http://127.0.0.1:*')
    expect(csp).toContain('ws://127.0.0.1:*')
    expect(csp).not.toMatch(/connect-src[^;]*https?:\/\/(?!127\.0\.0\.1|localhost)[^;]*/)
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'none'")
  })

  it('the hash follows the script bytes — tampered content changes the hash', () => {
    expect(cspHashFor('a')).not.toBe(cspHashFor('b'))
  })
})

describe('injectBotCsp', () => {
  it('injects the meta as the first head element, idempotently', () => {
    const withCsp = injectBotCsp(INDEX_HTML)

    expect(withCsp).toMatch(/<head[^>]*>\s*<meta http-equiv="Content-Security-Policy"/)
    // Idempotent: a second pass does not duplicate the tag.
    expect(injectBotCsp(withCsp)).toBe(withCsp)
  })

  it('hashes the POST-replacement script (the bytes that actually ship)', () => {
    const replaced = INDEX_HTML.replace('%VITE_HERMES_DESKTOP_PRODUCT%', 'bot')
    const csp = botCspFor(replaced)

    for (const body of inlineScriptBodies(replaced)) {
      expect(csp).toContain(cspHashFor(body))
    }
  })
})
