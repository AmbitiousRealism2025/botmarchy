#!/usr/bin/env bash
# Botmarchy Muster — waybar module.
# Emits one waybar JSON line: {"text","tooltip","class"}.
# Polls the gateway box over ssh (ControlMaster-reused) on EVERY interval,
# with the cache as the fallback so the bar degrades gracefully when the
# box is unreachable. Unconfigured (no ssh target) → 'unknown' state.
#
# waybar config:
#   "custom/muster": {
#     "exec": "~/.local/bin/muster.sh",
#     "return-type": "json",
#     "interval": <from muster.json cadence>,
#     "on-click": "botmarchy-muster",            # roster window
#     "on-click-middle": "botmarchy-muster --jump",  # straight to Botmarchy
#     "on-click-right": "~/.local/bin/muster.sh --refresh"
#   }

set -euo pipefail

CONFIG_FILE="$HOME/.config/botmarchy/muster.json"
CACHE_FILE="${XDG_CACHE_HOME:-$HOME/.cache}/botmarchy/muster-state.json"
SSH_TIMEOUT=2
STALE_AFTER=900  # cache older than 15 min → 'unknown' state

mkdir -p "$(dirname "$CACHE_FILE")"

# Target resolution (review F4): BOTMARCHY_SSH env (explicit override) →
# muster.json's "ssh" → unconfigured. Never a hardcoded host.
resolve_target() {
  if [[ -n "${BOTMARCHY_SSH:-}" ]]; then
    printf '%s' "$BOTMARCHY_SSH"
    return
  fi

  python3 - "$CONFIG_FILE" <<'PY' 2>/dev/null || true
import json, sys
try:
    print(json.load(open(sys.argv[1])).get("ssh", ""), end="")
except Exception:
    pass
PY
}

SSH_TARGET="$(resolve_target)"

refresh() {
  [[ -n "$SSH_TARGET" ]] || return 0
  local snapshot
  if snapshot=$(ssh -o BatchMode=yes -o ConnectTimeout="$SSH_TIMEOUT" \
        "$SSH_TARGET" 'botmarchy-muster-snapshot' 2>/dev/null); then
    printf '%s' "$snapshot" > "$CACHE_FILE"
  fi
}

[[ "${1:-}" == "--refresh" ]] && { refresh; exit 0; }

# Poll on every scheduled invocation (review F2): the bounded SSH fetch is
# the point of the interval, and the cache is the FAILURE fallback for an
# unreachable box — never a substitute for polling while it IS reachable.
refresh

python3 - "$CACHE_FILE" <<'PY'
import json, sys, time

try:
    with open(sys.argv[1]) as f:
        snap = json.load(f)
except Exception:
    print(json.dumps({"text": "⚔ ?", "tooltip": "Muster: no data yet", "class": "unknown"}))
    raise SystemExit

bots = snap.get("bots", [])
working = sum(1 for b in bots if b.get("working"))
age = time.time() - snap.get("generated", 0)

if not bots:
    text, cls = "⚔ 0", "idle"
elif working:
    text, cls = f"⚔ {len(bots)} · {working} working", "working"
elif age > 900:
    text, cls = f"⚔ {len(bots)} · stale", "unknown"
else:
    text, cls = f"⚔ {len(bots)}", "idle"

def ago(ts):
    if not ts:
        return "?"
    s = int(time.time() - ts)
    if s < 60: return f"{s}s"
    if s < 3600: return f"{s//60}m"
    if s < 86400: return f"{s//3600}h"
    return f"{s//86400}d"

lines = []
for b in bots:
    mark = "▶" if b.get("working") else "●"
    msg = b.get("last_message") or "no messages"
    lines.append(f"{mark} {b.get('name')} — {ago(b.get('last_activity'))} · {msg}")

gw = snap.get("gateway", {}).get("running")
gw_line = "gateway: running" if gw else ("gateway: down" if gw is False else "gateway: ?")

tooltip = "Muster — Botmarchy roll call\n" + "\n".join(lines) + f"\n{gw_line}"
tooltip += "\n─\nclick: roster · right: refresh · middle: open Botmarchy"

print(json.dumps({"text": text, "tooltip": tooltip, "class": cls}))
PY
