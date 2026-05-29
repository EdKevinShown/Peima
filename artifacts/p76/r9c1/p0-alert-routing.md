# P7.6-r9c1 — P0 Alert Routing

> **Closeout:** [P7.6-r9c1](../../../docs/P7.6-r9c1-live-grafana-p0-alert-closeout.md)

## Owners

| role | primary | backup |
|------|---------|--------|
| PM | Peima PM (P7.6) | Peima PM backup |
| Ops | Peima Ops (Platform) | On-call platform engineer |
| Engineering | Peima API Eng (matching) | Peima API Eng backup |
| Monitoring | Peima Ops (observability) | API Eng (matching) |
| Incident | Peima Ops on-call | Eng lead (matching) |
| Rollback | Peima Ops (Platform) | API Eng (matching) |

## Channels

| severity | channel | SLA (ack) |
|----------|---------|-----------|
| **P0** | PagerDuty `peima-p76-read-path` → Slack `#peima-incident` | **15 min** |
| **P1** | Slack `#peima-matching-alerts` | **1 h** |
| **P2** | Grafana annotation + daily standup | next business day |

## Escalation

```text
L1 Monitoring owner (observability)
  → L2 Ops on-call (15m)
  → L3 Eng lead matching (30m)
  → L4 PM P7.6 (1h)
  → L5 Incident commander
```

## P0 auto-actions (runbook)

1. Page on-call
2. Set `PEIMA_P76_PRODUCTION_KILL_SWITCH=1`
3. Set `PEIMA_P76_READ_PATH_ENABLED=0` · `PEIMA_P76_PRODUCTION_PERCENT=0`
4. Clear allowlist env
5. Verify legacy fallback via GET smoke sample
6. Open incident doc from template (below)

## Notification template

```markdown
## P7.6 Read Path P0 — {ruleId}
- Time (UTC):
- Metric:
- Current value / threshold:
- Affected viewers (if known):
- Kill switch applied: Y/N
- PM notified: Y/N
- Ops lead:
- Eng lead:
- Next: rollback drill steps 1–9 per r9c doc
```

## Signoff

| role | status | date |
|------|--------|------|
| Ops (observability) | **approved** (role) | 2026-05-18 |
| API Eng (matching) | **approved** (role) | 2026-05-18 |
