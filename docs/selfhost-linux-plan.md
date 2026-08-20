# Korgo Bot self-hosted Linux port — working plan

Goal: run the Korgo Bot desktop app on the ThinkPad (Arch/Omarchy) with the
Hermes gateway hosted on the Kamrui mini-PC (Omarchy) over Tailscale.
The Orgo cloud computer is replaced entirely by the mini-PC. Delegated
computer-use (`orgo-agent`) is dropped; GUI work happens through Codex
computer use on whichever machine has the screen.

## Architecture

```
ThinkPad (Arch, Omarchy)          Mini-PC (Omarchy, upstairs)
┌──────────────────────┐          ┌─────────────────────────────┐
│ Korgo Bot (Electron) │──SSH/ts──▶ Hermes gateway (ws :9119)   │
│ bot roster UI        │          │ bot profiles, memory,       │
│                      │          │ sessions, MCP, cron         │
└──────────────────────┘          └─────────────────────────────┘
        Model providers (Codex / Grok) — reached from the gateway
```

## Verified facts (2026-08 exploration)

- Transport is generic: `connection-config.ts` builds `{ mode:'ssh', host }`
  and explicitly handles pasted Tailscale IPs (`100.64.x.x`) and `host:port`.
- The provisioning seam is one line: `apps/desktop/electron/main.ts:7402`
  sets `sshHost: remote.dnsName` from the Orgo-provisioned computer.
- Remote bootstrap commands in `orgo-broker.ts` are generic Linux
  (curl install.sh, git checkout of pinned ref `ad9e8c9b…`, pip install),
  aimed at a root user on the Orgo Ubuntu VM.
- Upstream Hermes desktop ships linux/win/mac: `build.linux` targets
  AppImage/deb/rpm; `hud-cursor.ts` and `bootstrap-platform.ts` contain
  maintained Linux-specific code. Only `dist:bot:*` scripts are mac-only.
- macOS gate: `scripts/setup-hermes-bots.sh:48-51` exits unless Darwin.
- Prereqs on the ThinkPad: Node 26.7 ✓, npm 12.0.2 ✓, uv 0.12.5 ✓,
  libsecret + gnome-keyring (safeStorage) ✓.
- Mini-PC (Kamrui E3B, Ryzen 7430U, 32 GB) vs Orgo VM (4 vCPU / 8 GB):
  strictly superior except datacenter uptime; workload is gateway + SQLite,
  so this is a non-issue.

## Phase 1 — local-mode run on the ThinkPad (prove the UI) — DONE 2026-08-20

Status: **app launches and runs natively on Arch/Hyprland.**

Completed:
1. ✅ Platform gate relaxed (`scripts/setup-hermes-bots.sh`), Darwin|Linux.
2. ✅ `uv sync` (pinned 3.11 env) and root `npm ci` — clean, 0 vulns.
3. ✅ `typecheck` passes on Linux.
4. ✅ `dev:bot` launches; window maps on Hyprland (class `hermes`, title
   "Korgo Bot", native Wayland via ELECTRON_OZONE_PLATFORM_HINT).

Gotchas hit (and fixes):
- bb exports `ELECTRON_RUN_AS_NODE=1`; inherited by nohup'd dev servers,
  making the Electron binary boot as plain Node (`BrowserWindow` import
  error, "Node.js v24.18.1" = Electron's embedded node). Fix: launch via
  `/tmp/korgo-dev-launch.sh` which unsets it (see docs/launch-local.md).
- `install-stamp.json` ENOENT warnings in dev mode are benign (stamps only
  exist in packaged builds).

Remaining (interactive, user): onboarding via "Use this Mac instead",
connect Codex provider, create 2 bots, verify memory across restart.

### Phase 1 UI test run — PASSED 2026-08-20 (via CDP, no manual steps)

The dev app exposes a renderer debug port (`127.0.0.1:9222`), so the UI was
driven programmatically with `scripts/dev/korgo-cdp.mjs` (screenshot / eval):

1. ✅ App booted straight into an existing roster — local mode picked up
   the pre-existing `~/.hermes` profiles: 6 bots (Master Chief,
   Quartermaster, Researcher, Codemonkey, Comms, Installer) + "The
   Avengers" group, with 4-day-old conversation history.
2. ✅ Provider auth carried over (badge: OpenAI gpt-5.6-sol) — no device
   flow needed on this machine.
3. ✅ Setup overlay dismissed via "Use this Mac instead" → "Skip remaining
   setup" (local mode persisted across restarts; the Orgo step never
   blocks the workspace).
