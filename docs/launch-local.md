# Launching Korgo Bot dev on this ThinkPad

bb (and any Electron-based parent process) exports `ELECTRON_RUN_AS_NODE=1`.
If that leaks into the dev-server environment, the Electron binary boots as
plain Node and the app dies with:

```
SyntaxError: The requested module 'electron' does not provide an export named 'BrowserWindow'
```

(Notice the tell: the crash reports "Node.js v24.18.1" — Electron's
embedded node, not the system one.)

Always launch through the wrapper that strips it:

```bash
scripts/dev/launch-local.sh (repo root)        # logs to /tmp/korgo-dev.log
```

or inline:

```bash
env -u ELECTRON_RUN_AS_NODE npm --workspace apps/desktop run dev:bot
```

Keep `ELECTRON_OZONE_PLATFORM_HINT=wayland` (inherited from the Hyprland
session) — it gets native Wayland instead of XWayland.
