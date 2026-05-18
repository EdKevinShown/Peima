# P7.6-r9c2 — Production Backup / Snapshot Plan

> **Migration:** `20260517120000_p76_allowlist_apply_meta`  
> **Parent:** [P7.6-r9c2](../../../docs/P7/P7.6-r9c2-production-migration-window-and-rollback-drill-closeout.md)

---

## Ownership

| role | owner |
|------|-------|
| backup owner | **Peima Ops (Platform)** |
| restore owner | **Peima DBA** |
| restore decision authority | **Peima Ops** + **Peima PM** (matching) |
| Engineering witness | **Peima API Eng (matching)** |

---

## Snapshot policy

| field | value |
|-------|-------|
| mechanism | RDS automated snapshot + **manual pre-migrate snapshot** |
| snapshot timing | **≤ 4 hours** before `migrate deploy` (target: T-2h) |
| retention | **7 days** minimum |
| snapshot name pattern | `peima-prod-pre-p76-allowlist-meta-YYYYMMDD-HHMM` |
| ticket | `PEIMA-OPS-P76-MIGRATE` (linked) |

---

## Restore decision conditions

| trigger | restore? | notes |
|---------|----------|-------|
| migrate fails · schema partial | **yes** (DBA) | full instance restore or PITR per runbook |
| migrate succeeds · read path issue | **no** DB restore | env kill switch only |
| accidental sidecar seed wrong data | **no** full restore default | delete sidecar rows + re-seed; snapshot only if corruption |
| `MatchResult` / `finalScore` concern | **no restore needed** | P7.6 does **not** mutate these |

---

## Estimated restore time

| scenario | ETA |
|----------|-----|
| env-only rollback (kill switch) | **< 5 min** |
| manual `DROP TABLE` (empty table only) | **< 15 min** |
| RDS snapshot restore (full) | **30–90 min** (instance size dependent) |

---

## Verification after backup

| check | method |
|-------|--------|
| snapshot exists | AWS console / IaC output |
| snapshot id recorded | ticket `PEIMA-OPS-P76-MIGRATE` comment |
| restore drill (tabletop) | DBA ack restore runbook accessible |

---

## Verification after restore (if ever needed)

```sql
-- Core tables unchanged row counts vs pre-migrate audit (sample)
SELECT COUNT(*) FROM match_results;
-- P7.6 sidecar table state per decision
SELECT COUNT(*) FROM p76_allowlist_apply_meta;
```

---

## P7.6-specific note

Rollback of read path overlay **must not** require restoring `MatchResult` or `finalScore` because:

- read path is **display-only**
- `candidateUserId` on `MatchResult` is **not** written by P7.6
- `finalScore` is **not** written by P7.6
- worker / M6 / RRM main chain **unaffected**

Evidence: [r9b HTTP GET](../../../docs/P7/P7.6-r9b-http-get-smoke-execution-closeout.md) · [r8h2 display smoke](../../../docs/P7/P7.6-r8h2-dev-allowlist-display-smoke-closeout.md)

---

## r9c2 status

| item | status |
|------|--------|
| plan documented | **done** |
| production snapshot taken | **no** (migrate not executed) |
