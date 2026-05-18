# P7.6-r9c1 — Monitoring Query Pack

> **Closeout:** [P7.6-r9c1](../../../docs/P7/P7.6-r9c1-live-grafana-p0-alert-closeout.md)  
> **Extends:** [r9a4 monitoring-dashboard-and-alerts.md](../r9a4/monitoring-dashboard-and-alerts.md)  
> **P7.10 terminology:** [P7.10-r2a](../../../docs/P7/P7.10-r2a-docs-artifacts-wording-cleanup-closeout.md)

**Grafana implementation owner:** Peima Ops (observability)  
**Expected dashboard URL (placeholder):** `https://grafana.prod.internal/d/p76-allowlist-read-path-v2`  
**Before r9d requirement:** Import panels + wire P0 alerts (ticket `PEIMA-OPS-P76-GRAFANA-v2`)

---

## P7.10 safe fallback terminology (r2a)

| Preferred (P7.10) | Historical (runtime until r2b) | Meaning |
|-------------------|-------------------------------|---------|
| `safe_fallback` | log facet `fallback_legacy` | Sidecar ineligible → use baseline display from `resolveMatchResultDisplay` |
| `safeFallbackCount` | metric `fallbackLegacyCount` | Count of safe fallbacks (not photo matching) |
| `baselineDisplayCount` | metric `legacyDisplayCount` | Alias of safe fallback volume |

- **Do not** interpret these metrics as「旧照片匹配兜底」.
- **Keep** historical queries below until **P7.10-r2b** dual-emit adds `safe_fallback` logs.
- **Target query** (inactive until r2b): `sum(increase(... |= "safe_fallback"[5m]))` — do not use against current logs yet.

---

| metric | source | query / pseudo-query | owner | threshold | severity | alert route |
|--------|--------|-------------------|-------|-----------|----------|-------------|
| `readPathAttemptCount` | log `p76.read_path.attempt` | `sum(rate({app="peima-api",env="prod"} \|= "p76.read_path.attempt"[5m]))` | Ops (obs) | baseline | P2 | none |
| `sidecarReadSuccessCount` | log `p76.read_path.sidecar_success` | `sum(increase(... \|= "sidecar_success"[5m]))` | Ops (obs) | drop >50% vs 1h baseline | P1 | `#peima-matching-alerts` |
| `fallbackLegacyCount` *(interpret as **safeFallbackCount**)* | log `p76.read_path.fallback_legacy` | **Current/historical:** `sum(increase(... \|= "fallback_legacy"[5m]))` | Ops (obs) | =0 while path on >5m | P1 | P1 channel |
| `nonAllowlistAttemptCount` | log + API audit | sidecar display where viewer ∉ allowlist | Ops (obs) | **success >0** | **P0** | pager |
| `rolledBackBlockedCount` | log `p76.read_path.rolled_back_blocked` | `sum(increase(... \|= "rolled_back_blocked"[5m]))` | Ops (obs) | display leak >0 | **P0** | pager |
| `violationBlockedCount` | log `p76.read_path.violation_blocked` | `sum(increase(... \|= "violation_blocked"[5m]))` | Ops (obs) | display after block >0 | **P0** | pager |
| `exceptionFallbackCount` | log `p76.read_path.exception_fallback` | `sum(increase(... \|= "exception_fallback"[5m]))` | Ops (obs) | **>10 / 5m** | P1 | P1 channel |
| `p76DisplayCount` | log `p76.read_path.sidecar_success` | alias of sidecar success | Ops (obs) | n/a | P2 | none |
| `legacyDisplayCount` *(interpret as **baselineDisplayCount**)* | log `p76.read_path.fallback_legacy` | alias of safe fallback count | Ops (obs) | n/a | P2 | none |
| `finalScoreChangedCount` | SQL audit / metric | `count(match_results where updatedAt > :t0 and userId in allowlist_window)` | API Eng | **>0** | **P0** | pager |
| `matchResultChangedCount` | SQL audit | same + `candidateUserId` change detector | API Eng | **>0** | **P0** | pager |
| `workerChangedCount` | worker audit log | `sum(increase(... \|= "worker.winner.changed"[5m]))` | API Eng | **>0** | **P0** | pager |
| `rollbackCount` | deploy / env events | `count(env:PEIMA_P76_* changed)` | Ops (Platform) | info | P2 | annotation |
| `userReportCount` | support queue tag `p76-read-path` | external ticketing API | PM | **>3 / 24h** during window | P1 | PM + Ops |

### Env / gate panels (pseudo-queries)

| check | query |
|-------|-------|
| percent without signoff | `PEIMA_P76_PRODUCTION_PERCENT > 0` AND no ticket `PEIMA-P76-SIGNOFF` |
| read path without allowlist | `READ_PATH_ENABLED=1` AND `VIEWER_IDS` empty OR non-allowlist sidecar success >0 |
| kill switch | `PEIMA_P76_PRODUCTION_KILL_SWITCH=1` → expect p76DisplayCount → 0 |

### Target query block (after P7.10-r2b dual-emit only)

```text
safeFallbackCount_target = sum(increase({...} |= "safe_fallback"[5m]))
```

**Not active** until r2b code emits `safe_fallback` alongside `fallback_legacy`.
