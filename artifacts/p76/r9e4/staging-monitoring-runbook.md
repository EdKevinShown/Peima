# P7.6-r9e4 — Staging Monitoring Runbook

> **Parent:** [P7.6-r9e4](../../../docs/P7/P7.6-r9e4-staging-production-like-environment-bootstrap-runbook.md)  
> **Dashboard spec:** [r9c1 live-grafana-dashboard-spec](../r9c1/live-grafana-dashboard-spec.md)  
> **P0 routing:** [r9c1 p0-alert-routing](../r9c1/p0-alert-routing.md)  
> **Watch template:** [r9e2 prod-monitoring-watch-template](../r9e2/prod-monitoring-watch-template.md)

---

## 1. Minimum monitoring stack

| Component | Purpose | Options |
|-----------|---------|---------|
| **Log source** | Parse P7.6 metrics from API logs | CloudWatch · Loki · Render logs · Railway logs |
| **Grafana** | Dashboard + alerts | **Grafana Cloud** (recommended for bootstrap) |
| **Alert routing** | P0 page / P1 Slack | PagerDuty · Slack webhook |
| **Optional APM** | Error tracking | Sentry (non-blocking for r9e3) |

---

## 2. Dashboard import

| Field | Value |
|-------|-------|
| Dashboard name | `P7.6 Allowlist Read Path — Production` (staging folder OK) |
| UID | `p76-allowlist-read-path-v2` |
| Ticket | `PEIMA-OPS-P76-GRAFANA-v2` |

**Checklist:** [prod-grafana-import-checklist.md](../r9e2/prod-grafana-import-checklist.md)

Record to [real-prod-grafana-import-result.md](../r9e3/real-prod-grafana-import-result.md):

```text
environment=production-like-staging
grafana_org=<org>
dashboard_uid=p76-allowlist-read-path-v2
test_alert_fired=yes|no
```

---

## 3. P0 alert rules (must wire)

Threshold: **> 0** triggers page (staging may use same rules as prod spec).

| Metric / condition | Meaning |
|--------------------|---------|
| `finalScoreChangedCount` | Main chain violation |
| `matchResultChangedCount` | Main chain violation |
| `workerChangedCount` | Worker touched ranking |
| Non-allowlist sidecar display | Policy violation |
| RolledBack sidecar display | Policy violation |
| Violation row display | Strict block breach |
| Percent enabled without signoff | `PEIMA_P76_PRODUCTION_PERCENT > 0` without approval |

**Auto-response:** [p0-alert-routing.md](../r9c1/p0-alert-routing.md) — kill switch · read path off · clear allowlist env.

---

## 4. P1 alert rules

| Condition | Channel |
|-----------|---------|
| Elevated `exceptionFallbackCount` | `#peima-matching-alerts` |
| High `fallbackLegacyCount` rate | Slack P1 |
| Read path attempts spike | Review only |

---

## 5. Log query pack

Until native Prometheus metrics exist, use log facets from [monitoring-query-pack.md](../r9c1/monitoring-query-pack.md):

- `readPathAttemptCount`
- `sidecarReadSuccessCount`
- `fallbackLegacyCount`
- `violationBlockedCount`

Point Grafana log datasource at **staging API** service name (not localhost docker).

---

## 6. 30–60 minute watch (r9e3)

Copy [prod-monitoring-watch-template.md](../r9e2/prod-monitoring-watch-template.md) to [real-prod-monitoring-watch.md](../r9e3/real-prod-monitoring-watch.md).

| Field | Staging value |
|-------|---------------|
| `environment` | `production-like-staging` |
| `window_start_utc` | fill at execution |
| `window_end_utc` | start + 30–60 min |
| P0 fires | must be **0** during watch |
| percent | must remain **0** |

---

## 7. Test alert (before r9e3 signoff)

1. Create synthetic test rule or manual "Send test notification"
2. Confirm P0 route reaches on-call channel
3. Document alert ID / notification ID in grafana-import artifact

**Without test alert evidence → r9e3 Grafana check remains block.**

---

## 8. BLOCK conditions

- No dashboard imported
- No log/metric source connected to staging API
- Cannot run 30–60 min watch
- P0 rules missing main-chain immutability metrics
