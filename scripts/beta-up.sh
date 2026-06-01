#!/usr/bin/env bash
# Build and start beta stack (api + worker + web). Requires .env at repo root.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
COMPOSE="docker compose -f docker-compose.beta.yml"

if [[ ! -f .env ]]; then
  echo "Missing .env — run: cp docs/ops/peima-beta.env.example .env" >&2
  exit 1
fi

if grep -q 'YOUR_VPS_IP' .env 2>/dev/null; then
  echo "Warning: .env still contains YOUR_VPS_IP — update API_PUBLIC_BASE_URL and VITE_API_BASE_URL" >&2
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

if [[ -z "${VITE_API_BASE_URL:-}" ]]; then
  echo "VITE_API_BASE_URL is empty in .env" >&2
  exit 1
fi

echo "==> Building images (VITE_API_BASE_URL=$VITE_API_BASE_URL)"
$COMPOSE build

echo "==> Starting api, worker, web"
$COMPOSE up -d

echo "==> Status"
$COMPOSE ps

HOST="${VITE_API_BASE_URL#http://}"
HOST="${HOST%%/*}"
HOST="${HOST%%:*}"

echo ""
echo "内测入口（发给用户）: http://${HOST}:${WEB_PORT:-5173}"
echo "API 地址: ${VITE_API_BASE_URL}"
