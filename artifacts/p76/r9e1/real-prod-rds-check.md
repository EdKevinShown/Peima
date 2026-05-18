# P7.6-r9e1 — Real Prod RDS Check

> **Parent:** [P7.6-r9e1](../../../docs/P7/P7.6-r9e1-real-prod-ops-reverify-closeout.md)  
> **Status:** **pending**  
> **Owner:** Peima DBA + Peima Ops (Platform)

---

## Target

| field | value |
|-------|-------|
| RDS target | **TBD** — production PostgreSQL endpoint (not in workspace) |
| schema | `public` |
| ticket | `PEIMA-OPS-P76-MIGRATE` |

---

## Verification (required)

| check | required | status | observed |
|-------|----------|--------|----------|
| `p76_allowlist_apply_meta` exists | yes | **pending** | — |
| migration name | `20260517120000_p76_allowlist_apply_meta` | **pending** | — |
| migration type | CREATE TABLE · non-destructive | **pending** | — |
| table row count | 5 Route C expected post-seed | **pending** | — |
| `violation_count` | **0** | **pending** | — |
| `applied_count` | **4** | **pending** | — |
| `rolled_back_count` | **1** | **pending** | — |
| backup / snapshot | pre-cutover ≤ 4h | **pending** | — |
| production DB write (r9e1 round) | **no** | **n/a** | docs only |

---

## SQL pack (Ops execute on prod)

```sql
SELECT to_regclass('public.p76_allowlist_apply_meta') AS tbl;

SELECT COUNT(*) AS row_count FROM p76_allowlist_apply_meta;

SELECT COUNT(*)::int AS violation_count
FROM p76_allowlist_apply_meta
WHERE "appliedToMatchResult" = true
   OR "appliedToFinalScore" = true
   OR "appliedToWorkerRanking" = true
   OR "appliedToDisplay" = true;

SELECT COUNT(*)::int AS applied_count
FROM p76_allowlist_apply_meta WHERE "applied" = true;

SELECT COUNT(*)::int AS rolled_back_count
FROM p76_allowlist_apply_meta WHERE "rolledBack" = true;
```

---

## Rehearsal baseline ([r9d](../../r9d/r9d-execution-summary.json))

| metric | rehearsal value |
|--------|-------------------|
| `violation_count` | **0** |
| `applied_count` | **4** |
| `rolled_back_count` | **1** |

---

## Notes

- Workspace has **no** production `DATABASE_URL` — check must be run by Ops on prod RDS.
- Unexpected schema drift → **block** · do not `PASS_REAL_PROD_REVERIFY`.
