# P7.6-r9c2 — Rollback Drill Closeout

> **Parent:** [P7.6-r9c2](../../../docs/P7/P7.6-r9c2-production-migration-window-and-rollback-drill-closeout.md)  
> **Runbook:** [kill-switch-runbook.md](./kill-switch-runbook.md)  
> **Prior drill:** [r9a4 staging-rollback-drill](../r9a4/staging-rollback-drill-closeout.md)

---

## Drill summary

| field | value |
|-------|-------|
| drill id | `P76-R9C2-ROLLBACK-DRILL-001` |
| date (UTC) | **2026-05-17** |
| environment | **dev/staging tabletop + smoke replay** |
| production pod drill | **not executed** (by policy this round) |
| requirement before **r9d** | **production** env-toggle drill on live pods (≤ 15 min) |
| overall result | **pass** (staging evidence accepted for r9c2) |

---

## Required drill checks

| # | check | result | evidence |
|---|-------|--------|----------|
| 1 | kill switch enabled | **pass** | `PEIMA_P76_PRODUCTION_KILL_SWITCH=1` documented |
| 2 | `PEIMA_P76_READ_PATH_ENABLED=0` | **pass** | [r8h2 disabled smoke](../../r8h2/display-smoke-disabled.json) replay |
| 3 | `PEIMA_P76_PRODUCTION_PERCENT=0` | **pass** | [production-env-freeze.md](./production-env-freeze.md) |
| 4 | allowlist cleared or ignored | **pass** | empty `VIEWER_IDS` + kill switch |
| 5 | legacy fallback verified | **pass** | 5/5 `match_result_original` · `env_disabled` |
| 6 | no MatchResult restore needed | **pass** | no DB writes on read path |
| 7 | no finalScore restore needed | **pass** | **0.75** unchanged in artifacts |
| 8 | worker unaffected | **pass** | no worker env touched |
| 9 | monitoring observes fallback | **pass** (spec) | [r9c1 query pack](../r9c1/monitoring-query-pack.md) `fallbackLegacyCount` |
| 10 | PM/Ops/Eng notification path | **pass** (documented) | [r9c1 p0-alert-routing](../r9c1/p0-alert-routing.md) |

---

## Actions executed (replay)

| step | action |
|------|--------|
| 1 | Set kill switch **on** (documented prod command) |
| 2 | `PEIMA_P76_READ_PATH_ENABLED=0` |
| 3 | `PEIMA_P76_PRODUCTION_PERCENT_ENABLED=0` · `PEIMA_P76_PRODUCTION_PERCENT=0` |
| 4 | Clear `PEIMA_P76_READ_PATH_VIEWER_IDS` |
| 5 | Verify GET → legacy · no `p76_allowlist_sidecar_readonly` |
| 6 | Violation SQL = 0 |
| 7 | Notify template sent (tabletop) |

---

## Post-drill verification

| metric | expected | observed |
|--------|----------|----------|
| `displaySourceType` | `match_result_original` | **yes** (5/5) |
| `finalScoreChangedCount` | 0 | **0** |
| `matchResultChangedCount` | 0 | **0** |
| `workerChangedCount` | 0 | **0** |
| Grafana P0 | none | **none** (dev) |

---

## Production drill gap (before r9d only)

| item | status |
|------|--------|
| Live prod pod env reload + GET sample | **required before r9d** · **not blocking r9c signoff rerun** |
| Owner | Peima Ops |
| Ticket | `PEIMA-OPS-P76-PROD-ROLLBACK-DRILL` |

---

## Signoff

| role | result | date |
|------|--------|------|
| Peima Ops (Platform) | **pass** (role) | 2026-05-17 |
| Peima API Eng (matching) | **witness** (role) | 2026-05-17 |
| Peima PM (matching) | **ack** (role) | 2026-05-17 |
