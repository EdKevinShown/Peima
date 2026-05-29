# P7.6-r9e4 — Staging Postgres & Migration Runbook

> **Parent:** [P7.6-r9e4](../../../docs/P7/P7.6-r9e4-staging-production-like-environment-bootstrap-runbook.md)  
> **SQL pack:** [r9e2 prod-rds-sql-pack](../r9e2/prod-rds-sql-pack.md)  
> **Migration job:** [peima-staging-migration-job.md](../../../docs/ops/peima-staging-migration-job.md)

---

## 1. Prerequisites

- [ ] Staging Postgres **16** provisioned
- [ ] Database user with `CREATE` / `ALTER` / `SELECT` on `public`
- [ ] `DATABASE_URL` stored in secret manager (**not** in repo)
- [ ] Backup / snapshot policy enabled
- [ ] Ops approval for **staging-only** data seed (no customer prod copy without approval)

---

## 2. Create database

| Step | Action |
|------|--------|
| 1 | Create project / instance (Neon · Supabase · RDS · Railway) |
| 2 | Create database `peima` (or match `POSTGRES_DB` convention) |
| 3 | Note **hostname** — must not be `localhost` |
| 4 | Construct URL: `postgresql://USER:PASSWORD@HOST:5432/peima?schema=public` |
| 5 | Store as `DATABASE_URL` in API platform secret |

**Connectivity test (from Ops machine):**

```bash
# Replace with your client; do not paste password into artifacts
psql "$DATABASE_URL" -c "SELECT version();"
```

---

## 3. Run Prisma migrate deploy

**From monorepo root** (local CI runner or one-off job):

```bash
# Use .env.staging locally (gitignored) OR CI secret injection
dotenv -e .env.staging --override -- pnpm db:migrate:deploy
```

Equivalent:

```bash
dotenv -e .env.staging --override -- pnpm --filter @peima/database run db:migrate:deploy
```

**Expected:** all migrations in `packages/database/prisma/migrations/` applied, including:

- `20260517120000_p76_allowlist_apply_meta`

**Do not use on staging:**

- `prisma migrate dev`
- `prisma db push` (unless explicitly approved for empty throwaway DB)

---

## 4. Post-migrate verification

### 4.1 Table exists

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'p76_allowlist_apply_meta';
```

### 4.2 Full r9e2 SQL pack

Run [prod-rds-sql-pack.md](../r9e2/prod-rds-sql-pack.md) §1–§4 on **staging** connection.

**Gate:** `violation_count = 0`

### 4.3 Record output

Paste redacted output to [real-prod-rds-check.md](../r9e3/real-prod-rds-check.md) **Staging** section:

```text
environment=production-like-staging
rds_host=<redacted-hostname>
violation_count=0
```

---

## 5. Data seed (if empty DB)

After migrate, sidecar table may be empty. Options:

| Option | When |
|--------|------|
| A. Run allowlist writer on staging (controlled) | PM/Ops approved · dry-run first |
| B. Import anonymized dev fixture | r9d-equivalent cohort only |
| C. SQL insert from approved seed script | DBA-reviewed |

**Route C PM lock (5 viewers):** see [production-env-freeze](../r9c2/production-env-freeze.md)

**Do not** enable read path until rows + `match_results` exist for smoke viewers.

---

## 6. Rollback (DB layer)

| Scenario | Action |
|----------|--------|
| Migrate failed mid-way | Restore RDS snapshot; do not start API |
| Wrong migration on empty DB | Drop DB / recreate instance; re-run deploy |
| P7.6 incident | Env kill switch — **no** need to drop `p76_allowlist_apply_meta` if rows correct |

---

## 7. Evidence artifacts

| Artifact | Field to set |
|----------|--------------|
| [real-prod-migration-result.md](../r9e3/real-prod-migration-result.md) | `environment=production-like-staging` · migrate log excerpt |
| [real-prod-rds-check.md](../r9e3/real-prod-rds-check.md) | SQL pack output · `violation_count` |

---

## 8. BLOCK conditions

- `DATABASE_URL` still points to `localhost`
- `p76_allowlist_apply_meta` missing after migrate
- `violation_count > 0`
- Migrate run against customer production by mistake
