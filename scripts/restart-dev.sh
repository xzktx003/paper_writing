#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${ROOT_DIR}/.dev-runtime"
PLAYWRIGHT_BIN_DIR="${ROOT_DIR}/.playwright-bin"

SERVER_BIND_HOST="${SERVER_BIND_HOST:-0.0.0.0}"
SERVER_PUBLIC_HOST="${SERVER_PUBLIC_HOST:-127.0.0.1}"
SERVER_PORT="${SERVER_PORT:-4000}"

WEB_HOST="${WEB_HOST:-0.0.0.0}"
WEB_PORT="${WEB_PORT:-3000}"
WEB_HTTPS="${WEB_HTTPS:-1}"
WEB_HTTPS_CERT="${WEB_HTTPS_CERT:-${RUNTIME_DIR}/certs/dev-cert.pem}"
WEB_HTTPS_KEY="${WEB_HTTPS_KEY:-${RUNTIME_DIR}/certs/dev-key.pem}"
WEB_HTTPS_SAN="${WEB_HTTPS_SAN:-}"

SERVER_LOG="${RUNTIME_DIR}/server.log"
WEB_LOG="${RUNTIME_DIR}/web.log"
SERVER_PID_FILE="${RUNTIME_DIR}/server.pid"
WEB_PID_FILE="${RUNTIME_DIR}/web.pid"

log() {
  printf '[dev-restart] %s\n' "$*"
}

