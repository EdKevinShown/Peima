# P7.6-r9e — Monitoring Watch Summary

> **Parent:** [P7.6-r9e](../../../docs/P7/P7.6-r9e-production-allowlist-monitoring-closeout.md)  
> **Source:** [r9d monitoring](../../r9d/production-monitoring-watch.md) · [r9d execution summary](../../r9d/r9d-execution-summary.json)

---

## Watch windows

| window | environment | duration | status |
|--------|-------------|----------|--------|
| r9d rehearsal | `local-docker-peima-postgres` | **2 min** (snapshot) | **green** |
| real production Ops | prod RDS / prod pods | **30–60 min** (required) | **pending** |

**`realProdWatchStatus`:** **`pending`**

---

## Dashboard

| field | value |
|-------|-------|
| dashboard id | `p76-allowlist-read-path-v2` |
| ticket | `PEIMA-OPS-P76-GRAFANA-v2` |
| spec | [r9c1 live-grafana-dashboard-spec](../r9c1/live-grafana-dashboard-spec.md) |
| real prod import | **pending** Ops reverify |

---

## Traffic metrics (rehearsal snapshot · 2026-05-18)

| metric | value | notes |
|--------|-------|-------|
| `readPathAttemptCount` | **6** | GET smoke sample |
| `sidecarReadSuccessCount` | **4** | allowlist active |
| `fallbackLegacyCount` | **2** | rolledBack + non-allowlist |
| `exceptionFallbackCount` | **0** | |
| `userReportCount` | **0** | |
| `rollbackCount` | **0** | no rollback in r9d |

---

## P0 composite (rehearsal)

All **0** — see [p0-p1-counter-snapshot.json](./p0-p1-counter-snapshot.json).

---

## Ops action required

1. Complete **30–60 min** Grafana watch on **real prod** after prod cutover.
2. Record results in [P7.6-r9e1](../../../docs/P7/P7.6-r9e1-real-prod-ops-reverify-closeout.md)（待编写）or update [prod-ops-reverify-status.md](./prod-ops-reverify-status.md).
