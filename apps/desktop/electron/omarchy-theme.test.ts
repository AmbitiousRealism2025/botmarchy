import assert from 'node:assert/strict'

import { test } from 'vitest'

import {
  createOmarchyThemeService,
  omarchyThemePaths,
  parseOmarchyColorTable,
  pickOmarchyGarnishTokens,
  resolveOmarchyThemeTokens,
  watchOmarchyThemeDir
} from './omarchy-theme'

const paths = omarchyThemePaths('/home/test')

/** Aether-style semantic palette (what the live ThinkPad theme emits). */
const AETHER_TABLE = [
  'mode\tdark',
  'accent\t#8d5312',
  'selection_foreground\t#050A13',
  'foreground\t#feb734',
  'background\t#080b14'
].join('\n')

/** Legacy ANSI-only palette — no semantic names at all. */
const ANSI_TABLE = ['color0\t#1a1b26', 'color4\t#7aa2f7', 'color5\t#bb9af7', 'color7\t#a9b1d6'].join('\n')

function fakeExec(stdout: string, opts: { fail?: boolean } = {}) {
  return (_file: string, _args: string[], _options: unknown, callback: (err: Error | null, out: string) => void) => {
    if (opts.fail) {
      callback(new Error('spawn ENOENT'), '')

      return
    }

    callback(null, stdout)
  }
}

test('parseOmarchyColorTable reads the resolver key<TAB>value output', () => {
  const colors = parseOmarchyColorTable(AETHER_TABLE)

  assert.equal(colors.accent, '#8d5312')
  assert.equal(colors.selection_foreground, '#050A13')
  assert.equal(colors.mode, 'dark')
})

test('parseOmarchyColorTable ignores blank and malformed lines', () => {
  const colors = parseOmarchyColorTable('\nnoise without a tab\naccent\t#89b4fa\n\n')

  assert.deepEqual(Object.keys(colors), ['accent'])
})

test('pickOmarchyGarnishTokens takes the semantic accent and its tuned contrast pair', () => {
  const tokens = pickOmarchyGarnishTokens(parseOmarchyColorTable(AETHER_TABLE), 'Aether')

  assert.ok(tokens)
  assert.equal(tokens.accent, '#8d5312')
  assert.equal(tokens.accentForeground, '#050A13')
  assert.equal(tokens.themeName, 'Aether')
})

test('pickOmarchyGarnishTokens falls back blue → magenta → foreground for ANSI-only themes', () => {
  const ansi = pickOmarchyGarnishTokens(parseOmarchyColorTable(ANSI_TABLE), 'Legacy')

  assert.ok(ansi)
  assert.equal(ansi.accent, '#7aa2f7')

  const brighter = pickOmarchyGarnishTokens({ color5: '#bb9af7' }, 'Legacy')
  assert.equal(brighter?.accent, '#bb9af7')

  const last = pickOmarchyGarnishTokens({ foreground: '#cdd6f4' }, 'Legacy')
  assert.equal(last?.accent, '#cdd6f4')
})

test('pickOmarchyGarnishTokens picks contrast from luminance when the theme has no selection pair', () => {
  // Bright accent → dark text; near-black accent → light text.
  assert.equal(pickOmarchyGarnishTokens({ accent: '#ffd24a' }, 'T')?.accentForeground, '#0d0d0e')
  assert.equal(pickOmarchyGarnishTokens({ accent: '#101014' }, 'T')?.accentForeground, '#fcfcfc')
})

test('pickOmarchyGarnishTokens rejects tables with nothing paintable', () => {
  assert.equal(pickOmarchyGarnishTokens({}, 'T'), null)
  assert.equal(pickOmarchyGarnishTokens({ accent: 'rgb(1 2 3)' }, 'T'), null)
  assert.equal(pickOmarchyGarnishTokens({ accent: '#xyz123' }, 'T'), null)
})

test('resolveOmarchyThemeTokens shells the resolver and reads the theme name', () => {
  resolveOmarchyThemeTokens(
    {
      execFile: fakeExec(AETHER_TABLE),
      readFile: () => 'midnight road with distant aether\n',
      exists: () => true,
      paths
    },
    tokens => {
      assert.ok(tokens)
      assert.equal(tokens.themeName, 'midnight road with distant aether')
      assert.equal(tokens.accent, '#8d5312')
    }
  )
})

