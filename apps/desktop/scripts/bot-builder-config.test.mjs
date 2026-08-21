import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'vitest'

/**
 * Release-config invariants (PB-7 review): the bot SKU's electron-builder
 * overrides live in electron-builder.bot.config.cjs — an OBJECT, because
 * `-c.*` CLI strings can't carry arrays and silently mis-nest schema paths
 * (the F1 blocker: `linux.desktop.StartupWMClass` is schema-invalid in
 * 26.x; only `linux.desktop.entry.*` exists). These tests pin the shapes
 * that made a clean release build fail before.
 */

const desktopRoot = path.resolve(import.meta.dirname, '..')
const repoRoot = path.resolve(desktopRoot, '..', '..')

test('bot builder config nests desktop-entry fields under desktop.entry (26.x schema)', async () => {
  const config = (await import(path.join(desktopRoot, 'electron-builder.bot.config.cjs'))).default

  assert.equal(config.appId, 'dev.botmarchy.Botmarchy')
  assert.equal(config.productName, 'Botmarchy')
  assert.equal(config.executableName, 'Botmarchy')

  // The exact schema shape that was wrong at the `desktop` level.
  assert.deepEqual(Object.keys(config.linux.desktop), ['entry'])
  assert.equal(config.linux.desktop.entry.StartupWMClass, 'hermes')

  // Array values (impossible via -c CLI strings) must survive as arrays.
  assert.deepEqual(config.linux.executableArgs, [])

  // The desktop entry Comment comes from linux.description (it overrides
  // desktop.entry.Comment in 26.x — LinuxTargetHelper.getDescription).
  assert.equal(config.linux.description, 'Your local bot court for Omarchy')

  // A config OBJECT replaces package.json's build source entirely — every
  // key the generic build relies on must survive the spread.
  const pkg = JSON.parse(fs.readFileSync(path.join(desktopRoot, 'package.json'), 'utf8'))
  for (const key of Object.keys(pkg.build)) {
    assert.ok(key in config, `bot config lost build key: ${key}`)
  }
})

test('workspace manifest and lockfile agree on the desktop version', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(desktopRoot, 'package.json'), 'utf8'))
  const lock = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf8'))
  const locked = lock.packages?.['apps/desktop']?.version

  assert.equal(locked, pkg.version, 'run: npm install (or hand-sync the lock entry) after bumping apps/desktop')
})
