#!/usr/bin/env bash
# Sync the monorepo's Muster plugin (source of truth) into the standalone
# distribution repo (~/coding-projects/botmarchy-muster) and commit there.
# The distribution repo is what `omarchy plugin add` clones — manifest.json
# must sit at its ROOT.

set -euo pipefail

MONOREPO_PLUGIN="$(cd "$(dirname "${BASH_SOURCE[0]}")/plugin" && pwd)"
DIST="${BOTMARCHY_MUSTER_DIST:-$HOME/coding-projects/botmarchy-muster}"

[[ -d "$DIST/.git" ]] || { echo "no dist repo at $DIST (clone it first)" >&2; exit 1; }

rsync -a --delete \
  --exclude '.git' \
  "$MONOREPO_PLUGIN/" "$DIST/"

cd "$DIST"
if [[ -n "$(git status --porcelain)" ]]; then
  git add -A
  git commit -m "sync from botmarchy monorepo (omarchy-integration/muster/plugin)"
  echo "committed; push with: git push origin main (from $DIST)"
else
  echo "dist repo already in sync"
fi
