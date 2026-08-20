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

## 2. Install Hermes pinned to korgo's ref (10–15 min)

Recommended: root FHS layout to mirror the Orgo VM exactly, which keeps our
ThinkPad-side bootstrap patch at zero:

```bash
sudo curl -fsSL https://hermes-agent.nousresearch.com/install.sh \
  | sudo bash -s -- --commit ad9e8c9b574ec6937cc09d8901ca83a769225963
```

(A user-local install under `~` also works if you'd rather avoid root; our
patch would then point at the user paths instead. Root-FHS is chosen to
minimize divergence from what the broker already knows how to drive.)

## 3. Verify the install (1 min)

```bash
hermes --version
hermes serve --help | grep -E "ssh-session-token-file|ssh-owner-nonce"
```

Both flags must appear — that's the broker's compatibility gate.

## 4. Run the gateway at boot (5 min)

Create `/etc/systemd/system/hermes-gateway.service`:

```ini
[Unit]
Description=Hermes gateway for Korgo Bot
After=network-online.target

[Service]
ExecStart=/usr/local/bin/hermes serve
Restart=on-failure
# korgo's remote path supplies session-token flags at connect time

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now hermes-gateway
```

Verify it's listening (default port 9119):

```bash
ss -tlnp | grep 9119
```

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
