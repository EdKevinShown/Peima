# P7.6-r9e1 — Real Prod Monitoring Watch

> **Parent:** [P7.6-r9e1](../../../docs/P7/P7.6-r9e1-real-prod-ops-reverify-closeout.md)  
> **Status:** **pending**  
> **Owner:** Peima Ops (observability) + on-call

---

## Watch window

| field | required | status |
|-------|----------|--------|
| duration | **30–60 min** | **pending** |
| dashboard | `p76-allowlist-read-path-v2` | **pending** |
| environment | real production | **pending** |
| start / end (UTC) | recorded | **TBD** |

---

## Traffic metrics (record on prod)

| metric | rehearsal (r9d) | prod |
|--------|-------------------|------|
| `readPathAttemptCount` | 6 | **pending** |
| `sidecarReadSuccessCount` | 4 | **pending** |
| `fallbackLegacyCount` | 2 | **pending** |
| `exceptionFallbackCount` | 0 | **pending** |
| `userReportCount` | 0 | **pending** |
| `rollbackCount` | 0 | **pending** |

---

## P0 counters (must = 0 on prod)

| counter | rehearsal | prod |
|---------|-----------|------|
| `finalScoreChangedCount` | 0 | **pending** |
| `matchResultChangedCount` | 0 | **pending** |
| `workerChangedCount` | 0 | **pending** |
| `nonAllowlistSidecarDisplayCount` | 0 | **pending** |
| `rolledBackSidecarDisplayCount` | 0 | **pending** |
| `violationRowDisplayCount` | 0 | **pending** |
| `percentEnabledWithoutSignoffCount` | 0 | **pending** |
| `productionReadPathWithoutAllowlistCount` | 0 | **pending** |

---

## Gate

Incomplete watch → **`NEED_MORE_PROD_REVERIFY`** · not `PASS_REAL_PROD_REVERIFY`.
