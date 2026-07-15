#!/usr/bin/env bash
#
# deploy.sh — pull the current branch, rebuild, and restart the Printing Comics site.
#
# Run it on the server (from anywhere):
#
#   /opt/printingcomics/scripts/deploy.sh          # deploy the checked-out branch
#   /opt/printingcomics/scripts/deploy.sh -b NAME  # deploy a specific branch
#   npm run deploy                                 # same thing, from the repo root
#
# What it does, in order:
#   1. Hard-resets the repo to origin/<branch> (your .env and build output are
#      gitignored, so they're left untouched).
#   2. npm install        — only when a package.json / lockfile changed
#   3. prisma migrate deploy — only when prisma/migrations changed
#   4. npm run build      — always (prisma generate + server tsc + web build)
#   5. db:seed:cws        — only when the configurator pricing data changed
#   6. pm2 reload         — restart the API process
#
# Force any conditional step with an env var: FORCE_INSTALL=1, FORCE_MIGRATE=1,
# FORCE_SEED=1  (e.g. `FORCE_SEED=1 npm run deploy`).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_DIR"

# ---- options ----
BRANCH=""
while [ $# -gt 0 ]; do
  case "$1" in
    -b|--branch) BRANCH="${2:-}"; shift 2 ;;
    --branch=*)  BRANCH="${1#*=}"; shift ;;
    -h|--help)   grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1 (try --help)" >&2; exit 1 ;;
  esac
done
[ -n "$BRANCH" ] || BRANCH="$(git rev-parse --abbrev-ref HEAD)"

echo "==> Deploying branch '$BRANCH'  ($REPO_DIR)"
BEFORE="$(git rev-parse HEAD 2>/dev/null || echo none)"

# ---- fetch with retry/backoff on flaky networks ----
git_retry() {
  local n=0 max=4 delay=2
  until git "$@"; do
    n=$((n + 1))
    [ "$n" -ge "$max" ] && { echo "git $* failed after $max attempts" >&2; return 1; }
    echo "   git $* failed — retrying in ${delay}s ($n/$max)…"
    sleep "$delay"; delay=$((delay * 2))
  done
}

git_retry fetch origin "$BRANCH"
# Hard-reset to the remote tip so this works even after a force-push.
git checkout -B "$BRANCH" "origin/$BRANCH"
git reset --hard "origin/$BRANCH"
AFTER="$(git rev-parse HEAD)"

if [ "$BEFORE" = "$AFTER" ]; then
  echo "==> Already at $(git rev-parse --short HEAD) — rebuilding anyway."
else
  echo "==> Updated ${BEFORE:0:9} -> ${AFTER:0:9}"
fi

# ---- what changed since the last deploy? ----
CHANGED="$(git diff --name-only "$BEFORE" "$AFTER" 2>/dev/null || true)"

# ---- dependencies ----
if [ "${FORCE_INSTALL:-0}" = "1" ] || printf '%s\n' "$CHANGED" | grep -Eq '(^|/)package(-lock)?\.json$'; then
  echo "==> Installing dependencies"
  npm install
fi

# ---- database migrations ----
if [ "${FORCE_MIGRATE:-0}" = "1" ] || printf '%s\n' "$CHANGED" | grep -q '^prisma/migrations/'; then
  echo "==> Applying database migrations"
  npm run db:deploy
fi

# ---- schema sync (this project tracks schema via `prisma db push`) ----
# db push applies additive changes and safely aborts on destructive ones.
if [ "${FORCE_PUSH:-0}" = "1" ] || printf '%s\n' "$CHANGED" | grep -q '^prisma/schema\.prisma$'; then
  echo "==> Syncing database schema (prisma db push)"
  npm run db:push
fi

# ---- build ----
echo "==> Building (prisma generate + server + web)"
npm run build

# ---- configurator pricing re-seed ----
if [ "${FORCE_SEED:-0}" = "1" ] || printf '%s\n' "$CHANGED" | grep -qE 'prisma/(pricing/cws-pricing\.json|seed-cws\.ts)'; then
  echo "==> Re-seeding configurator products (pricing changed)"
  npm run db:seed:cws
fi

# ---- restart ----
echo "==> Restarting the site (pm2)"
if pm2 describe printingcomics >/dev/null 2>&1; then
  pm2 reload printingcomics --update-env
else
  pm2 start ecosystem.config.cjs
fi

echo "==> Done. $(git rev-parse --short HEAD) is live."
