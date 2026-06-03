#!/usr/bin/env bash
# Run Prisma migrate deploy against DATABASE_URL in repo-root .env
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing .env — run: cp docs/ops/peima-beta.env.example .env" >&2
  exit 1
fi

if ! grep -q '^DATABASE_URL=' .env; then
  echo "DATABASE_URL not set in .env" >&2
  exit 1
fi

echo "==> Prisma migrate deploy (packages/database)"
docker run --rm \
  -v "$ROOT:/app" \
  -w /app/packages/database \
  --env-file "$ROOT/.env" \
  -e NODE_ENV=development \
  node:20-bullseye-slim \
  bash -lc '
    set -euo pipefail
    export CI=true
    npm i -g pnpm@9.15.0 >/dev/null
    cd /app
    pnpm config set confirmModulesPurge false
    pnpm install --frozen-lockfile --ignore-scripts
    cd /app/packages/database
    pnpm exec prisma migrate deploy --schema=./prisma/schema.prisma
  '

echo "==> Done."
