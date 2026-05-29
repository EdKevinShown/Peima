# P7.6-r9e3f2 — P0 Test Alert Result

> **Environment:** production-like-staging  
> **Closeout:** [P7.6-r9e3f2](../../../docs/P7/P7.6-r9e3f2-grafana-physical-import-and-test-alert-evidence-closeout.md)  
> **Decision:** `PASS_GRAFANA_PHYSICAL_IMPORT_AND_TEST_ALERT`  
> **Ticket:** `PEIMA-OPS-P76-GRAFANA-v2`  
> **Generated:** 2026-05-19T20:00:00.000Z

---

## Test alert status

| Field | Required | Result |
|-------|----------|--------|
| Test alert fired | yes | **yes** |
| Explicitly marked **test** | yes | **yes** — no production incident |
| Alert rule (logical) | yes | **P0-01** (`finalScoreChangedCount > 0`) |
| Grafana alert rule UID | yes | **recorded by Ops** — redacted in git (ticket index) |
| Fired at (UTC) | yes | **recorded by Ops** — redacted in git (ticket index) |
| Route / contact point | yes | PagerDuty `peima-p76-read-path` → Slack `#peima-incident` |
| Notification delivery | optional | **delivered** (test) |
| Acknowledged | optional | **yes** (test) |
| Production incident | must be **no** | **no** |

---

## Ops evidence index (non-secret)

Values below are confirmed by Ops; **exact Grafana UID and sub-second UTC** are indexed in ticket `PEIMA-OPS-P76-GRAFANA-v2` only (not duplicated in git per redaction policy).

| Index field | Repo value |
|-------------|------------|
| `testRuleLogicalId` | `P0-01` |
| `testRuleCounter` | `finalScoreChangedCount` |
| `grafanaAlertRuleUid` | `REDACTED_OPS_TICKET` |
| `firedAtUtc` | `REDACTED_OPS_TICKET` |
| `routeRedacted` | PagerDuty `peima-p76-read-path` → `#peima-incident` |
| `monitoringOwner` | Peima Ops (observability) |

**Machine-readable:** [test-alert-summary.json](./test-alert-summary.json)

---

## P0 rules wired (P0-01 … P0-08)

| ruleId | Counter / condition | Wired | Test fired |
|--------|---------------------|-------|------------|
| P0-01 | `finalScoreChangedCount > 0` | **yes** | **yes** (test) |
| P0-02 | `matchResultCandidateChangedCount > 0` | **yes** | no (not required for PASS) |
| P0-03 | `workerMutationUnexpectedCount > 0` | **yes** | no |
| P0-04 | `nonAllowlistSidecarDisplayCount > 0` | **yes** | no |
| P0-05 | `rolledBackSidecarDisplayCount > 0` | **yes** | no |
| P0-06 | `violationSidecarDisplayCount > 0` | **yes** | no |
| P0-07 | `percentEnabledWithoutSignoffCount > 0` | **yes** | no |
| P0-08 | `readPathEnabledAfterRollbackCount > 0` | **yes** | no |

---

## Gate

**Test alert evidenced → contributes to `PASS_GRAFANA_PHYSICAL_IMPORT_AND_TEST_ALERT`.**

No rollback tokens · `DATABASE_URL` · `JWT_SECRET` · or admin bearer tokens in this file.
