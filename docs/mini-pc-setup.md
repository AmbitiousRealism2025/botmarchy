# Mini-PC prep — Hermes gateway on the Kamrui E3B (Omarchy)

Everything here happens on the mini-PC upstairs. Once done, the ThinkPad
side (Phase 2 patch in our fork) has everything it needs to connect.
No Orgo account, no VNC, no GUI login required — Hermes is a CLI service.

## 0. Facts we're relying on

- Hermes install.sh: Linux/macOS/Termux, Arch-aware (pacman for missing
  deps), `--commit SHA` pinning, root FHS layout option
  (`/usr/local/lib/hermes-agent`, `/usr/local/bin/hermes`).
- Korgo pins Hermes ref: `ad9e8c9b574ec6937cc09d8901ca83a769225963`
  (`BOT_REMOTE_HERMES_REF` in `apps/desktop/electron/orgo-broker.ts`).
- Broker compatibility probe: `hermes serve --help` must contain
  `ssh-session-token-file` and `ssh-owner-nonce`.
- Box is already on the tailnet.

## 1. SSH over the tailnet (5 min)

Omarchy ships openssh; enable it so the ThinkPad can drive the box:

```bash
sudo systemctl enable --now sshd
```

From the ThinkPad: `ssh-copy-id <user>@<mini-pc-tailscale-name>` and verify
passwordless login. (Alternative: Tailscale SSH via `tailscale up --ssh` —
fine too; our Phase 2 patch takes an explicit user/host/port either way.)

## 2. Install Hermes pinned to korgo's ref (DONE 2026-08-20)

Executed remotely from the ThinkPad over SSH (tailnet). User-local layout
(no root needed): code at `~/.hermes/hermes-agent`, command at
`~/.local/bin/hermes`, data under `~/.hermes`.

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh \
  | bash -s -- --commit ad9e8c9b574ec6937cc09d8901ca83a769225963 --skip-setup
```

`uv` was missing and installed first (user-local via astral.sh installer).
Verified: `Hermes Agent v0.20.1 (2026.8.13)` at the pinned ref; both
compat flags (`ssh-session-token-file`, `ssh-owner-nonce`) present in
`hermes serve --help`.

Note: the host is `omarchy-1` (100.83.160.47), not the stale `mini-remote`
node still visible in the tailnet.

## 4. Run the gateway at boot (DONE, one sudo step pending)

Important correction: `hermes serve` **refuses non-loopback binds** unless
auth providers are configured, and its error message prescribes the intended
architecture: bind 127.0.0.1 and tunnel in over SSH — which is exactly how
korgo-bot reaches the Orgo VM. So the service binds loopback and the
desktop app tunnels the websocket over Tailscale SSH.

Service: `~/.config/systemd/user/hermes-gateway.service`
```ini
[Unit]
Description=Hermes gateway for Korgo Bot
After=network-online.target

[Service]
Environment=PATH=/home/ambitiousrealism/.local/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=/home/ambitiousrealism/.local/bin/hermes serve --host 127.0.0.1 --port 9119
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```
State: active, listening on 127.0.0.1:9119, enabled at login.

**Pending (user, once):** `sudo loginctl enable-linger ambitiousrealism` on
omarchy-1 — otherwise the user service stops when the desktop session logs
out. With linger, it survives logout and starts at boot.

## 5. Provider credentials

Two options, pick one:

- **On the box:** run `hermes` once interactively and complete the
  Codex/Grok auth there, so the gateway has creds before the UI ever
  connects (matches how Orgo cloud mode works — provider config lives on
  the gateway host).
- **From the UI:** our Phase 2 patch may let the desktop onboarding push
  provider config over SSH the way the Orgo flow does; decide when we
  build it.

## 6. Not needed on this box

- Orgo account / API key — never
- VNC / GUI session — deferred (optional wayvnc later if we want the
  Computer drawer)
- Composio — optional, can add anytime
- Display manager autologin — Hermes is headless

## Done when

From the ThinkPad: `ssh root@<host> 'hermes --version'` works, port 9119 is
listening, and the two compatibility flags are present. Then we do the
Phase 2 patch on the ThinkPad side and point Korgo Bot at the box.
