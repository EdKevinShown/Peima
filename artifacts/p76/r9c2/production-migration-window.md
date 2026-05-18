# P7.6-r9c2 — Production Migration Window

> **Parent:** [P7.6-r9c2](../../../docs/P7/P7.6-r9c2-production-migration-window-and-rollback-drill-closeout.md)  
> **Prior review:** [r9a4 production-migration-dba-review.md](../r9a4/production-migration-dba-review.md)  
> **Status:** window **documented** · production `migrate deploy` **not executed** in r9c2

---

## Migration identity

| field | value |
|-------|-------|
| migration name | `20260517120000_p76_allowlist_apply_meta` |
| path | `packages/database/prisma/migrations/20260517120000_p76_allowlist_apply_meta/migration.sql` |
| migration type | **CREATE TABLE** (+ indexes + FK) |
| destructive | **no** |
| target environment | **production** |
| dev/staging applied | **yes** ([r8c1](../../../docs/P7/P7.6-r8c1-dev-db-migration-and-violation-sql-followup-closeout.md)) |
| production applied (r9c2) | **no** |

---

## Proposed deploy window

| field | value |
|-------|-------|
| ticket | `PEIMA-OPS-P76-MIGRATE` |
| proposed window (UTC) | **2026-05-24 02:00–04:00** (low-traffic maintenance slot) |
| timezone note | confirm with Peima Ops local on-call calendar |
| duration budget | **≤ 30 min** migrate + verification |
| change freeze overlap | none planned · confirm 24h before window |
| deploy owner | **Peima Ops (Platform)** |
| DBA witness | **Peima DBA** |
| Engineering witness | **Peima API Eng (matching)** |

---

## Approval status

| reviewer | role | status | date | notes |
|----------|------|--------|------|-------|
| Peima API Eng | Engineering | **approved** (role) | 2026-05-17 | schema = dev ([r9a4](../r9a4/production-migration-dba-review.md)) |
| Peima DBA | DBA | **approved** (role) | 2026-05-17 | non-destructive |
| Peima Ops | Platform | **approved** (role) | 2026-05-17 | window + backup ack |
| Named PM signoff for live window | PM | **pending** | — | required at **r9c rerun** / **r9d** |

---

## Pre-deploy checks

| # | check | owner |
|---|-------|-------|
| 1 | RDS snapshot / backup completed within **4h** before migrate | Ops |
| 2 | Migration SQL reviewed · matches dev revision | DBA + Eng |
| 3 | `PEIMA_P76_READ_PATH_ENABLED=0` on all prod API pods | Ops |
| 4 | `PEIMA_P76_PRODUCTION_PERCENT=0` | Ops |
| 5 | `PEIMA_P76_PRODUCTION_KILL_SWITCH=1` | Ops |
| 6 | Grafana dashboard import ticket `PEIMA-OPS-P76-GRAFANA-v2` **done** or scheduled same window | Ops |
| 7 | On-call + rollback owner confirmed | Ops + PM |
| 8 | Incident channel `#peima-incident` staffed | Ops |

---

## Post-deploy checks

| # | check | query / method | expected |
|---|-------|----------------|----------|
| 1 | Table exists | `SELECT to_regclass('public.p76_allowlist_apply_meta');` | non-null |
| 2 | Row count baseline | `SELECT COUNT(*) FROM p76_allowlist_apply_meta;` | **0** immediately after migrate (pre-seed) |
| 3 | Violation SQL | [r8c1 violation pack](../../../docs/P7/P7.6-r8c1-dev-db-migration-and-violation-sql-followup-closeout.md) | **0** rows |
| 4 | App health | `/health` · error rate | stable |
| 5 | Read path still off | env audit | `ENABLED=0` |
| 6 | No P0 alerts | Grafana | none fired |

---

## Rollback decision point

| condition | action |
|-----------|--------|
| migrate fails mid-flight | **abort** deploy · do **not** enable read path · restore from snapshot if schema partial |
| post-deploy violation SQL > 0 | **block** read path enable · Eng investigate |
| unexpected app errors | kill switch + `ENABLED=0` · **no** read path |
| table empty + need revert schema | `DROP TABLE p76_allowlist_apply_meta` (DBA only · after snapshot) |
| table has production sidecar rows | **do not** drop · env kill switch only ([kill-switch-runbook.md](./kill-switch-runbook.md)) |

**Note:** P7.6 read path does **not** mutate `MatchResult` / `finalScore` — rollback does **not** require row restore for those tables.

---

## Explicit boundary (r9c2)

| item | r9c2 round |
|------|------------|
| production `migrate deploy` | **not executed** |
| production read path | **off** |
| percent | **0** |
| legacy photo matching | **retained** |
