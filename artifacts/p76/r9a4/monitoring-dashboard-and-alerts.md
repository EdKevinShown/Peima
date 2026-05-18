# P7.6-r9a4 — Monitoring Dashboard and P0 Alerts

> **Gap:** G-04 closure · **Status:** **done** (query-based dashboard spec · live Grafana wiring deferred to Ops ticket)  
> **Closeout:** [P7.6-r9a4](../../../docs/P7/P7.6-r9a4-partial-gap-closure-evidence-closeout.md)  
> **Supersedes:** [r9a3 monitoring-matrix.md](../r9a3/monitoring-matrix.md) (thresholds retained)

---

## Dashboard

| field | value |
|-------|-------|
| name | `P7.6 — Read Path / Allowlist Display` |
| URL (placeholder) | `https://grafana.<env>/d/p76-read-path-v1` |
| type | **query-based** · log/SQL panels until app metrics shipped |
| owner | **Peima Ops (observability)** |
| backup | **Peima API Eng (matching)** |
| check frequency | on-call reviews **every 15m** during allowlist window · else **1h** |

---

## Alert routing

| severity | route | escalation |
|----------|-------|------------|
| **P0** | Pager → `#peima-incident` → Peima Ops on-call | + Eng lead (matching) within **15m** |
| **P1** | Slack `#peima-matching-alerts` | Ops → Eng if unresolved **1h** |
| **P2** | Dashboard annotation only | daily review |

**Escalation path:** L1 Monitoring owner → L2 Ops on-call → L3 Eng lead → L4 PM (P7.6)

---

## Metric panels (query + threshold)

| metric | log / query source | panel query (placeholder) | owner | threshold | severity | alert |
|--------|-------------------|----------------------------|-------|-----------|----------|-------|
| `readPathAttemptCount` | `p76.read_path.attempt` | `sum(rate({app="peima-api"} \|= "p76.read_path.attempt"[5m]))` | Ops (obs) | baseline only | P2 | no |
| `sidecarReadSuccessCount` | `p76.read_path.sidecar_success` | `sum(rate(... \|= "sidecar_success"[5m]))` | Ops (obs) | n/a | P2 | no |
| `fallbackLegacyCount` | `p76.read_path.fallback_legacy` | `sum(increase(... \|= "fallback_legacy"[5m]))` | Ops (obs) | **=0 for >5m while READ_PATH_ENABLED=1** | P1 | yes |
| `violationBlockedCount` | `p76.read_path.violation_blocked` | `sum(increase(... \|= "violation_blocked"[5m]))` | Ops (obs) | block then any sidecar display | **P0** | yes |
| `exceptionFallbackCount` | `p76.read_path.exception_fallback` | `sum(increase(... \|= "exception_fallback"[5m]))` | Ops (obs) | **>10 / 5m** | P1 | yes |
| `finalScoreChangedCount` | SQL audit | see § P0 SQL | API Eng | **>0** | **P0** | yes |
| `matchResultChangedCount` | SQL audit | see § P0 SQL | API Eng | **>0** | **P0** | yes |
| `workerChangedCount` | worker audit | `sum(increase(... \|= "worker.winner.changed"[5m]))` | API Eng | **>0** | **P0** | yes |
| `nonAllowlistAttemptCount` | `p76.read_path.non_allowlist` + response audit | sidecar display on non-allowlist | Ops (obs) | **>0 success** | **P0** | yes |
| `rollbackCount` | deploy events | `changes(env:PEIMA_P76_*)` | Ops (Platform) | info | P2 | no |

---

## P0 alert rules (mandatory)

| ruleId | condition | action |
|--------|-----------|--------|
| P0-01 | `finalScoreChangedCount > 0` | page · kill switch · percent=0 |
| P0-02 | `matchResultChangedCount > 0` | same |
| P0-03 | `workerChangedCount > 0` | same |
| P0-04 | non-allowlist `displaySourceType=p76_allowlist_sidecar_readonly` | same |
| P0-05 | rolledBack row used for P7.6 display | same |
| P0-06 | violation row used for display | same |
| P0-07 | `percent enabled without signoff` (env `PRODUCTION_PERCENT>0` without ticket PEIMA-P76-SIGNOFF) | same + BLOCK rollout |

### P0 SQL (placeholder — run on read replica / audit DB)

```sql
-- matchResultChangedCount (P0-02): rows updated after read-path window
SELECT COUNT(*) FROM match_results
WHERE "updatedAt" > :read_path_enable_time;

-- finalScoreChangedCount (P0-01): compare audit snapshot if enabled
-- workerChangedCount (P0-03): application-specific worker audit table / log
```

---

## Signoff

| role | status | date |
|------|--------|------|
| Peima Ops (observability) | **approved** (role) | 2026-05-17 |
| Peima API Eng (matching) | **approved** (role) | 2026-05-17 |

**Note:** Live Grafana dashboard import is **Ops ticket**; query spec satisfies r9a4 G-04 **done** for r9a1 rerun.
