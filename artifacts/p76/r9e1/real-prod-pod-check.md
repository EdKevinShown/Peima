# P7.6-r9e1 — Real Prod Pod Check

> **Parent:** [P7.6-r9e1](../../../docs/P7/P7.6-r9e1-real-prod-ops-reverify-closeout.md)  
> **Status:** **pending**  
> **Owner:** Peima Ops (Platform)

---

## Service

| field | value |
|-------|-------|
| service | `peima-api` (production namespace) |
| pod / deployment checked | **pending** |
| image / commit | **TBD** |
| config source | production secret store |

---

## Env verification (required)

| variable | required value | status | observed |
|----------|----------------|--------|----------|
| `PEIMA_P76_READ_PATH_ENABLED` | `1` (if live) or `0` (pre-cutover) | **pending** | — |
| `PEIMA_P76_READ_PATH_VIEWER_IDS` | 5 Route C ids (PM-locked) | **pending** | — |
| `PEIMA_P76_READ_PATH_SOURCE_VERSION` | `p7.6-r7j3-staging-cohort-v1` | **pending** | — |
| `PEIMA_P76_PRODUCTION_PERCENT_ENABLED` | `0` | **pending** | — |
| `PEIMA_P76_PRODUCTION_PERCENT` | `0` | **pending** | — |
| `PEIMA_P76_PRODUCTION_KILL_SWITCH` | `0` during live · `1` when frozen | **pending** | — |

---

## Policy checks

| check | required | status |
|-------|----------|--------|
| percent remains **0** | yes | **pending** |
| allowlist-only read path | yes | **pending** |
| no default-on for all users | yes | **pending** |

---

## Allowlist viewer ids (PM lock)

```
cmr4hm001016z64demo00m05a
cmfemn00100016z64seed0001
cmr4hf000716z64demo00f04a
cmr4hf000916z64demo00f05a
cmr4r7j4050025z64stag0001  (rolledBack)
```

---

## Rehearsal reference

[r9d production-env-applied.md](../../r9d/production-env-applied.md) — local harness live-window values.
