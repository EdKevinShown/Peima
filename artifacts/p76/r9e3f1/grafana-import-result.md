# P7.6-r9e3f1 — Grafana Import Result

> **Environment:** production-like-staging  
> **Ticket:** `PEIMA-OPS-P76-GRAFANA-v2`  
> **Closeout:** [P7.6-r9e3f1](../../../docs/P7/P7.6-r9e3f1-grafana-physical-import-and-test-alert-closeout.md)

---

## Import status

| Check | Required | Result |
|-------|----------|--------|
| Physical dashboard imported | yes | **no** |
| Dashboard UID | `p76-allowlist-read-path-v2` | **not verified** |
| Dashboard name | `P7.6 Allowlist Read Path — Production` (or staging folder equivalent) | **not verified** |
| Spec source | [live-grafana-dashboard-spec.md](../r9c1/live-grafana-dashboard-spec.md) | **ready** (spec only) |
| Import executed by | Peima Ops (observability) | **pending** |
| Import timestamp (UTC) | required | **pending** |
| Dashboard URL | required | **pending** — see [grafana-dashboard-url.txt](./grafana-dashboard-url.txt) |

---

## Panel coverage (spec vs physical)

| Section | P0/P1 relevance | Spec | Physical |
|---------|-----------------|------|----------|
| §1 Traffic | P1 baseline | yes | **pending** |
| §2 Sidecar display | P0/P1 | yes | **pending** |
| §3 Safe fallback | P1 | yes | **pending** |
| §4 Blocked paths | P0 | yes | **pending** |
| §5 Exception fallback | P1 | yes | **pending** |
| §6 Main-chain immutability | **P0** | yes | **pending** |
| §7 Percent / kill switch | **P0** | yes | **pending** |
| §8 Rollback | P1 | yes | **pending** |

---

## Datasource

| Field | Value |
|-------|-------|
| Intended log source | Render **peima-api-staging** logs |
| Staging API host (redacted) | `peima-api-staging.onrender.com` |
| Datasource connected | **not verified** |

---

## Gate

**Physical import not evidenced → `NEED_GRAFANA_IMPORT` · 不得 `PASS_GRAFANA_PHYSICAL_IMPORT_AND_TEST_ALERT`.**

No secrets recorded in this file.