test('resolveOmarchyThemeTokens is null without Omarchy state, on resolver failure, or garbage output', () => {
  const cases: Array<{ exists: boolean; stdout: string; fail?: boolean }> = [
    { exists: false, stdout: '' }, // non-Omarchy host
    { exists: true, stdout: '', fail: true }, // resolver missing / crashed
    { exists: true, stdout: 'definitely\t#notaColor' } // unpaintable table
  ]

  for (const c of cases) {
    resolveOmarchyThemeTokens(
      {
        execFile: fakeExec(c.stdout, { fail: c.fail }),
        readFile: () => '',
        exists: () => c.exists,
        paths
      },
      tokens => assert.equal(tokens, null)
    )
  }
})

test('watchOmarchyThemeDir re-fires on the theme-dir swap (rename), debounced', async () => {
  const fired: number[] = []
  let listener: ((event: string, filename: string | null) => void) | null = null

  const watcher = watchOmarchyThemeDir({
    watch: (_dir, l) => {
      listener = l

      return { close: () => undefined }
    },
    paths,
    debounceMs: 5,
    onTrigger: () => fired.push(Date.now())
  })

  assert.ok(watcher)
  assert.ok(listener)

  // `omarchy theme set` = rm -rf + mv → rename events naming `theme`.
  listener('rename', 'theme')
  listener('rename', 'theme')
  listener('rename', 'background')

  await new Promise(resolve => setTimeout(resolve, 30))

  assert.equal(fired.length, 1, 'two swaps inside the debounce window collapse into one re-resolve')

  listener('rename', 'theme')
  await new Promise(resolve => setTimeout(resolve, 30))
  assert.equal(fired.length, 2)

  watcher.close()
})

test('watchOmarchyThemeDir ignores unrelated files', async () => {
  let fired = 0
  let listener: ((event: string, filename: string | null) => void) | null = null

  watchOmarchyThemeDir({
    watch: (_dir, l) => {
      listener = l

      return { close: () => undefined }
    },
    paths,
    debounceMs: 5,
    onTrigger: () => fired++
  })

  listener?.('change', 'shell.json')
  listener?.('rename', 'background')

  await new Promise(resolve => setTimeout(resolve, 30))
  assert.equal(fired, 0)
})

test('watchOmarchyThemeDir survives an unwatchable directory', () => {
  const watcher = watchOmarchyThemeDir({
    watch: () => {
      throw new Error('ENOENT')
    },
    paths,
    onTrigger: () => undefined
  })

  assert.equal(watcher, null)
})

test('createOmarchyThemeService: resolve → broadcast, swap → rebroadcast, miss → keep last', () => {
  const updates: Array<{ accent: string } | null> = []
  const logs: string[] = []
  let table = AETHER_TABLE
  let fail = false

  const service = createOmarchyThemeService({
    execFile: (_f, _a, _o, cb) => {
      if (fail) {
        cb(new Error('boom'), '')
      } else {
        cb(null, table)
      }
    },
    readFile: () => 'aether\n',
    exists: () => true,
    watch: () => ({ close: () => undefined }),
    paths,
    log: message => logs.push(message),
    onUpdate: tokens => updates.push(tokens ? { accent: tokens.accent } : null)
  })

  service.start()

  assert.deepEqual(updates, [{ accent: '#8d5312' }], 'start resolves and broadcasts once')
  assert.ok(logs.some(l => l.includes('aether')), 'the active theme is logged')

  // Theme switch: new accent broadcast; the transient miss between the two
  // (mid-swap watch tick, resolver unavailable) keeps the last good palette
  // instead of blanking the garnish.
  fail = true
  service.start()
  assert.deepEqual(updates, [{ accent: '#8d5312' }], 'failed re-resolve keeps last tokens')

  table = 'accent\t#89b4fa\nselection_foreground\t#cdd6f4\n'
  fail = false
  service.start()
  assert.deepEqual(updates, [
    { accent: '#8d5312' },
    { accent: '#89b4fa' }
  ])
})
