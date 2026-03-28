#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${ROOT_DIR}/.dev-runtime"

SERVER_BIND_HOST="${SERVER_BIND_HOST:-0.0.0.0}"
SERVER_PUBLIC_HOST="${SERVER_PUBLIC_HOST:-127.0.0.1}"
SERVER_PORT="${SERVER_PORT:-4000}"

WEB_HOST="${WEB_HOST:-127.0.0.1}"
WEB_PORT="${WEB_PORT:-3000}"

SERVER_LOG="${RUNTIME_DIR}/server.log"
WEB_LOG="${RUNTIME_DIR}/web.log"
SERVER_PID_FILE="${RUNTIME_DIR}/server.pid"
WEB_PID_FILE="${RUNTIME_DIR}/web.pid"

log() {
  printf '[dev-restart] %s\n' "$*"
}

kill_from_pid_file() {
  local name="$1"
  local pid_file="$2"

  if [[ ! -f "$pid_file" ]]; then
    return
  fi

  local pid
  pid="$(cat "$pid_file")"

  if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
    log "Stopping ${name} process ${pid}"
    kill "$pid" 2>/dev/null || true
    sleep 1

    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi

  rm -f "$pid_file"
}

kill_listeners_on_port() {
  local name="$1"
  local port="$2"
  local pids

  pids="$(lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true)"

  if [[ -z "$pids" ]]; then
    return
  fi

  log "Freeing ${name} port ${port}: ${pids//$'\n'/, }"
  kill $pids 2>/dev/null || true
  sleep 1

  pids="$(lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    kill -9 $pids 2>/dev/null || true
  fi
}

wait_for_http() {
  local name="$1"
  local url="$2"
  local attempts="${3:-30}"

  for ((i = 1; i <= attempts; i += 1)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  log "${name} did not become ready: ${url}"
  return 1
}

show_log_tail() {
  local label="$1"
  local file="$2"

  if [[ -f "$file" ]]; then
    printf '\n[%s log tail]\n' "$label"
    tail -n 20 "$file" || true
  fi
}

mkdir -p "$RUNTIME_DIR"

kill_from_pid_file backend "$SERVER_PID_FILE"
kill_from_pid_file frontend "$WEB_PID_FILE"
kill_listeners_on_port backend "$SERVER_PORT"
kill_listeners_on_port frontend "$WEB_PORT"

: >"$SERVER_LOG"
: >"$WEB_LOG"

cd "$ROOT_DIR"

log "Starting backend on ${SERVER_BIND_HOST}:${SERVER_PORT}"
nohup env HOST="$SERVER_BIND_HOST" PORT="$SERVER_PORT" \
  pnpm --filter server dev >"$SERVER_LOG" 2>&1 &
echo $! >"$SERVER_PID_FILE"

log "Starting frontend on ${WEB_HOST}:${WEB_PORT}"
nohup pnpm --filter web dev -- --host "$WEB_HOST" --port "$WEB_PORT" \
  >"$WEB_LOG" 2>&1 &
echo $! >"$WEB_PID_FILE"

SERVER_URL="http://${SERVER_PUBLIC_HOST}:${SERVER_PORT}"
SERVER_HEALTH_URL="${SERVER_URL}/api/health"
WEB_URL="http://${WEB_HOST}:${WEB_PORT}"

if ! wait_for_http backend "$SERVER_HEALTH_URL"; then
  show_log_tail backend "$SERVER_LOG"
  exit 1
fi

if ! wait_for_http frontend "$WEB_URL"; then
  show_log_tail frontend "$WEB_LOG"
  exit 1
fi

printf '\nBackend  : %s\n' "$SERVER_URL"
printf 'Health   : %s\n' "$SERVER_HEALTH_URL"
printf 'Frontend : %s\n' "$WEB_URL"
printf 'Logs     : %s | %s\n' "$SERVER_LOG" "$WEB_LOG"
