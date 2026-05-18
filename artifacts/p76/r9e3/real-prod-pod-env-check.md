# P7.6-r9e3 — Real Prod Pod / Env Check

> **Parent:** [P7.6-r9e3](../../../docs/P7/P7.6-r9e3-real-prod-ops-execution-closeout.md)  
> **Prod status:** **pending**

---

## Production pods (Ops to fill)

| field | required | prod observed | pass |
|-------|----------|---------------|------|
| deployment | `peima-api` prod | **pending** | ☐ |
| image / commit | recorded | **pending** | ☐ |
| `PEIMA_P76_READ_PATH_ENABLED` | controlled | **pending** | ☐ |
| `PEIMA_P76_READ_PATH_VIEWER_IDS` | 5 Route C ids | **pending** | ☐ |
| `PEIMA_P76_READ_PATH_SOURCE_VERSION` | `p7.6-r7j3-staging-cohort-v1` | **pending** | ☐ |
| `PEIMA_P76_PRODUCTION_PERCENT_ENABLED` | `0` | **pending** | ☐ |
| `PEIMA_P76_PRODUCTION_PERCENT` | `0` | **pending** | ☐ |
| `PEIMA_P76_PRODUCTION_KILL_SWITCH` | available | **pending** | ☐ |
| percent = **0** | yes | **pending** | ☐ |
| allowlist-only | yes | **pending** | ☐ |
| fallback legacy on | yes | **pending** | ☐ |
| **result** | | **pending** | |

---

## Harness reference only (NOT prod)

From [r9d production-env-applied.md](../r9d/production-env-applied.md) — **in-process dev harness** · `localhost:5432`

---

## Gate

Prod `kubectl describe` / secret export required for PASS.
