# P7.6-r9e2 — Production Monitoring Watch Template

> **Runbook:** [P7.6-r9e2](../../../docs/P7/P7.6-r9e2-real-prod-ops-execution-runbook.md)  
> **Dashboard:** `p76-allowlist-read-path-v2`  
> **Duration:** **30–60 min** (required)

---

## Watch metadata

| field | value |
|-------|-------|
| start (UTC) | _________________ |
| end (UTC) | _________________ |
| duration (min) | _________________ |
| on-call | _________________ |
| environment | **real production** |

---

## Traffic metrics

| metric | t+0 | t+15 | t+30 | t+45 | t+60 |
|--------|-----|------|------|------|------|
| `readPathAttemptCount` | | | | | |
| `sidecarReadSuccessCount` | | | | | |
| `fallbackLegacyCount` | | | | | |
| `exceptionFallbackCount` | | | | | |
| `userReportCount` | | | | | |
| `rollbackCount` | | | | | |

---

## P0 counters (must remain **0** entire watch)

| counter | max observed | pass |
|---------|--------------|------|
| `finalScoreChangedCount` | | ☐ |
| `matchResultChangedCount` | | ☐ |
| `workerChangedCount` | | ☐ |
| `nonAllowlistSidecarDisplayCount` | | ☐ |
| `rolledBackSidecarDisplayCount` | | ☐ |
| `violationRowDisplayCount` | | ☐ |
| `percentEnabledWithoutSignoffCount` | | ☐ |
| `productionReadPathWithoutAllowlistCount` | | ☐ |

---

## P1 notes

| signal | triggered? | action |
|--------|------------|--------|
| exceptionFallback spike | ☐ | |
| fallbackLegacy abnormal | ☐ | |
| sidecarReadSuccess drop >50% | ☐ | |
| userReport > threshold | ☐ | |
| monitoring gap >15m | ☐ | |

---

## Outcome

| result | action |
|--------|--------|
| all P0 = 0 | continue to signoff |
| any P0 > 0 | **kill switch** · `ROLLED_BACK_PROD_ALLOWLIST` |

Paste summary to r9e3 `real-prod-monitoring-watch.md`.
