#!/bin/sh
# Restart Paper Writer (backend serves frontend static files)
# Usage: sh scripts/restart.sh [--no-build|--check-paths]
# By default, the frontend is built before the running release is stopped.

set -e

SCRIPT_DIR="$(CDPATH= cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$REPO_ROOT/app"
BACKEND_DIR="$APP_DIR/apps/backend"
FRONTEND_DIR="$APP_DIR/apps/frontend"
# shellcheck disable=SC1091
. "$REPO_ROOT/scripts/load-openprism-env.sh"
load_openprism_env "$REPO_ROOT"

LOG_FILE="${LOG_FILE:-/tmp/paper-writer.log}"
PID_FILE="${PID_FILE:-/tmp/paper-writer.pid}"
PORT="${OPENPRISM_PORT:-${PORT:-8787}}"
PUBLIC_HOST="${OPENPRISM_PUBLIC_HOST:-127.0.0.1}"

check_dir() {
  if [ ! -d "$1" ]; then
    echo "ERROR: missing directory: $1" >&2
    exit 1
  fi
}

check_paths() {
  check_dir "$APP_DIR"
  check_dir "$BACKEND_DIR"
  check_dir "$FRONTEND_DIR"
}

is_paper_writer_supervisor() {
  pid="$1"
  cmdline="$(tr '\000' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
  cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"
  case "$cmdline" in
    *run-server.sh*) [ "$cwd" = "$REPO_ROOT" ] || [ "$cwd" = "$BACKEND_DIR" ] ;;
    *) return 1 ;;
  esac
}

stop_existing_server() {
  # Stop the lifecycle owner first so it cannot respawn the backend while this
  # script starts the replacement release.
  supervisor_pids=""
  if [ -f "$PID_FILE" ]; then
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [ -n "$pid" ] && is_paper_writer_supervisor "$pid"; then
      supervisor_pids="$pid"
    fi
  fi
  for pid in $(pgrep -f "run-server\.sh" 2>/dev/null || true); do
    if is_paper_writer_supervisor "$pid"; then
      case " $supervisor_pids " in *" $pid "*) ;; *) supervisor_pids="$supervisor_pids $pid" ;; esac
    fi
  done
  for pid in $supervisor_pids; do
    kill "$pid" 2>/dev/null || true
  done
  for pid in $supervisor_pids; do
    i=0
    while kill -0 "$pid" 2>/dev/null && [ "$i" -lt 50 ]; do
      sleep 0.1
      i=$((i + 1))
    done
  done

  # Clean up a backend left by an interrupted or legacy launcher.
  for pid in $(pgrep -f "node.*src/index.js" 2>/dev/null || true); do
    cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"
    if [ "$cwd" = "$BACKEND_DIR" ]; then
      kill "$pid" 2>/dev/null || true
    fi
  done
}

start_backend() {
  cd "$REPO_ROOT"
  if command -v setsid >/dev/null 2>&1; then
    nohup setsid bash "$REPO_ROOT/scripts/run-server.sh" >> "$LOG_FILE" 2>&1 &
  else
    nohup bash "$REPO_ROOT/scripts/run-server.sh" >> "$LOG_FILE" 2>&1 &
  fi
  SERVER_PID=$!
  cd "$REPO_ROOT"
}

if [ "${1:-}" = "--check-paths" ]; then
  check_paths
  echo "APP_DIR=$APP_DIR"
  echo "BACKEND_DIR=$BACKEND_DIR"
  echo "FRONTEND_DIR=$FRONTEND_DIR"
  exit 0
fi

echo "=== Paper Writer Restart ==="
check_paths

# Build before stopping the current release so a failed build cannot cause
# avoidable downtime.
if [ "${1:-}" = "--no-build" ]; then
  echo "[1/4] Frontend build skipped (--no-build)"
else
  echo "[1/4] Building frontend..."
  (cd "$FRONTEND_DIR" && npm run build)
fi

echo "[2/4] Stopping existing supervisor and backend..."
stop_existing_server
sleep 1

# Start backend
echo "[3/4] Starting backend on port $PORT..."
start_backend
sleep 4

# Verify — retry up to 10 times (max ~10s)
echo "[4/4] Verifying..."
VERIFY_OK=0
EXPECTED_BUILD_ID="$(node -e "const fs=require('fs');const p=process.argv[1];process.stdout.write(JSON.parse(fs.readFileSync(p,'utf8')).buildId||'')" "$BACKEND_DIR/.openprism-build.json")"
for i in $(seq 1 10); do
  HEALTH_JSON="$(curl -fsS "http://127.0.0.1:$PORT/api/health" 2>/dev/null || true)"
  READY_JSON="$(curl -fsS "http://127.0.0.1:$PORT/api/ready" 2>/dev/null || true)"
  if [ -n "$HEALTH_JSON" ] && [ -n "$READY_JSON" ]; then
    if node -e '
      const health = JSON.parse(process.argv[1]);
      const ready = JSON.parse(process.argv[2]);
      const expected = process.argv[3];
      if (!health.ok || health.build?.id !== expected || health.build?.apiSchemaVersion !== 2 || !ready.ready) process.exit(1);
    ' "$HEALTH_JSON" "$READY_JSON" "$EXPECTED_BUILD_ID" 2>/dev/null; then
      VERIFY_OK=1
      break
    fi
  fi
  printf '.' >&2
  sleep 1
done
echo >&2

if [ "$VERIFY_OK" -eq 1 ]; then
  echo ""
  echo "  Paper Writer running at http://$PUBLIC_HOST:$PORT"
  echo "  Supervisor PID: $(cat "$PID_FILE" 2>/dev/null || echo "$SERVER_PID")"
  echo "  Build: $EXPECTED_BUILD_ID"
  echo "  Log: $LOG_FILE"
  echo ""
else
  echo "  ERROR: Server failed to start after 10s. Check $LOG_FILE"
  tail -10 "$LOG_FILE"
  exit 1
fi
