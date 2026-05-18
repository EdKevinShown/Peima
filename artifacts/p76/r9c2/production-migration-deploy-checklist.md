# P7.6-r9c2 — Production Migration Deploy Checklist

> **Window:** [production-migration-window.md](./production-migration-window.md)  
> **Backup:** [production-backup-snapshot-plan.md](./production-backup-snapshot-plan.md)  
> **Use at:** r9d step 1 (not executed in r9c2)

---

## Checklist (execute in order)

| # | item | verify | owner | r9c2 doc status |
|---|------|--------|-------|-----------------|
| 1 | DB backup / snapshot ready | snapshot id recorded · restore tested in drill | Ops | **ready** (plan) |
| 2 | Migration SQL reviewed | diff vs dev `20260517120000_p76_allowlist_apply_meta` | DBA + Eng | **done** |
| 3 | No destructive operation | CREATE TABLE only · no DROP/ALTER data columns on core tables | DBA | **done** |
| 4 | App backwards-compatible | table **absent** → read path off · legacy only; table **present** → same when env off | Eng | **done** |
| 5 | Prisma client in deployment artifact | CI build includes migrated client revision | Eng | **done** (release process) |
| 6 | `PEIMA_P76_READ_PATH_ENABLED=0` | env audit all pods | Ops | **spec** |
| 7 | `PEIMA_P76_PRODUCTION_PERCENT=0` | env audit | Ops | **spec** |
| 8 | `PEIMA_P76_PRODUCTION_KILL_SWITCH=1` | env audit | Ops | **spec** |
| 9 | Post-migration table exists | `to_regclass('public.p76_allowlist_apply_meta')` | Eng | query ready |
| 10 | Violation SQL = 0 | run violation pack | Eng | query ready |

---

## Migration SQL review sign-off

| check | result |
|-------|--------|
| Creates `p76_allowlist_apply_meta` only | **yes** |
| Touches `match_results` | **no** |
| Touches `finalScore` | **no** |
| Touches worker tables | **no** |
| FK cascade acceptable for sidecar meta | **yes** (DBA r9a4) |

---

## Post-migration verification queries

```sql
-- 1) table exists
SELECT to_regclass('public.p76_allowlist_apply_meta') AS tbl;

-- 2) baseline row count (expect 0 before sidecar seed)
SELECT COUNT(*) AS row_count FROM p76_allowlist_apply_meta;

-- 3) violation: sidecar display leak (expect 0 rows)
-- (use project violation pack from r8c1 / r9b)
```

---

## Explicit do-not (r9d gate)

| item | required value |
|------|----------------|
| Enable read path during migrate step | **no** |
| Set percent > 0 | **no** |
| Seed sidecar without PM allowlist lock | **no** |
| Remove legacy matching | **no** |

---

## r9c2 round

| field | value |
|-------|-------|
| checklist documented | **yes** |
| production deploy executed | **no** |
