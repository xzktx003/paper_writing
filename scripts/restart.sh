#!/bin/sh
# Restart Paper Writer (backend serves frontend static files)
# Usage: sh scripts/restart.sh [--no-build|--check-paths]
# By default, frontend is always rebuilt to ensure latest code is served.

set -e

SCRIPT_DIR="$(CDPATH= cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$REPO_ROOT/app"
BACKEND_DIR="$APP_DIR/apps/backend"
FRONTEND_DIR="$APP_DIR/apps/frontend"
LOG_FILE="/tmp/paper-writer.log"
PID_FILE="/tmp/paper-writer.pid"
PORT=8787

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

stop_existing_server() {
  for pid in $(pgrep -f "node.*src/index.js" 2>/dev/null || true); do
    cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"
    if [ "$cwd" = "$BACKEND_DIR" ]; then
      kill "$pid" 2>/dev/null || true
    fi
  done
}

start_backend() {
  cd "$BACKEND_DIR"
  if command -v setsid >/dev/null 2>&1; then
    PORT=$PORT nohup setsid node src/index.js > "$LOG_FILE" 2>&1 &
  else
    PORT=$PORT nohup node src/index.js > "$LOG_FILE" 2>&1 &
  fi
  SERVER_PID=$!
  printf '%s\n' "$SERVER_PID" > "$PID_FILE"
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

# Kill existing process
echo "[1/4] Stopping existing server..."
stop_existing_server
sleep 1

# Build frontend (always by default, skip with --no-build)
if [ "${1:-}" = "--no-build" ]; then
  echo "[2/4] Frontend build skipped (--no-build)"
else
  echo "[2/4] Building frontend..."
  (cd "$FRONTEND_DIR" && npm run build)
fi

# Start backend
echo "[3/4] Starting backend on port $PORT..."
start_backend
sleep 4

# Verify
echo "[4/4] Verifying..."
if curl -s "http://localhost:$PORT/api/health" | grep -q '"ok":true'; then
  echo ""
  echo "  Paper Writer running at http://10.30.0.22:$PORT"
  echo "  PID: $SERVER_PID"
  echo "  Log: $LOG_FILE"
  echo ""
else
  echo "  ERROR: Server failed to start. Check $LOG_FILE"
  tail -5 "$LOG_FILE"
  exit 1
fi
