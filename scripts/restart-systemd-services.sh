#!/usr/bin/env bash
set -euo pipefail

# Restart codesync services.
# Usage: restart-systemd-services.sh [--no-reload] [server|worker|both]
#
# The worker is only restarted if idle (no child processes beyond its base
# process chain).  When the worker is busy, the caller should retry later.

RELOAD_UNITS=1
TARGET="both"

if [[ "${1:-}" == "--no-reload" ]]; then
  RELOAD_UNITS=0
  shift
fi

if (($#)); then
  case "$1" in
    server|worker|both)
      TARGET="$1"
      shift
      ;;
  esac
fi

if (($#)); then
  echo "Usage: $0 [--no-reload] [server|worker|both]"
  exit 1
fi

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

if ((RELOAD_UNITS)); then
  /usr/bin/systemctl --user daemon-reload
fi

worker_is_busy() {
  local pid
  pid="$(/usr/bin/systemctl --user show codesync-worker.service --property=MainPID --value 2>/dev/null)"
  if [[ -z "$pid" || "$pid" == "0" ]]; then
    return 1  # not running, not busy
  fi
  # Base worker tree: node -> sh -> node -> node  (4 processes).
  # Any additional descendant means a job is running.
  local count
  count="$(pstree -p "$pid" 2>/dev/null | grep -co '([0-9]*)' || echo 0)"
  (( count > 4 ))
}

restart_server() {
  echo "Restarting codesync-server..."
  /usr/bin/systemctl --user restart codesync-server.service
}

restart_worker() {
  if worker_is_busy; then
    echo "Worker is busy (running job); deferring restart."
    return 1
  fi
  echo "Restarting codesync-worker..."
  /usr/bin/systemctl --user restart codesync-worker.service
}

case "$TARGET" in
  server)
    restart_server
    ;;
  worker)
    restart_worker
    ;;
  both)
    restart_server
    restart_worker
    ;;
esac
