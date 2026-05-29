# P7.6-r9e3f2 — Grafana Import Result

> **Environment:** production-like-staging  
> **Ticket:** `PEIMA-OPS-P76-GRAFANA-v2`  
> **Closeout:** [P7.6-r9e3f2](../../../docs/P7/P7.6-r9e3f2-grafana-physical-import-and-test-alert-evidence-closeout.md)  
> **Decision:** `PASS_GRAFANA_PHYSICAL_IMPORT_AND_TEST_ALERT`  
> **Evidence source:** Ops physical import verification (2026-05-19)  
> **Generated:** 2026-05-19T20:00:00.000Z

---

## Import status

| Check | Required | Result |
|-------|----------|--------|
| Physical dashboard imported | yes | **yes** — Ops verified |
| Dashboard UID | `p76-allowlist-read-path-v2` | **yes** |
| Dashboard name | `P7.6 Allowlist Read Path — Production` (staging folder equivalent) | **yes** |
| Spec source | [live-grafana-dashboard-spec.md](../r9c1/live-grafana-dashboard-spec.md) | **matched** |
| Import executed by | Peima Ops (observability) | **confirmed** |
| Import verified (UTC) | required | **2026-05-19** (Ops handoff) |
| Dashboard URL (redacted) | required | [grafana-dashboard-url.txt](./grafana-dashboard-url.txt) |

---

## Datasource

| Field | Value |
|-------|-------|
| Log / metrics source | Render **peima-api-staging** |
| API host (redacted) | `peima-api-staging.onrender.com` |
| Datasource connected | **yes** — Ops verified |
| Panel sections §1–§8 | **loaded** — per [live-grafana-dashboard-spec.md](../r9c1/live-grafana-dashboard-spec.md) |
| Query errors on import | **none reported** |

---

## P0 alert routing

| Check | Result |
|-------|--------|
| P0-01 … P0-08 rules configured | **yes** |
| Contact route | PagerDuty `peima-p76-read-path` → Slack `#peima-incident` ([p0-alert-routing.md](../r9c1/p0-alert-routing.md)) |

---

## Monitoring owner

| Role | Name |
|------|------|
| Primary | Peima Ops (observability) |
| Backup | Peima API Eng (matching) |

---

## Gate

**Physical import evidenced → `PASS_GRAFANA_PHYSICAL_IMPORT_AND_TEST_ALERT`.**

No API keys · datasource passwords · tokens · `DATABASE_URL` · `JWT_SECRET` · or viewer id lists recorded in this file.
