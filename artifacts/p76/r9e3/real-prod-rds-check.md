# P7.6-r9e3 — Real Prod RDS Check

> **Parent:** [P7.6-r9e3](../../../docs/P7/P7.6-r9e3-real-prod-ops-execution-closeout.md)  
> **Prod status:** **pending** — workspace has no production `DATABASE_URL`  
> **Local verification (NOT prod):** `postgresql://localhost:5432/peima` · 2026-05-18T16:27:57Z

---

## Production (required — Ops to fill)

| field | prod value | pass |
|-------|------------|------|
| RDS target | **TBD** | ☐ |
| table exists | **pending** | ☐ |
| migration `20260517120000_p76_allowlist_apply_meta` | **pending** | ☐ |
| row count | **pending** | ☐ |
| `violation_count` | **0** required | ☐ |
| `applied_count` | **4** expected | ☐ |
| `rolled_back_count` | **1** expected | ☐ |
| backup / snapshot | **pending** | ☐ |
| **result** | **pending** | |

---

## Local SQL output (rehearsal only — do not use as prod PASS)

Executed: `tmp/p76-r9e3-prod-sql.sql` on `peima-postgres`

```text
        table_name        
--------------------------
 p76_allowlist_apply_meta

 row_count = 5

 violation_count = 0
 applied_count = 4
 rolled_back_count = 1
```

Sidecar rows (5): 4× `applied=t` · 1× `rolledBack=t` · all violation flags **f** · `sourceVersion=p7.6-r7j3-staging-cohort-v1`

---

## Gate

Prod RDS check **must** be re-run on **real production RDS** with output pasted above in **Production** section.
