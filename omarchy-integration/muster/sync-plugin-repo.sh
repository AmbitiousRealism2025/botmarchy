#!/usr/bin/env bash
# Sync the monorepo's Muster plugin (source of truth) into the standalone
# distribution repo (~/coding-projects/botmarchy-muster) and commit there.
# The distribution repo is what `omarchy plugin add` clones — manifest.json
# must sit at its ROOT.
#
# Destructive by design (rsync --delete); refuses to run against anything
# other than a clean, in-sync clone of the expected repo (PB-7 review F5).
# --force overrides after showing the deletion preview.

set -euo pipefail

MONOREPO_PLUGIN="$(cd "$(dirname "${BASH_SOURCE[0]}")/plugin" && pwd)"
DIST="${BOTMARCHY_MUSTER_DIST:-$HOME/coding-projects/botmarchy-muster}"
EXPECTED_ORIGIN="https://github.com/AmbitiousRealism2025/botmarchy-muster.git"
EXPECTED_BRANCH="main"

FORCE=0
[[ "${1:-}" == "--force" ]] && FORCE=1

[[ -d "$DIST/.git" ]] || { echo "no dist repo at $DIST (clone it first)" >&2; exit 1; }
cd "$DIST"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "$DIST is not a git work tree" >&2; exit 1; }

# ── Preflights: this script deletes files — know exactly what it deletes ──
[[ -z "$(git status --porcelain)" ]] || {
  echo "dist repo has uncommitted changes; commit or stash first:" >&2
  git status --short >&2
  exit 1
}

origin="$(git remote get-url origin 2>/dev/null || true)"
[[ "$origin" == "$EXPECTED_ORIGIN" ]] || {
  echo "dist repo origin is '$origin', expected '$EXPECTED_ORIGIN'" >&2
  echo "(or set BOTMARCHY_MUSTER_DIST to the right checkout)" >&2
  exit 1
}

branch="$(git rev-parse --abbrev-ref HEAD)"
[[ "$branch" == "$EXPECTED_BRANCH" ]] || { echo "dist repo is on '$branch', expected '$EXPECTED_BRANCH'" >&2; exit 1; }

git fetch origin --quiet
[[ "$(git rev-parse HEAD)" == "$(git rev-parse "origin/$EXPECTED_BRANCH")" ]] || {
  echo "dist repo is not in sync with origin/$EXPECTED_BRANCH (ahead or behind):" >&2
  git rev-list --left-right --count "HEAD...origin/$EXPECTED_BRANCH" >&2
  echo "push/pull first." >&2
  exit 1
}

# ── Preview, then sync ──────────────────────────────────────────────────────
dry="$(rsync --dry-run --itemize-changes --archive --delete --exclude '.git' "$MONOREPO_PLUGIN/" "$DIST/")"
echo "Planned changes (rsync --delete from the monorepo plugin):"
sed 's/^/  /' <<<"$dry"

deletions="$(grep -c '^\*deleting' <<<"$dry" || true)"
if (( deletions > 0 )) && (( ! FORCE )); then
  echo
  echo "The sync would DELETE $deletions dist-repo file(s). Re-run with --force to proceed." >&2
  exit 1
fi

rsync --archive --delete --exclude '.git' "$MONOREPO_PLUGIN/" "$DIST/"

if [[ -n "$(git status --porcelain)" ]]; then
  git add -A
  git commit -m "sync from botmarchy monorepo (omarchy-integration/muster/plugin)"
  echo "committed; push with: git push origin main (from $DIST)"
else
  echo "dist repo already in sync"
fi
