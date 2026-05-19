# P7.6-r9e3f2 — P0 / P1 Coverage Matrix

> **Environment:** production-like-staging  
> **Closeout:** [P7.6-r9e3f2](../../../docs/P7/P7.6-r9e3f2-grafana-physical-import-and-test-alert-evidence-closeout.md)  
> **Decision:** `NEED_GRAFANA_IMPORT` (physical Grafana not verified)

---

## Legend

| Symbol | Meaning |
|--------|---------|
| **S** | Spec / query pack defined ([r9c1](../r9c1/)) |
| **W** | Wired in Grafana |
| **O** | Observable on dashboard during watch |
| **T** | Test alert fired for rule |

---

## P0 (required)

| Counter / condition | ruleId | Spec panel § | S | W | O | T | r9e3f watch (API/SQL) |
|-------------------|--------|--------------|---|---|---|---|------------------------|
| `finalScoreChangedCount > 0` | P0-01 | §6 | yes | no | no | no | **0** ([staging-monitoring-watch-summary.json](../r9e3f/staging-monitoring-watch-summary.json)) |
| `matchResultCandidateChangedCount > 0` | P0-02 | §6 | yes | no | no | no | **0** |
| `workerMutationUnexpectedCount > 0` | P0-03 | §6 | yes | no | no | no | **0** |
| `nonAllowlistSidecarDisplayCount > 0` | P0-04 | §4 | yes | no | no | no | **0** |
| `rolledBackSidecarDisplayCount > 0` | P0-05 | §4 / §8 | yes | no | no | no | **0** |
| `violationSidecarDisplayCount > 0` | P0-06 | §4 | yes | no | no | no | **0** |
| `percentEnabledWithoutSignoffCount > 0` | P0-07 | §7 | yes | no | no | no | **0** |
| `readPathEnabledAfterRollbackCount > 0` | P0-08 | §8 | yes | no | no | no | **0** |

**r9e3f watch:** P0 counters inferred from readonly SQL + API probes — **not** the same as Grafana panel observability. Item **9** (dashboard observable) remains **fail** until physical import.

---

## P1 (required)

| Signal | ruleId | Spec | S | W | T | r9e3f watch |
|--------|--------|------|---|---|---|-------------|
| API 5xx spike | P1-external | ingress / Render | partial | no | no | **0** spike |
| Exception fallback spike | P1-01 | §5 | yes | no | no | **0** |
| Safe fallback / baseline display abnormal | P1-02 | §3 | yes | no | no | **0** unexpected |
| Admin API 401 / 403 / 404 regression | P1-admin | admin probes | partial | no | no | admin skipped in watch |
| Monitoring data gap | P1-05 | meta | yes | no | no | **yes** — no Grafana panels |
| User-facing reports | P1-04 | external | partial | no | no | **0** |

---

## Coverage summary

| Tier | Spec ready | Grafana wired | Dashboard observable | Test alert |
|------|------------|---------------|----------------------|------------|
| **P0** | 8/8 | 0/8 | 0/8 | 0/8 |
| **P1** | 6/6 (incl. external/admin) | 0/6 | 0/6 | 0/6 |

**PASS requires:** all P0 **W+O+T** (minimum one test alert on any P0 rule) + dashboard URL recorded — **not met**.