build_runtime_path() {
  if [[ -d "$PLAYWRIGHT_BIN_DIR" ]]; then
    printf '%s\n' "${PLAYWRIGHT_BIN_DIR}:${PATH}"
    return
  fi

  printf '%s\n' "$PATH"
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
  local curl_args=(-fsS)

  if [[ "$url" == https://* ]]; then
    curl_args=(-k -fsS)
  fi

  for ((i = 1; i <= attempts; i += 1)); do
    if curl "${curl_args[@]}" "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  log "${name} did not become ready: ${url}"
  return 1
}

extract_frontend_url() {
  local label="$1"
  local file="$2"

  sed -nE "s/.*${label}:[[:space:]]+(https?:\/\/[^[:space:]]+).*/\1/p" "$file" \
    | tail -n 1 \
    | tr -d '\r' \
    | sed 's:/$::'
}

wait_for_frontend_urls() {
  local file="$1"
  local attempts="${2:-30}"

  FRONTEND_LOCAL_URL=''
  FRONTEND_NETWORK_URL=''

  for ((i = 1; i <= attempts; i += 1)); do
    FRONTEND_LOCAL_URL="$(extract_frontend_url Local "$file")"
    FRONTEND_NETWORK_URL="$(extract_frontend_url Network "$file")"

    if [[ -n "$FRONTEND_LOCAL_URL" ]]; then
      return 0
    fi

    sleep 1
  done

  log 'frontend did not print a ready url'
  return 1
}

extract_url_port() {
  local url="$1"

  printf '%s\n' "$url" | sed -nE 's#.*:([0-9]+)$#\1#p'
}

show_log_tail() {
  local label="$1"
  local file="$2"

  if [[ -f "$file" ]]; then
    printf '\n[%s log tail]\n' "$label"
    tail -n 20 "$file" || true
  fi
}

build_default_https_san() {
  local san_entries=("DNS:localhost" "IP:127.0.0.1")
  local host_name
  local ip

  host_name="$(hostname -s 2>/dev/null || hostname 2>/dev/null || true)"
  if [[ -n "$host_name" && "$host_name" != "localhost" ]]; then
    san_entries+=("DNS:${host_name}")
  fi

  for ip in $(hostname -I 2>/dev/null || true); do
    if [[ -z "$ip" || "$ip" == 127.* || "$ip" == "::1" ]]; then
      continue
    fi

    san_entries+=("IP:${ip}")
  done

  local IFS=,
  printf '%s\n' "${san_entries[*]}"
}

certificate_matches_requested_san() {
  local cert_path="$1"
  local requested_san="$2"
  local certificate_text
  local san_entry

  if [[ ! -f "$cert_path" ]]; then
    return 1
  fi

  certificate_text="$(openssl x509 -in "$cert_path" -noout -text 2>/dev/null || true)"
  if [[ -z "$certificate_text" ]]; then
    return 1
  fi

  IFS=',' read -r -a san_entries <<<"$requested_san"
  for san_entry in "${san_entries[@]}"; do
    if ! grep -F "$san_entry" <<<"$certificate_text" >/dev/null; then
      return 1
    fi
  done

  return 0
}

if [[ -z "$WEB_HTTPS_SAN" ]]; then
  WEB_HTTPS_SAN="$(build_default_https_san)"
fi
ensure_https_certificate() {
  if [[ "$WEB_HTTPS" != "1" ]]; then
    return 0
  fi

  if ! command -v openssl >/dev/null 2>&1; then
    log 'WEB_HTTPS=1 requires openssl, but openssl is not installed'
    return 1
  fi

  if [[ -f "$WEB_HTTPS_CERT" && -f "$WEB_HTTPS_KEY" ]]; then
    if certificate_matches_requested_san "$WEB_HTTPS_CERT" "$WEB_HTTPS_SAN"; then
      return 0
    fi

    log "Regenerating self-signed certificate with SANs: ${WEB_HTTPS_SAN}"
    rm -f "$WEB_HTTPS_CERT" "$WEB_HTTPS_KEY"
  fi

  mkdir -p "$(dirname "$WEB_HTTPS_CERT")"
  mkdir -p "$(dirname "$WEB_HTTPS_KEY")"

  log "Generating self-signed certificate: ${WEB_HTTPS_CERT}"
  openssl req \
    -x509 \
    -newkey rsa:2048 \
    -sha256 \
    -nodes \
    -days 365 \
    -keyout "$WEB_HTTPS_KEY" \
    -out "$WEB_HTTPS_CERT" \
    -subj '/CN=localhost' \
    -addext "subjectAltName=${WEB_HTTPS_SAN}" >/dev/null 2>&1
}

mkdir -p "$RUNTIME_DIR"

if ! ensure_https_certificate; then
  exit 1
fi

kill_from_pid_file backend "$SERVER_PID_FILE"
kill_from_pid_file frontend "$WEB_PID_FILE"
kill_listeners_on_port backend "$SERVER_PORT"
kill_listeners_on_port frontend "$WEB_PORT"

: >"$SERVER_LOG"
: >"$WEB_LOG"

cd "$ROOT_DIR"

RUNTIME_PATH="$(build_runtime_path)"

log "Starting backend on ${SERVER_BIND_HOST}:${SERVER_PORT}"
nohup env PATH="$RUNTIME_PATH" HOST="$SERVER_BIND_HOST" PORT="$SERVER_PORT" \
  pnpm --filter server dev >"$SERVER_LOG" 2>&1 &
echo $! >"$SERVER_PID_FILE"

log "Starting frontend on ${WEB_HOST}:${WEB_PORT}"
if [[ "$WEB_HTTPS" == "1" ]]; then
  log "Frontend HTTPS enabled"
  nohup env PATH="$RUNTIME_PATH" VITE_DEV_HTTPS=1 VITE_DEV_HTTPS_CERT="$WEB_HTTPS_CERT" VITE_DEV_HTTPS_KEY="$WEB_HTTPS_KEY" \
    pnpm --filter web exec vite --host "$WEB_HOST" --port "$WEB_PORT" \
    >"$WEB_LOG" 2>&1 &
else
  nohup env PATH="$RUNTIME_PATH" pnpm --filter web exec vite --host "$WEB_HOST" --port "$WEB_PORT" \
    >"$WEB_LOG" 2>&1 &
fi
echo $! >"$WEB_PID_FILE"

SERVER_URL="http://${SERVER_PUBLIC_HOST}:${SERVER_PORT}"
SERVER_HEALTH_URL="${SERVER_URL}/api/health"

if ! wait_for_http backend "$SERVER_HEALTH_URL"; then
  show_log_tail backend "$SERVER_LOG"
  exit 1
fi

if ! wait_for_frontend_urls "$WEB_LOG"; then
  show_log_tail frontend "$WEB_LOG"
  exit 1
fi

FRONTEND_READY_URL="${FRONTEND_LOCAL_URL}/@vite/client"
if ! wait_for_http frontend "$FRONTEND_READY_URL"; then
  show_log_tail frontend "$WEB_LOG"
  exit 1
fi

FRONTEND_PORT="$(extract_url_port "$FRONTEND_LOCAL_URL")"
if [[ -n "$FRONTEND_PORT" && "$FRONTEND_PORT" != "$WEB_PORT" ]]; then
  log "Requested frontend port ${WEB_PORT} was busy; Vite selected ${FRONTEND_PORT}"
fi

printf '\nBackend  : %s\n' "$SERVER_URL"
printf 'Health   : %s\n' "$SERVER_HEALTH_URL"
printf 'Frontend : %s\n' "$FRONTEND_LOCAL_URL"
if [[ -n "$FRONTEND_NETWORK_URL" ]]; then
  printf 'Network  : %s\n' "$FRONTEND_NETWORK_URL"
fi
printf 'Logs     : %s | %s\n' "$SERVER_LOG" "$WEB_LOG"
