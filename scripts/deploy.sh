#!/usr/bin/env bash
#
# deploy.sh — pull the current branch, rebuild, and restart the Printing Comics site.
#
# Run it on the server (from anywhere):
#
#   npm run deploy                                 # deploy the checked-out branch
#   /opt/printingcomics/scripts/deploy.sh -b NAME  # deploy a specific branch
#
# It works out what needs doing by itself. Every conditional step is keyed on
# a hash of the files that feed it, recorded in .deploy-state (gitignored)
# only after the step succeeds — so a deploy that dies halfway re-runs the
# unfinished steps next time, and nothing is ever "consumed" by a deploy that
# skipped it. You should not normally need any flags.
#
#   step                    runs when                          force / skip
#   ----------------------  ---------------------------------  ---------------
#   npm install             package.json / lockfile changed    FORCE_INSTALL=1
#   prisma migrate deploy   prisma/migrations changed          FORCE_MIGRATE=1
#   prisma db push          prisma/schema.prisma changed       FORCE_PUSH=1
#   npm run build           always
#   db:seed:cws             seed-cws.ts / pricing/*.json       FORCE_SEED=1 / SKIP_SEED=1
#   pm2 reload              always
#   health check            always (fails the deploy if the API doesn't answer)
#
# The seed is idempotent — it reuses each product row by slug so cart and
# order references survive, and only rebuilds options and pricing — which is
# why it is safe to run whenever its inputs change. The base seed
# (prisma/seed.ts: admin user, bootstrap settings) is NOT run here; run
# `npm run db:seed` by hand on a fresh database.

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

# Remember our own content hash so we can re-exec the updated copy after the
# reset — otherwise a self-update to this script runs stale logic in memory.
SELF="$SCRIPT_DIR/$(basename "${BASH_SOURCE[0]}")"
SELF_HASH_BEFORE="$(git hash-object "$SELF" 2>/dev/null || echo none)"

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

# If the reset changed this script itself, re-exec the new copy so we never run
# stale deploy logic.
if [ "${DEPLOY_REEXECED:-0}" != "1" ]; then
  SELF_HASH_AFTER="$(git hash-object "$SELF" 2>/dev/null || echo none)"
  if [ "$SELF_HASH_BEFORE" != "$SELF_HASH_AFTER" ]; then
    echo "==> deploy.sh changed in this update — re-running the new version"
    export DEPLOY_REEXECED=1
    exec bash "$SELF" --branch="$BRANCH"
  fi
fi

if [ "$BEFORE" = "$AFTER" ]; then
  echo "==> Already at $(git rev-parse --short HEAD) — rebuilding anyway."
else
  echo "==> Updated ${BEFORE:0:9} -> ${AFTER:0:9}"
  git --no-pager log --oneline "${BEFORE}..${AFTER}" 2>/dev/null | sed 's/^/     /' || true
fi

# ---- deploy state: what did the LAST SUCCESSFUL run of each step see? ----
STATE_FILE="$REPO_DIR/.deploy-state"
state_get() { grep "^$1=" "$STATE_FILE" 2>/dev/null | head -1 | cut -d= -f2- || true; }
state_set() {
  touch "$STATE_FILE"
  { grep -v "^$1=" "$STATE_FILE" 2>/dev/null || true; echo "$1=$2"; } > "$STATE_FILE.tmp"
  mv "$STATE_FILE.tmp" "$STATE_FILE"
}
# Content hash of a set of files. Missing files simply contribute nothing.
hash_of() { { cat "$@" 2>/dev/null || true; } | sha256sum | cut -c1-16; }

FIRST_RUN=0
[ -f "$STATE_FILE" ] || FIRST_RUN=1

INSTALL_HASH="$(hash_of package.json package-lock.json server/package.json web/package.json)"
SCHEMA_HASH="$(hash_of prisma/schema.prisma)"
SEED_HASH="$(hash_of prisma/seed-cws.ts prisma/pricing/*.json)"

CHANGED="$(git diff --name-only "$BEFORE" "$AFTER" 2>/dev/null || true)"

# ---- dependencies ----
if [ "${FORCE_INSTALL:-0}" = "1" ] || [ "$(state_get install)" != "$INSTALL_HASH" ]; then
  echo "==> Installing dependencies"
  npm install
  state_set install "$INSTALL_HASH"
fi

# ---- database migrations (only if this project ever adds a migrations dir) ----
if [ "${FORCE_MIGRATE:-0}" = "1" ] || printf '%s\n' "$CHANGED" | grep -q '^prisma/migrations/'; then
  echo "==> Applying database migrations"
  npm run db:deploy
fi

# ---- schema sync (this project tracks schema via `prisma db push`) ----
# db push applies additive changes and safely aborts on destructive ones.
if [ "${FORCE_PUSH:-0}" = "1" ] || [ "$(state_get schema)" != "$SCHEMA_HASH" ]; then
  echo "==> Syncing database schema (prisma db push)"
  npm run db:push
  state_set schema "$SCHEMA_HASH"
fi

# ---- build ----
echo "==> Building (prisma generate + server + web)"
npm run build

# ---- runtime tools ----
# PDF previews are rendered with poppler (lib/pdf-preview.ts); without it
# every preview shows an "install poppler" notice instead of the page.
if ! command -v pdftoppm >/dev/null 2>&1; then
  echo "!!  poppler-utils is not installed — PDF previews will not work until you run:"
  echo "!!      sudo apt install -y poppler-utils"
fi

# ---- configurator / catalog re-seed ----
# Runs whenever the seed script or its pricing data differs from what was
# last seeded — the seed is idempotent, so there is no reason to make a human
# remember to do it. FORCE_SEED=1 runs it regardless; SKIP_SEED=1 defers it
# (the hash is left unrecorded, so the next deploy picks it up).
if [ "${SKIP_SEED:-0}" = "1" ]; then
  echo "==> Skipping catalog seed (SKIP_SEED=1) — it will run on the next deploy"
elif [ "${FORCE_SEED:-0}" = "1" ] || [ "$(state_get seed)" != "$SEED_HASH" ]; then
  if [ "$FIRST_RUN" = "1" ]; then
    echo "==> Seeding catalog products (first run with state tracking — establishing a baseline)"
  elif [ "${FORCE_SEED:-0}" = "1" ]; then
    echo "==> Seeding catalog products (FORCE_SEED=1)"
  else
    echo "==> Seeding catalog products (seed-cws.ts or pricing data changed since last seed)"
  fi
  npm run db:seed:cws
  state_set seed "$SEED_HASH"
else
  echo "==> Catalog seed unchanged since last deploy — skipping"
fi

# ---- restart ----
echo "==> Restarting the site (pm2)"
if pm2 describe printingcomics >/dev/null 2>&1; then
  pm2 reload printingcomics --update-env
else
  pm2 start ecosystem.config.cjs
fi

# ---- health check: don't call it done until the API actually answers ----
PORT="$(grep -E '^PORT=' .env 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"
PORT="${PORT:-4000}"
HEALTH="http://127.0.0.1:${PORT}/api/health"
echo "==> Waiting for $HEALTH"
ok=0
for i in $(seq 1 30); do
  if curl -fsS --max-time 2 "$HEALTH" >/dev/null 2>&1; then ok=1; break; fi
  sleep 1
done
if [ "$ok" != "1" ]; then
  echo "!!  The API did not answer on $HEALTH within 30s. Last log lines:" >&2
  pm2 logs printingcomics --nostream --lines 30 2>/dev/null || true
  exit 1
fi

echo "==> Done. $(git rev-parse --short HEAD) is live and healthy."
