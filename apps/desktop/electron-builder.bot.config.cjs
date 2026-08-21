/**
 * Bot SKU electron-builder config (PB-7, review remediation).
 *
 * Passing the bot identity as `-c.*` CLI strings grew into a schema bug
 * class: electron-builder 26.x's `desktop` accepts only `entry`/
 * `desktopActions` (flat keys are silently schema-invalid until a clean
 * build rejects them), and array values (`executableArgs`) cannot be passed
 * as `-c` strings at all. A config OBJECT replaces package.json's `build`
 * source entirely — hence the full spread — which also makes every override
 * inspectable and unit-testable (scripts/bot-builder-config.test.mjs).
 */

const pkg = require('./package.json')

const base = pkg.build

module.exports = {
  ...base,
  appId: 'dev.botmarchy.Botmarchy',
  productName: 'Botmarchy',
  executableName: 'Botmarchy',
  // NOTE: literal template string — electron-builder expands ${…} itself.
  artifactName: 'Botmarchy-${version}-${os}-${arch}.${ext}',
  icon: 'assets/botmarchy-icon',
  dmg: {
    ...base.dmg,
    title: 'Install Botmarchy'
  },
  mac: {
    ...base.mac,
    extendInfo: {
      ...base.mac.extendInfo,
      CFBundleDisplayName: 'Botmarchy',
      CFBundleExecutable: 'Botmarchy',
      CFBundleName: 'Botmarchy'
    }
  },
  linux: {
    ...base.linux,
    maintainer: 'AmbitiousRealism <AmbitiousRealism2025@users.noreply.github.com>',
    // `linux.description` is the knob that fills the desktop entry's Comment
    // (it deliberately overrides desktop.entry.Comment in 26.x — see
    // LinuxTargetHelper.getDescription).
    description: 'Your local bot court for Omarchy',
    synopsis: 'Local bot court for Omarchy',
    // Keep Chromium's sandbox ON: the bundled AppRun already appends
    // --no-sandbox only when unprivileged userns is unavailable. Shipping it
    // unconditionally in the entry disables the sandbox on hosts (like the
    // Omarchy target) where the AppImage runs sandboxed (review F3).
    executableArgs: [],
    desktop: {
      entry: {
        // Electron's Linux WM_CLASS comes from the npm package name
        // ("hermes"), NOT productName — StartupWMClass must match the class
        // the running window reports (verified via hyprctl on the packaged
        // build) or DEs won't associate the two.
        StartupWMClass: 'hermes'
      }
    }
  }
}
