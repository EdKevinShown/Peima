# P7.6-r9e1 — Real Prod Rollback Drill Closeout

> **Parent:** [P7.6-r9e1](../../../docs/P7/P7.6-r9e1-real-prod-ops-reverify-closeout.md)  
> **Status:** **pending**  
> **Ticket:** `PEIMA-OPS-P76-PROD-ROLLBACK-DRILL`  
> **Runbook:** [r9c2 kill-switch-runbook.md](../r9c2/kill-switch-runbook.md)

---

## Drill metadata

| field | value |
|-------|-------|
| environment | **real production pods** |
| executed | **no** (r9e1 docs round) |
| result | **pending** |

---

## Required checks

| # | check | status |
|---|-------|--------|
| 1 | kill switch `PEIMA_P76_PRODUCTION_KILL_SWITCH=1` | **pending** |
| 2 | `PEIMA_P76_READ_PATH_ENABLED=0` | **pending** |
| 3 | `PEIMA_P76_PRODUCTION_PERCENT=0` | **pending** |
| 4 | allowlist cleared / ignored | **pending** |
| 5 | GET → legacy fallback | **pending** |
| 6 | no MatchResult restore | **pending** |
| 7 | no finalScore restore | **pending** |
| 8 | worker unaffected | **pending** |
| 9 | Grafana no P0 after drill | **pending** |

---

## Rehearsal baseline

[r9d step0-production-rollback-drill-closeout.md](../../r9d/step0-production-rollback-drill-closeout.md) — **pass** on local-docker-rehearsal.

---

## Gate

Prod pod drill **must pass** before `PASS_REAL_PROD_REVERIFY`.
