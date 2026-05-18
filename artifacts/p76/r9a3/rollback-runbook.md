# P7.6-r9a3 — Rollback Runbook Evidence

> **Gap:** G-07 · **Status:** **partial** — runbook **done** · staging drill **not executed**  
> **Closeout:** [P7.6-r9a3](../../../docs/P7/P7.6-r9a3-production-readiness-remediation-execution-closeout.md)

---

## Owner

| role | owner |
|------|-------|
| Rollback owner | **Peima Ops (Platform)** |
| backup | Peima API Eng (matching) |

---

## Commands (env / config)

| step | action |
|------|--------|
| 1 | `PEIMA_P76_PRODUCTION_KILL_SWITCH=1` |
| 2 | `PEIMA_P76_READ_PATH_ENABLED=0` |
| 3 | `PEIMA_P76_PRODUCTION_PERCENT=0` |
| 4 | `PEIMA_P76_READ_PATH_VIEWER_IDS=` and `PEIMA_P76_PRODUCTION_ALLOWLIST_VIEWER_IDS=` cleared |
| 5 | Restart API pods / reload config per platform standard |
| 6 | Verify sample viewers return legacy `displaySourceType` |

---

## Legacy fallback verification

- Spot-check: allowlist viewer → `match_result_original` or legacy candidate
- `finalScore` / `MatchResult.candidateUserId` unchanged (SQL pre/post)
- worker winner unchanged

---

## Incident note template

```markdown
## P7.6 read path rollback
- Time (UTC):
- Trigger (metric / manual):
- Actions taken (steps 1–6):
- Viewers sampled:
- fallbackLegacyCount after rollback:
- PM notified: Y/N
- Ops notified: Y/N
```

---

## PM/Ops notification

- Slack `#peima-incident` (placeholder)
- On-call pager for P0 metrics ([monitoring-matrix.md](./monitoring-matrix.md))

---

## Staging drill

| field | value |
|-------|-------|
| status | **not executed** (r9a3 docs-only) |
| planned | before r9c production allowlist live |
| artifact | `artifacts/p76/r9a3/rollback-drill.json` (future) |

---

## Proof requirements (unchanged)

- Rollback does **not** require restoring `MatchResult` or `finalScore`
- Worker unaffected
- Legacy path remains intact
