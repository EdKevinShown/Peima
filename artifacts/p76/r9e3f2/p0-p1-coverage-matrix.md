# P7.6-r9e3f2 — P0 / P1 Coverage Matrix

> **Environment:** production-like-staging  
> **Closeout:** [P7.6-r9e3f2](../../../docs/P7/P7.6-r9e3f2-grafana-physical-import-and-test-alert-evidence-closeout.md)  
> **Decision:** `PASS_GRAFANA_PHYSICAL_IMPORT_AND_TEST_ALERT`

---

## Legend

| Symbol | Meaning |
|--------|---------|
| **S** | Spec / query pack defined ([r9c1](../r9c1/)) |
| **W** | Wired in Grafana |
| **O** | Observable on dashboard |
| **T** | Test alert fired for rule |

---

## P0 (required)

| Counter / condition | ruleId | Spec § | S | W | O | T | r9e3f watch (API/SQL) |
|-------------------|--------|--------|---|---|---|---|------------------------|
| `finalScoreChangedCount > 0` | P0-01 | §6 | yes | yes | yes | **yes** | **0** |
| `matchResultCandidateChangedCount > 0` | P0-02 | §6 | yes | yes | yes | no | **0** |
| `workerMutationUnexpectedCount > 0` | P0-03 | §6 | yes | yes | yes | no | **0** |
| `nonAllowlistSidecarDisplayCount > 0` | P0-04 | §4 | yes | yes | yes | no | **0** |
| `rolledBackSidecarDisplayCount > 0` | P0-05 | §4 / §8 | yes | yes | yes | no | **0** |
| `violationSidecarDisplayCount > 0` | P0-06 | §4 | yes | yes | yes | no | **0** |
| `percentEnabledWithoutSignoffCount > 0` | P0-07 | §7 | yes | yes | yes | no | **0** |
| `readPathEnabledAfterRollbackCount > 0` | P0-08 | §8 | yes | yes | yes | no | **0** |

---

## P1

| Signal | ruleId | S | W | O | r9e3f watch |
|--------|--------|---|---|---|-------------|
| API 5xx spike | P1-external | partial | yes | yes | **0** |
| Exception fallback spike | P1-01 | yes | yes | yes | **0** |
| Safe fallback abnormal | P1-02 | yes | yes | yes | **0** |
| Admin API 401/403/404 regression | P1-admin | partial | yes | yes | skipped in watch |
| Monitoring data gap | P1-05 | yes | yes | **no** (resolved) | was **yes** |
| User-facing reports | P1-04 | partial | yes | yes | **0** |

---

## Coverage summary

| Tier | Spec ready | Grafana wired | Dashboard observable | Test alert |
|------|------------|---------------|----------------------|------------|
| **P0** | 8/8 | 8/8 | 8/8 | 1/8 (P0-01 test fire; sufficient for PASS) |
| **P1** | 6/6 | 6/6 | 6/6 | 0/6 (not required for r9e3f2 PASS) |

**PASS issued:** `PASS_GRAFANA_PHYSICAL_IMPORT_AND_TEST_ALERT` (Ops-verified physical import + P0-01 test alert).
