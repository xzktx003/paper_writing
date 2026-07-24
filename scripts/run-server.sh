#!/bin/bash
# Paper Writer persistent server launcher
# Auto-restarts on crash, survives SSH disconnect via setsid

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Every production entry point uses the same root .env -> app/.env precedence.
# shellcheck disable=SC1091
. "${ROOT_DIR}/scripts/load-openprism-env.sh"
load_openprism_env "$ROOT_DIR"

# Explicitly override to avoid system PORT=4000 conflict
export OPENPRISM_PORT="${OPENPRISM_PORT:-8787}"
export OPENPRISM_PUBLIC_HOST="${OPENPRISM_PUBLIC_HOST:-127.0.0.1}"

BACKEND_DIR="${ROOT_DIR}/app/apps/backend"
NODE_BIN="${NODE_BIN:-node}"
LOG_FILE="${LOG_FILE:-/tmp/paper-writer.log}"
PID_FILE="${PID_FILE:-/tmp/paper-writer.pid}"

cd "$BACKEND_DIR"

if [[ -f "$PID_FILE" ]]; then
  EXISTING_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ "$EXISTING_PID" =~ ^[0-9]+$ ]] && [[ "$EXISTING_PID" != "$$" ]] && kill -0 "$EXISTING_PID" 2>/dev/null; then
    echo "[paper-writer] Refusing to start a second supervisor; PID $EXISTING_PID is still running." >&2
    exit 1
  fi
fi
printf '%s\n' "$$" > "$PID_FILE"

BACKEND_PID=""
STOP_REQUESTED=0

stop_backend() {
  if [[ "$BACKEND_PID" =~ ^[0-9]+$ ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
  BACKEND_PID=""
}

request_stop() {
  STOP_REQUESTED=1
  stop_backend
}

cleanup_supervisor() {
  stop_backend
  if [[ -f "$PID_FILE" ]] && [[ "$(cat "$PID_FILE" 2>/dev/null || true)" = "$$" ]]; then
    rm -f "$PID_FILE"
  fi
}

trap request_stop TERM INT
trap cleanup_supervisor EXIT

echo "[paper-writer] Starting on http://${OPENPRISM_PUBLIC_HOST}:${OPENPRISM_PORT}" | tee "$LOG_FILE"

RESTART_COUNT=0
MAX_DELAY=60

while true; do
    if [ $RESTART_COUNT -gt 0 ]; then
        DELAY=$(( 3 * (2 ** (RESTART_COUNT - 1)) ))
        [ $DELAY -gt $MAX_DELAY ] && DELAY=$MAX_DELAY
        echo "[paper-writer] Restarting in ${DELAY}s (attempt #${RESTART_COUNT})"
        sleep $DELAY
    fi

    echo "[paper-writer] Launching node..."
    "$NODE_BIN" src/index.js > >(tee -a "$LOG_FILE") 2>&1 &
    BACKEND_PID=$!
    wait "$BACKEND_PID"
    EXIT_CODE=$?
    BACKEND_PID=""

    echo "[paper-writer] Node exited with code $EXIT_CODE"
    if [[ "$STOP_REQUESTED" -eq 1 ]]; then
      break
    fi
    RESTART_COUNT=$((RESTART_COUNT + 1))
done
