# P7.6-r9e2 — Prod Grafana Import Checklist

> **Runbook:** [P7.6-r9e2](../../../docs/P7/P7.6-r9e2-real-prod-ops-execution-runbook.md)  
> **Ticket:** `PEIMA-OPS-P76-GRAFANA-v2`  
> **Spec:** [r9c1 live-grafana-dashboard-spec](../r9c1/live-grafana-dashboard-spec.md)

---

## Dashboard

| field | required | done | notes |
|-------|----------|------|-------|
| dashboard id | `p76-allowlist-read-path-v2` | ☐ | |
| imported in **real prod** Grafana | yes | ☐ | |
| dashboard URL | recorded | ☐ | _________________________ |
| owner | Peima Ops (observability) | ☐ | |

---

## Alerts

| route | required | active | test result |
|-------|----------|--------|-------------|
| P0 → PagerDuty + `#peima-incident` | yes | ☐ | _________________ |
| P1 → `#peima-matching-alerts` | yes | ☐ | _________________ |
| dry-run / test alert fired + ack | recommended | ☐ | _________________ |

---

## Gate

**Grafana 未导入 → 不得继续 migration / read path enable · 不得 `PASS_REAL_PROD_REVERIFY`**

---

## Reference

- [r9c1 p0-alert-routing](../r9c1/p0-alert-routing.md)
- [r9c1 monitoring-query-pack](../r9c1/monitoring-query-pack.md)
