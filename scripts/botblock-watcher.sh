#!/bin/bash
# ============================================================================
# botblock-watcher.sh
#
# Fast-loop service that watches /tmp/botblock-pending for newly blocked IPs
# and immediately adds iptables DROP rules. Runs every 5 seconds.
#
# This gives near-instant firewall blocking instead of waiting for the
# 5-minute sync-blocked-ips.sh cron job.
#
# Ported from indiecrowdfund_2.0/scripts/botblock-watcher.sh with paths
# and DB names adjusted for the printingcomics project.
#
# Usage:
#   sudo bash /opt/printingcomics/scripts/botblock-watcher.sh
#
# Or install as a systemd service (recommended):
#   sudo cp /opt/printingcomics/scripts/botblock-watcher.service /etc/systemd/system/
#   sudo systemctl enable --now botblock-watcher
# ============================================================================

set -uo pipefail

CHAIN="BOTBLOCK"
PENDING_FILE="${BOTBLOCK_PENDING_FILE:-/tmp/botblock-pending}"
LOG_PREFIX="[BotBlock-Watcher]"
INTERVAL=5  # seconds between checks

log() {
  echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') $LOG_PREFIX $*"
}

# Ensure we're running as root
if [ "$(id -u)" -ne 0 ]; then
  echo "$LOG_PREFIX Error: must run as root" >&2
  exit 1
fi

# Ensure the BOTBLOCK chain exists
if ! iptables -n -L "$CHAIN" >/dev/null 2>&1; then
  log "Creating chain $CHAIN"
  iptables -N "$CHAIN"
fi

# Ensure INPUT jumps to our chain
if ! iptables -C INPUT -j "$CHAIN" 2>/dev/null; then
  log "Adding jump from INPUT to $CHAIN"
  iptables -I INPUT -j "$CHAIN"
fi

# ---- On startup, restore all blocked IPs from database into iptables ----
DB_HOST="${DB_HOST:-localhost}"
DB_USER="${DB_USER:-printingcomics}"
DB_PASS="${DB_PASS:?DB_PASS environment variable is required}"
DB_NAME="${DB_NAME:-printingcomics}"

log "Restoring blocked IPs from database on startup..."
RESTORE_IPS=$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t -A -c \
  "SELECT \"ipAddress\" FROM \"BlockedIP\" WHERE \"expiresAt\" > NOW();" 2>/dev/null) || {
  log "Warning: failed to query database for startup restore"
  RESTORE_IPS=""
}

restored=0
while IFS= read -r ip; do
  [ -z "$ip" ] && continue
  if [[ ! "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    continue
  fi
  if iptables -C "$CHAIN" -s "$ip/32" -j DROP 2>/dev/null; then
    continue
  fi
  iptables -A "$CHAIN" -s "$ip/32" -j DROP
  ((restored++))
done <<< "$RESTORE_IPS"

if [ "$restored" -gt 0 ]; then
  log "Restored $restored blocked IPs from database"
else
  log "No blocked IPs to restore (or already in iptables)"
fi

log "Watcher started — monitoring $PENDING_FILE every ${INTERVAL}s"

while true; do
  if [ -s "$PENDING_FILE" ]; then
    WORK_FILE="/tmp/botblock-processing.$$"
    mv "$PENDING_FILE" "$WORK_FILE" 2>/dev/null || { sleep "$INTERVAL"; continue; }

    sort -u "$WORK_FILE" | while IFS= read -r ip; do
      [ -z "$ip" ] && continue

      if [[ ! "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        log "SKIP invalid IP: $ip"
        continue
      fi

      if iptables -C "$CHAIN" -s "$ip/32" -j DROP 2>/dev/null; then
        continue
      fi

      iptables -A "$CHAIN" -s "$ip/32" -j DROP
      log "BLOCKED $ip (instant)"
    done

    rm -f "$WORK_FILE"
  fi

  systemd-notify WATCHDOG=1 2>/dev/null || true
  sleep "$INTERVAL"
done
