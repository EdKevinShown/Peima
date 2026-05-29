# Peima Staging — Prisma Migration Job

> **Schema:** `packages/database/prisma/schema.prisma`  
> **Runbook:** [staging-postgres-migration-runbook.md](../../artifacts/p76/r9e4/staging-postgres-migration-runbook.md)

---

## 1. Purpose

One-shot job to apply all Prisma migrations to **staging** Postgres before API rollout.

---

## 2. Local / CI execution

```bash
# Prerequisites: pnpm install, .env.staging with staging DATABASE_URL (gitignored)
cd /path/to/peima
dotenv -e .env.staging --override -- pnpm db:migrate:deploy
```

Root script ([package.json](../../package.json)):

```json
"db:migrate:deploy": "dotenv -e .env --override -- pnpm --filter @peima/database run db:migrate:deploy"
```

Override `.env` with `.env.staging` via `dotenv -e .env.staging`.

---

## 3. Docker one-shot job (example)

```bash
docker run --rm \
  -e DATABASE_URL="postgresql://<user>:<password>@<staging-host>:5432/peima?schema=public" \
  -v "$(pwd):/app" -w /app \
  node:20-bullseye-slim \
  bash -c "npm i -g pnpm@9.15.0 && pnpm install --frozen-lockfile && pnpm db:migrate:deploy"
```

Prefer CI secret injection instead of inline passwords.

---

## 4. GitHub Actions sketch (optional)

```yaml
# .github/workflows/staging-migrate.yml — EXAMPLE ONLY, not wired by r9e4
name: staging-migrate-deploy
on:
  workflow_dispatch:
jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.15.0
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:migrate:deploy
        env:
          DATABASE_URL: ${{ secrets.STAGING_DATABASE_URL }}
```

---

## 5. Post-job verification

```sql
SELECT migration_name, finished_at
FROM _prisma_migrations
ORDER BY finished_at DESC
LIMIT 5;
```

Confirm latest includes `20260517120000_p76_allowlist_apply_meta`.

---

## 6. Failure handling

| Failure | Action |
|---------|--------|
| Auth error | Fix `DATABASE_URL` credentials |
| Partial apply | Restore DB snapshot; do not start API |
| Drift | Do not use `db push` on shared staging — consult DBA |

---

## 7. Evidence

Log excerpt → [real-prod-migration-result.md](../../artifacts/p76/r9e3/real-prod-migration-result.md) with `environment=production-like-staging`.
