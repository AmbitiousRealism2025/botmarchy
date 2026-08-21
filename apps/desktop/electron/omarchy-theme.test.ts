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

test('pickOmarchyGarnishTokens takes the semantic accent and DERIVES its contrast foreground', () => {
  const tokens = pickOmarchyGarnishTokens(parseOmarchyColorTable(AETHER_TABLE), 'Aether')

  assert.ok(tokens)
  assert.equal(tokens.accent, '#8d5312')
  // #8d5312's selection_foreground (#050A13) is tuned for the selection
  // background, not the accent (3.19:1). The derived near-white candidate
  // is the higher-ratio choice — review F3.
  assert.equal(tokens.accentForeground, '#fcfcfc')
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

test('pickOmarchyGarnishTokens derives the higher-ratio foreground across the luminance range', () => {
  // Bright accent → dark text; near-black accent → light text; and the
  // mid-luminance case the old threshold flipped on: #89b4fa is near-white
  // at 2.05:1 but near-black at 9.23:1 (review F3).
  assert.equal(pickOmarchyGarnishTokens({ accent: '#ffd24a' }, 'T')?.accentForeground, '#0d0d0e')
  assert.equal(pickOmarchyGarnishTokens({ accent: '#89b4fa' }, 'T')?.accentForeground, '#0d0d0e')
  assert.equal(pickOmarchyGarnishTokens({ accent: '#8d5312' }, 'T')?.accentForeground, '#fcfcfc')
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

test('createOmarchyThemeService: resolve → broadcast, swap → rebroadcast, miss → keep last', async () => {
  const updates: Array<{ accent: string } | null> = []
  const logs: string[] = []
  let table = AETHER_TABLE
  let fail = false
  let watchListener: ((event: string, filename: string | null) => void) | null = null

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
    watch: (_dir, l) => {
      watchListener = l

      return { close: () => undefined }
    },
    paths,
    watchDebounceMs: 0,
    log: message => logs.push(message),
    onUpdate: tokens => updates.push(tokens ? { accent: tokens.accent } : null)
  })

  service.start()

  assert.deepEqual(updates, [{ accent: '#8d5312' }], 'start resolves and broadcasts once')
  assert.ok(logs.some(l => l.includes('aether')), 'the active theme is logged')

  // Re-resolves fire through the watch listener (the real trigger), never by
  // re-calling start() — which is now a no-op after the first call. The
  // watcher debounces via setTimeout, so each swap needs a tick.
  const swap = async () => {
    watchListener?.('rename', 'theme')
    await new Promise(resolve => setTimeout(resolve, 5))
  }

  fail = true
  await swap()
  assert.deepEqual(updates, [{ accent: '#8d5312' }], 'failed re-resolve (mid-swap) keeps last tokens')

  table = 'accent\t#89b4fa\nselection_foreground\t#cdd6f4\n'
  fail = false
  await swap()
  assert.deepEqual(updates, [{ accent: '#8d5312' }, { accent: '#89b4fa' }])
})

test('createOmarchyThemeService discards an overlapping resolve that completes late', async () => {
  // Deferred execFile callbacks let us complete resolves out of order:
  // resolve A (slow, old accent) must NOT overwrite resolve B (newer).
  const pending: Array<(err: Error | null, stdout: string) => void> = []
  const updates: Array<string | null> = []
  let watchListener: ((event: string, filename: string | null) => void) | null = null

  const service = createOmarchyThemeService({
    execFile: (_f, _a, _o, cb) => pending.push(cb),
    readFile: () => 't\n',
    exists: () => true,
    watch: (_dir, l) => {
      watchListener = l

      return { close: () => undefined }
    },
    paths,
    watchDebounceMs: 0,
    onUpdate: tokens => updates.push(tokens?.accent ?? null)
  })

  service.start() // resolve A enqueued
  watchListener?.('rename', 'theme') // resolve B enqueued (after the debounce tick)
  await new Promise(resolve => setTimeout(resolve, 5))

  assert.equal(pending.length, 2)
  assert.deepEqual(updates, [], 'nothing broadcast until a callback lands')

  // B (newer) completes FIRST, then A (older/slower) lands late.
  pending[1](null, 'accent\t#89b4fa\n')
  pending[0](null, 'accent\t#8d5312\n')

  assert.deepEqual(updates, ['#89b4fa'], 'the stale late resolve is discarded (review F4)')
})

test('createOmarchyThemeService lifecycle: start is idempotent, stop kills watchers and work', async () => {
  const pending: Array<(err: Error | null, stdout: string) => void> = []
  let watches = 0
  let closed = 0

  const service = createOmarchyThemeService({
    execFile: (_f, _a, _o, cb) => pending.push(cb),
    readFile: () => 't\n',
    exists: () => true,
    watch: () => {
      watches++

      return { close: () => closed++ }
    },
    paths,
    onUpdate: () => undefined
  })

  service.start()
  service.start() // duplicate — must not leak a second watcher
  assert.equal(watches, 1, 'duplicate start creates no second watcher')

  service.stop()
  assert.equal(closed, 1)

  // After stop: a late resolve callback is discarded, and restart is refused.
  service.start()
  assert.equal(watches, 1, 'a stopped service never restarts')

  pending[0](null, AETHER_TABLE)
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(service.getTokens(), null, 'stop() discards in-flight resolve work')
})
