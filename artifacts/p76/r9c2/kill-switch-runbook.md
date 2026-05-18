# P7.6-r9c2 — Kill Switch Runbook

> **Parent:** [P7.6-r9c2](../../../docs/P7/P7.6-r9c2-production-migration-window-and-rollback-drill-closeout.md)  
> **Extends:** [r9a3 rollback-runbook.md](../r9a3/rollback-runbook.md) · [r9c1 p0-alert-routing](../r9c1/p0-alert-routing.md)  
> **P7.10 terminology:** [P7.10-r2a](../../../docs/P7/P7.10-r2a-docs-artifacts-wording-cleanup-closeout.md)

---

## When to use

| trigger | action |
|---------|--------|
| P0 alert fired | **immediate** kill switch |
| non-allowlist sidecar display | **immediate** |
| `finalScore` / MatchResult / worker change detected | **immediate** + incident |
| PM / Ops manual stop | kill switch |

---

## Env changes (production)

Set on **all** API pods / secret store:

```bash
PEIMA_P76_PRODUCTION_KILL_SWITCH=1
PEIMA_P76_READ_PATH_ENABLED=0
PEIMA_P76_PRODUCTION_PERCENT_ENABLED=0
PEIMA_P76_PRODUCTION_PERCENT=0
PEIMA_P76_READ_PATH_VIEWER_IDS=
```

Optional additional clear (if set in deployment):

```bash
PEIMA_P76_PRODUCTION_ALLOWLIST_VIEWER_IDS=
```

**Do not** change `PEIMA_P76_READ_PATH_SOURCE_VERSION` during incident (audit trail).

---

## Restart / config reload

| platform | procedure |
|----------|-----------|
| Kubernetes | `kubectl rollout restart deployment/peima-api -n production` |
| Config reload | if hot-reload supported: push secret version → wait rollout |
| verify | all pods report new env within **5 min** |

---

## Verification steps

| # | step | expected |
|---|------|----------|
| 1 | GET allowlist viewer (JWT) | `displaySourceType=match_result_original` *(original stable result / baseline display)* |
| 2 | GET rolledBack viewer | baseline display · `fallbackReason=rolled_back` or `kill_switch` |
| 3 | GET non-allowlist | baseline display · `not_allowlisted` |
| 4 | Violation SQL | **0** |
| 5 | Grafana P0 | **no** active alerts after 10 min |
| 6 | `finalScore` sample | unchanged vs pre-incident audit |

*`match_result_original` is a persisted enum — not legacy photo matching.*

---

## Monitoring

| metric | expect after kill switch |
|--------|--------------------------|
| `p76DisplayCount` | → **0** |
| `legacyDisplayCount` *(→ **baselineDisplayCount**)* | → baseline traffic |
| `fallbackLegacyCount` *(→ **safeFallbackCount**)* | ↑ (allowlist viewers use safe fallback) |
| P0 counters | **0** |

Historical log facet remains `fallback_legacy` until **P7.10-r2b** dual-emit.

Dashboard: [r9c1 live-grafana-dashboard-spec](../r9c1/live-grafana-dashboard-spec.md)

---

## Incident communication template

```text
[P7.6 INCIDENT] Kill switch engaged — read path disabled

Time (UTC): <ISO8601>
Owner: <Ops on-call>
Action: PEIMA_P76_PRODUCTION_KILL_SWITCH=1, READ_PATH_ENABLED=0, PERCENT=0
Impact: Allowlist display overlay OFF — all viewers use baseline display (safe fallback)
MatchResult/finalScore: NOT expected to change — verify SQL audit
Next: Eng violation SQL · PM comms · rollback owner <name>
Channel: #peima-incident
```

---

## Rollback owner

| role | contact path |
|------|----------------|
| rollback owner | Peima Ops (Platform) on-call |
| Engineering | Peima API Eng (matching) |
| PM | Peima PM (matching) |
| escalation | PagerDuty `peima-matching-p0` |

---

## DB restore

**Default: not required** for read path incidents. Use [production-backup-snapshot-plan.md](./production-backup-snapshot-plan.md) only if schema migrate corruption.
