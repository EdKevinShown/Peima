# P7.6-r9e2 — Production Migration Checklist

> **Runbook:** [P7.6-r9e2](../../../docs/P7/P7.6-r9e2-real-prod-ops-execution-runbook.md)  
> **Ticket:** `PEIMA-OPS-P76-MIGRATE`  
> **Window:** [r9c2 production-migration-window](../r9c2/production-migration-window.md)

---

## Pre-migrate

| # | check | done | owner |
|---|-------|------|-------|
| 1 | RDS snapshot ≤ 4h before migrate | ☐ | Ops |
| 2 | DBA + Eng reviewed SQL | ☐ | DBA |
| 3 | `PEIMA_P76_READ_PATH_ENABLED=0` all pods | ☐ | Ops |
| 4 | `PEIMA_P76_PRODUCTION_PERCENT=0` | ☐ | Ops |
| 5 | Grafana imported (step 3) | ☐ | Ops |
| 6 | on-call + rollback owner confirmed | ☐ | Ops |

---

## Migration

| field | value |
|-------|-------|
| name | `20260517120000_p76_allowlist_apply_meta` |
| type | CREATE TABLE |
| destructive | **no** |
| command | `pnpm exec prisma migrate deploy` (from approved release artifact) |
| executed at (UTC) | _________________ |

---

## Post-migrate SQL

Run [prod-rds-sql-pack.md](./prod-rds-sql-pack.md) §1–§4.

| check | expected | pass |
|-------|----------|------|
| table exists | yes | ☐ |
| `violation_count` | 0 | ☐ |
| read path still off | yes | ☐ |
| percent still 0 | yes | ☐ |

---

## Fail actions

- migrate error → **STOP** · do not enable read path
- violation > 0 → **STOP** · Eng investigate
