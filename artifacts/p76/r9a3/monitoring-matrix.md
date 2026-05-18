# P7.6-r9a3 — Monitoring Matrix Evidence

> **Gap:** G-04 · **Status:** **partial** — thresholds defined · **dashboard TODO** (not live)  
> **Closeout:** [P7.6-r9a3](../../../docs/P7/P7.6-r9a3-production-readiness-remediation-execution-closeout.md)

---

## Metrics

| metric | source / query | dashboard | owner | alert threshold | severity | status |
|--------|----------------|-----------|-------|-----------------|----------|--------|
| `readPathAttemptCount` | app log `p76.read_path.attempt` | **TODO** Grafana `p76-read-path` | Peima Ops (observability) | n/a · baseline | P2 | partial |
| `sidecarReadSuccessCount` | log `p76.read_path.sidecar_success` | **TODO** | Peima Ops (observability) | n/a | P2 | partial |
| `fallbackLegacyCount` | log `p76.read_path.fallback_legacy` | **TODO** | Peima Ops (observability) | warn if 0 while path enabled >5m | P1 | partial |
| `violationBlockedCount` | log `p76.read_path.violation_blocked` | **TODO** | Peima Ops (observability) | any display after block = **P0** | **P0** | partial |
| `exceptionFallbackCount` | log `p76.read_path.exception_fallback` | **TODO** | Peima Ops (observability) | >10/5m | P1 | partial |
| `finalScoreChangedCount` | SQL audit / metric `p76.final_score_changed` | **TODO** | Peima API Eng | **>0 = P0** | **P0** | partial |
| `matchResultChangedCount` | SQL audit `match_results` UPDATE | **TODO** | Peima API Eng | **>0 = P0** | **P0** | partial |
| `workerChangedCount` | worker audit log | **TODO** | Peima API Eng | **>0 = P0** | **P0** | partial |
| `nonAllowlistAttemptCount` | log `p76.read_path.non_allowlist` | **TODO** | Peima Ops (observability) | sidecar display success **>0 = P0** | **P0** | partial |
| `rollbackCount` | deploy / env change events | **TODO** | Peima Ops (Platform) | info | P2 | partial |

---

## P0 composite rules

| condition | response |
|-----------|----------|
| `finalScoreChangedCount > 0` | kill switch · percent=0 · page on-call |
| `matchResultChangedCount > 0` | same |
| `workerChangedCount > 0` | same |
| non-allowlist `displaySourceType=p76_allowlist_sidecar_readonly` | same |
| rolledBack row used for P7.6 display | same |
| violation row used for display | same |

---

## Gap note

- Instrumentation hooks **not implemented** in code this round (docs-only).
- Dashboard URLs **TBD** until observability ticket completes.
- Matrix satisfies **planning** rerun; r9a1 may still **pending** monitoring until live dashboard.
