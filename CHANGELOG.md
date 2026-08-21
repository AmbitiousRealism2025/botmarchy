# Changelog

## v0.1.0 — 2026-08-21

The first release that is **Botmarchy** rather than renamed korgo:
a local Hermes bot GUI for Omarchy. Dark-only, Omarchy theme-aware,
self-hosted over SSH, no cloud service involved. See `docs/CHARTER.md`
for the product definition this release cuts against.

### Product

- **Two-choice onboarding** — "This machine" or "Another computer I own".
  The self-hosted SSH step (test-first connect, peer-reviewed parsing) is a
  primary path; back always returns to the home choice. Legacy Orgo/tailscale
  wizard states remap to the home choice so removed screens never resurrect.
- **Orgo Computer rail removed** from the bot UI — the bot SKU's right rail
  is routines (agent cron). The generic Hermes SKU keeps its Orgo pane,
  unchanged from lineage, so upstream merges stay clean.
- **Dark-only base + Omarchy theme garnish** — the app reads the desktop's
  active Omarchy theme (via Omarchy's own resolver) and paints its accent on
  selection, focus rings, active roster rows, and primary buttons. Theme
  switches are picked up live. No light mode is reachable from any surface.
- **Copy sweep** — gateway/machine language throughout ("this Mac" →
  "this machine", "cloud runtime" → "gateway"); release-notes link points at
  this fork.
- **Linux packaging** — `dist:bot:linux` builds the Botmarchy AppImage
  (AppImage, desktop entry, install stamp). First release built and verified
  on Arch/Omarchy.
- **Muster installable** — the Omarchy bar widget ships as a standalone
  plugin repo, installable with
  `omarchy plugin add https://github.com/AmbitiousRealism2025/botmarchy-muster.git`:
  manifest, roster panel, client scripts, gateway snapshot script, installer.

### Lineage & credit

Botmarchy is a hard fork with two upstream lineages, and this release stands
on both:

- **[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)**
  — the agent core: the Python runtime, gateway, provider stack, skills and
  plugin systems. The transport/gateway/runtime code in this tree remains
  close to that lineage by design (see the charter's discipline budget), and
  attribution notices are preserved in `NOTICE.md`.
- **[nickvasilescu/korgo-bot](https://github.com/nickvasilescu/korgo-bot)** —
  the desktop product this fork forked from: the Electron + React shell, bot
  roster UI, and the Mac-first packaging this release ports to Linux.

`v0.1.0-base` (2e483a9) marks the charter baseline — the last commit before
the charter-driven product work began. The actual fork point from korgo-bot
is `e2b60fb` (the pre-fork `main`); 18 charter commits sit between the two.
