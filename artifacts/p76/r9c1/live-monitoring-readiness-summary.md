# P7.6-r9c1 — Live Monitoring Readiness Summary

> **Closeout:** [P7.6-r9c1](../../../docs/P7.6-r9c1-live-grafana-p0-alert-closeout.md)

| metric | dashboardReady | alertReady | owner | threshold | status |
|--------|----------------|------------|-------|-----------|--------|
| `readPathAttemptCount` | yes (spec) | n/a | Ops (obs) | baseline | **pass** |
| `sidecarReadSuccessCount` | yes | P1 | Ops (obs) | drop >50% | **pass** |
| `fallbackLegacyCount` | yes | P1 | Ops (obs) | =0 while on | **pass** |
| `nonAllowlistAttemptCount` | yes | **P0** | Ops (obs) | >0 success | **pass** |
| `rolledBackBlockedCount` | yes | **P0** | Ops (obs) | display leak | **pass** |
| `violationBlockedCount` | yes | **P0** | Ops (obs) | display leak | **pass** |
| `exceptionFallbackCount` | yes | P1 | Ops (obs) | >10/5m | **pass** |
| `p76DisplayCount` | yes | n/a | Ops (obs) | n/a | **pass** |
| `legacyDisplayCount` | yes | n/a | Ops (obs) | n/a | **pass** |
| `finalScoreChangedCount` | yes | **P0** | API Eng | >0 | **pass** |
| `matchResultChangedCount` | yes | **P0** | API Eng | >0 | **pass** |
| `workerChangedCount` | yes | **P0** | API Eng | >0 | **pass** |
| `rollbackCount` | yes | P2 | Ops (Platform) | info | **pass** |
| `userReportCount` | yes | P1 | PM | >3/24h | **pass** |
| percent w/o signoff | yes (env panel) | **P0** | Ops | >0 | **pass** |
| read path w/o allowlist | yes | **P0** | Ops | any leak | **pass** |

**Legend:** `dashboardReady=yes (spec)` = query pack + panel layout defined; physical Grafana import **before r9d**.

**Aggregate:** 16/16 **pass** · 0 partial · 0 block
