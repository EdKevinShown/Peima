# P7.6-r9a4 — Staging Rollback Drill Closeout

> **Gap:** G-07 closure · **Status:** **done** (dev/staging **tabletop + smoke replay** · no production)  
> **Closeout:** [P7.6-r9a4](../../../docs/P7/P7.6-r9a4-partial-gap-closure-evidence-closeout.md)  
> **Runbook:** [r9a3 rollback-runbook.md](../r9a3/rollback-runbook.md)

---

## Drill metadata

| field | value |
|-------|-------|
| date (UTC) | 2026-05-17 |
| environment | **dev/staging** (`localhost:5432` / `peima-postgres`) |
| type | tabletop + **smoke replay** (r8h2 disabled baseline) |
| executor | Peima Ops (Platform) role |
| result | **pass** |

---

## Pre-state

| item | value |
|------|-------|
| `PEIMA_P76_READ_PATH_ENABLED` | `1` (from [r8h2 enabled smoke](../../../docs/P7/P7.6-r8h2-dev-allowlist-display-smoke-closeout.md)) |
| allowlist | 5 Route C viewer ids |
| sidecar rows | 5 · `sourceVersion=p7.6-r7j3-staging-cohort-v1` |
| display | 4/4 sidecar readonly · 1 rolledBack legacy |

---

## Actions (runbook steps 1–4)

| step | action | evidence |
|------|--------|----------|
| 1 | kill switch **documented** `PEIMA_P76_PRODUCTION_KILL_SWITCH=1` | runbook ack |
| 2 | read path disabled `PEIMA_P76_READ_PATH_ENABLED=0` | replay [display-smoke-disabled.json](../../r8h2/display-smoke-disabled.json) |
| 3 | percent=0 | env template [production-env-template.md](../r9a3/production-env-template.md) |
| 4 | allowlist cleared (env empty) | disabled smoke uses empty effective allowlist via env=0 |
| 5 | API reload | N/A dev harness · prod = pod reload per Ops |

---

## Post-state verification

| check | result |
|-------|--------|
| legacy fallback | **pass** — all 5 viewers `match_result_original` · `fallbackReason=env_disabled` |
| `finalScore` restore needed | **no** — unchanged **0.75** in artifact |
| `MatchResult` restore needed | **no** — no DB writes in read path |
| worker affected | **no** |
| `displaySourceType` sidecar | **absent** after rollback |

---

## Owner signoff

| role | status | date |
|------|--------|------|
| Peima Ops (Platform) | **pass** (role) | 2026-05-17 |
| Peima API Eng (matching) | **witness** (role) | 2026-05-17 |

---

## Notes

- Live **staging pod** env toggle drill recommended again before **r9c** production allowlist live.
- r9a4 drill satisfies G-07 for **r9a1 rerun**; not a substitute for production rollback test.
