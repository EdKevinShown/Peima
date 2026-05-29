# P7.6-r9e2 — Production Rollback Drill Runbook

> **Runbook:** [P7.6-r9e2](../../../docs/P7/P7.6-r9e2-real-prod-ops-execution-runbook.md)  
> **Ticket:** `PEIMA-OPS-P76-PROD-ROLLBACK-DRILL`  
> **Extends:** [r9c2 kill-switch-runbook](../r9c2/kill-switch-runbook.md)

---

## Steps (production pods)

| step | action | done |
|------|--------|------|
| 1 | `PEIMA_P76_PRODUCTION_KILL_SWITCH=1` | ☐ |
| 2 | `PEIMA_P76_READ_PATH_ENABLED=0` | ☐ |
| 3 | `PEIMA_P76_PRODUCTION_PERCENT_ENABLED=0` | ☐ |
| 4 | `PEIMA_P76_PRODUCTION_PERCENT=0` | ☐ |
| 5 | `PEIMA_P76_READ_PATH_VIEWER_IDS=` (empty) | ☐ |
| 6 | rollout restart / config reload | ☐ |
| 7 | GET smoke sample (allowlist viewer) | ☐ |
| 8 | verify legacy fallback | ☐ |
| 9 | verify Grafana no P0 (10 min) | ☐ |
| 10 | notify PM / Ops / Eng (`#peima-incident`) | ☐ |

---

## Verification

| check | expected | pass |
|-------|----------|------|
| `displaySourceType` | `match_result_original` (not sidecar) | ☐ |
| MatchResult restore needed | **no** | ☐ |
| finalScore restore needed | **no** | ☐ |
| worker affected | **no** | ☐ |
| violation SQL | 0 | ☐ |

---

## After drill

- Document in [r9e1 real-prod-rollback-drill-closeout](../r9e1/real-prod-rollback-drill-closeout.md) → r9e3 update
- Re-enable read path **only** if live window still approved

---

## Incident template

```text
[P7.6 DRILL] Production rollback drill complete
Time (UTC): <ISO8601>
Result: legacy fallback verified · no MatchResult/finalScore restore
Channel: #peima-incident
```