4. ✅ Full round-trip: sent "…Reply with exactly: LANE OK" to The Avengers
   group → local gateway → GPT-5.6-sol → two bots replied "LANE OK", a
   third asked a clarifying question, fourth streamed "Writing reply…".
   Group routing + streaming indicators work.
5. ✅ Restart persistence: clean kill + relaunch → all 6 bots, model badge,
   and the LANE OK conversation intact; wizard not reshown.

Known cosmetic: the right-rail Computer drawer still offers "Orgo
connection" in local mode (harmless; will be repurposed/replaced in
Phase 2). The `install-stamp.json` ENOENT warnings are dev-mode noise.

Exit criteria: create 2 bots, group chat with @mentions, verify persistent
memory across app restarts.

## Phase 2 — gateway on the mini-PC (replace Orgo)

See `docs/mini-pc-setup.md` for the box-side checklist (verified: install.sh
is Arch-aware, `--commit` pins to korgo's ref, root FHS layout mirrors the
Orgo VM).
1. Prep the mini-PC (Omarchy):
   - Install Hermes via upstream NousResearch `install.sh` if it supports
     Arch; otherwise `uv` + pinned checkout of `ad9e8c9b…` (the ref korgo
     pins). Verify `hermes serve --help` shows `ssh-session-token-file` and
     `ssh-owner-nonce` (the broker's compatibility probe).
   - Ensure SSH over the tailnet (tailscale SSH or sshd) for a user the app
     can drive; decide root vs. sudo user.
2. Patch the seam (`main.ts` provisioning path): add a manual-host entry
   that produces the same `{mode:'ssh', host}` config the Orgo flow creates,
   persisted via `savedSsh`. Stub `createOrgoComputer`/lifecycle calls to
   no-ops (the box is always on). Guard behind a "Self-hosted" choice in
   the setup overlay so the Orgo path stays intact for rebases.
3. Remote bootstrap: run the broker's existing command set against the
   mini-PC; adapt anything Debian-flavored (paths, md5sum vs sha256,
   /usr/local/lib assumptions) as a small compatibility layer.
4. MCP entries: skip `orgo` (redundant — Hermes runs on the box) and
   `orgo-agent` (hosted service, replaced by Codex computer use).
5. Reconnect flow: verify "Connect Hermes" tunnels ws://host:9119 over
   Tailscale and that bot profiles/roster survive Mac→ThinkPad switch
   (profiles live remotely, so this should be free).

Exit criteria: ThinkPad UI driving bots whose state lives on the mini-PC;
ThinkPad reboot loses nothing; mini-PC reboot requires only gateway restart.

## Phase 3 — daily-driver packaging

1. Add `dist:bot:linux` (copy the `dist:bot:mac` pattern, AppImage target).
2. systemd user service on the mini-PC for `hermes serve`; optional
   autostart of the gateway at boot.
3. Desktop entry on the ThinkPad for the packaged app.
4. Optional (deferred): wayvnc on the mini-PC + static-cred patch to
   `orgo-desktop.ts` so the built-in Computer drawer works. The noVNC
   client itself is server-agnostic.

## Risks / watch-list

- Upstream is 2 days old and pushing daily. Keep our patch set small,
   flag-guarded, and rebase-friendly; `git fetch upstream` weekly.
- Hermes `install.sh` provenance: verify Arch support before assuming.
- npm version quirk (<11.10.0 or >=11.17.0) — we're on 12.0.2, fine.
- AGENTS.md rules to respect: never delete `~/.hermes`; never run generic
  `hermes update` against the korgo checkout; prompt-cache invariants when
  touching anything near the agent core.
- safeStorage on Linux needs the keyring unlocked in the session —
  Omarchy's gnome-keyring is present; watch for headless-launch edge cases.

## Machine inventory

| Machine | Role | Notes |
|---|---|---|
| ThinkPad | UI + daily driver | this repo runs here |
| Mini-PC (Kamrui E3B) | Hermes gateway host | Omarchy, upstairs, tailnet |
| MacBook Pro M1 Max | docked desktop | incoming; not required for this stack |
