# Changelog

## v0.1.2 — 2026-08-21

**Security + first-run remediation release.** Everything here came out of
a composite external review (three independent reviewers, deduplicated by
root cause, re-verified line-by-line against v0.1.1). All 11 release
blockers, 18 P2s, and 23 P3s addressed.

**Security / hardening**

- Packaged top-level navigation confined to the exact bundled renderer
  entry — a crafted `file:` link in bot output can no longer load local
  HTML under the privileged preload (the only finding that reached local
  code execution). Non-http(S) Markdown links render as inert text.
- The OS-notification `--exec` string is built only in the main process
  from a validated bot profile — the renderer can no longer supply a
  shell command (prefix-check injection closed).
- SSH-target validation everywhere in Muster (leading-dash/charset gate;
  live-tested against option injection), ack/engage profile validation,
  `muster.json` written via a real JSON serializer.
- Restrictive CSP in bot builds (scripts pinned by build-time sha256;
  connections loopback-only).
- Transactional apply: a changed SSH config must pass the connection
  probe in the main process before it can rehome the backend.
- Muster cache dir created before the first SSH (clean installs could
  hard-fail), 0700, atomic + source-keyed + restart-restorable cache.

**Charter enforcement**

- The Orgo shared-computer wake is deleted from SSH bootstrap (it ran
  only in the bot SKU — backwards — and log-noised every connect).
- Every bot-reachable install/update instruction names the pinned
  Botmarchy release in all four locales; upstream docs carry fork banners.
- The main-process connection resolver enforces local|ssh for the bot
  SKU (hand-edited configs can't point a bot client at an arbitrary URL).

**First-run + keyboard**

- "Create Routine" works (was a dead no-op); Esc returns to the list.
- The onboarding wizard can no longer strand at the provider step when
  "choose a provider later" is picked, nor pop over a live session later.
- Visible keyboard focus again (focus-visible outline from the theme ring
  token); the wizard is a real modal dialog (focus trap, Esc, Enter
  submits, labelled, alerts).
- The bot SKU's keybinds advertise only actions that exist; mod+j toggles
  the routines rail. Titlebar: connection chip (mode + host + health
  dot), no dead buttons, layout widths derived from what renders.

**Fixes**

- Muster staleness dimming actually engages when the gateway dies
  (non-reactive binding fixed with a heartbeat timer); clock-skew-proof.
- Usage record: per-model today numbers are tokens again (were prompt
  counts); watermark updates are race-free (flock).
- Muster follows the box the app connects to (target sync on apply);
  roster window Enter engages the chosen bot (was: plain focus).
- Provider "disconnect via terminal" no longer offered where no terminal
  exists; language switcher hidden in the en-only v1 bot SKU.
- The roster panel scrolls long courts and follows the keyboard cursor;
  reduced-motion respected by face animation; run-history failures no
  longer render as "No runs yet"; deep links survive malformed escapes.
- **OS notifications now actually fire** — the activity detector's import
  was silently unresolved in built bundles since v0.1.1 (caught by this
  release's build; export fixed).

---

## v0.1.1 — 2026-08-21

**Supersedes v0.1.0** — the v0.1.0 AppImage asset was inadvertently built
from a dirty pre-release worktree (its embedded stamp records `313c0fe`
`[DIRTY]`, not the tagged commit), and the tagged source carried the bugs
below before the peer-review pass. Use v0.1.1; v0.1.0 is kept for the
record only. Cut from a clean tag with a verified stamp.

Everything in this release came out of the codex peer-review pass over
v0.1.0's four post-merge tasks (reviews + remediation plans in the repo's
local review notes):

- **Dark-only invariant completed** (blocker): light-palette skins (VS Code
  light imports, backend skin sync) could still repaint the app light. The
  fixed dark base is now enforced at theme derivation; light-only skins are
  hidden from the bot picker; the boot pre-paint and native frame are pinned
dark.
- **Accent contrast fixed**: the garnish foreground is now derived from the
  accent by WCAG contrast comparison (the old threshold flipped at
  mid-luminance accents and trusted themes' selection_foreground).
- **Onboarding skip race fixed** (major): "Skip remaining setup" could
  complete the wizard while an SSH verification was pending and the pending
  attempt would still apply the machine config after dismissal. The skip is
gone from the self-host step and stale attempts are discarded.
- **Gateway settings match the charter**: the inherited Hermes Cloud and
generic remote-gateway connection cards no longer render in the bot SKU
(local or an owned computer over SSH — nothing else in v1).
- **Packaging repaired**: bot builder overrides moved to a config object
  (the old CLI path was schema-invalid for a clean build); the AppImage's
desktop entry no longer unconditionally disables Chromium's sandbox;
  StartupWMClass matches the window's real WM_CLASS.
- **Muster hardened**: focus-or-launch works for packaged installs; the
  installer validates before mutating and installs the gateway helper
  atomically; middle-click on the bar widget jumps to the app; the sync
  script refuses destructive runs against a diverged repo.

## v0.1.0 — 2026-08-21

The first release that is **Botmarchy** rather than renamed korgo:
a local Hermes bot GUI for Omarchy. Dark-only, Omarchy theme-aware,
self-hosted over SSH, no cloud service involved. See `docs/CHARTER.md`
for the product definition this release cuts against.

*(Superseded by v0.1.1 — see above.)*

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
