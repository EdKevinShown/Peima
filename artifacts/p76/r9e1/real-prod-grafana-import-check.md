# P7.6-r9e1 — Real Prod Grafana Import Check

> **Parent:** [P7.6-r9e1](../../../docs/P7/P7.6-r9e1-real-prod-ops-reverify-closeout.md)  
> **Status:** **pending**  
> **Owner:** Peima Ops (observability)  
> **Ticket:** `PEIMA-OPS-P76-GRAFANA-v2`

---

## Dashboard

| field | required | status |
|-------|----------|--------|
| dashboard id | `p76-allowlist-read-path-v2` | **pending** |
| imported in **real prod** Grafana | **yes** | **no** |
| dashboard URL | `https://grafana.prod.internal/d/p76-allowlist-read-path-v2` (placeholder) | **pending** |
| spec | [r9c1 live-grafana-dashboard-spec](../r9c1/live-grafana-dashboard-spec.md) | **done** (spec) |

---

## Alert routing

| route | required | status |
|-------|----------|--------|
| P0 → PagerDuty + `#peima-incident` | active | **pending** |
| P1 → `#peima-matching-alerts` | active | **pending** |
| test / dry-run alert | fired + ack | **pending** |

---

## Gate rule

**Grafana 未在 real prod 导入 → 不得 `PASS_REAL_PROD_REVERIFY`.**

---

## Rehearsal

[r9d step0-grafana-import-closeout.md](../../r9d/step0-grafana-import-closeout.md) — ack only · not prod import.
