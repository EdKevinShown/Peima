# P7.6-r9e3b — Prod Reverify Access Checklist (Ops Handoff)

**Generated:** 2026-05-19T07:13:57Z  
**Package status:** `P7_6_R9E3B_REAL_PROD_REVERIFY_ACCESS_PACKAGE_READY`  
**Purpose:** Ops / deployment owner completes before **P7.6-r9e3c** read-only smoke

> Check boxes when delivered. **Do not** paste secrets into this file — use secret manager ticket IDs only.

---

## Required access (Ops to complete)

| # | Item | Required | Delivered (Y/N) | Ticket / owner | Notes |
|---|------|:--------:|:---------------:|----------------|-------|
| 1 | Prod API base URL | Y* | | | *Or staging-prod-like per r9e4 |
| 2 | Staging-prod-like API base URL | Y* | | | *If prod not used |
| 3 | Read-only DB URL / role | Y | | DBA | `PEIMA_READONLY_DATABASE_URL` |
| 4 | Admin / service JWT method | Y | | API Eng | Short-lived |
| 5 | Allowlist viewer cohort (6 cases) | Y | | PM | See r9e2 GET runbook |
| 6 | Grafana dashboard URL | Y | | Ops obs | `p76-allowlist-read-path-v2` |
| 7 | Alert / monitoring access | Y | | Ops obs | P0/P1 routes |
| 8 | kubectl context (read) or env export | Y | | Platform | percent=0 audit |
| 9 | Rollback owner named | Y | | Ops lead | |
| 10 | Kill switch owner named | Y | | Ops lead | |
| 11 | Deployment owner sign-off | Y | | Release mgr | |
| 12 | Incident channel | Y | | Ops | |
| 13 | 30–60 min monitoring window scheduled | Y | | Ops + PM | |

---

## Required env vars (names only — values in secret manager)

- [ ] `PEIMA_PROD_API_BASE_URL`
- [ ] `PEIMA_STAGING_API_BASE_URL`
- [ ] `PEIMA_READONLY_DATABASE_URL`
- [ ] `PEIMA_ADMIN_SERVICE_TOKEN`
- [ ] `PEIMA_P76_READ_PATH_SAFE_FALLBACK`
- [ ] `PEIMA_P76_RESULT_STATE_CONTRACT_ENABLED`
- [ ] `P76_SMOKE_EXPECT_RESULT_STATE_CONTRACT`

---

## Go / No-go (deployment owner)

| Criterion | GO | NO-GO |
|-----------|:--:|:-----:|
| API (prod or staging-prod-like) | [ ] | [ ] |
| Read-only DB | [ ] | [ ] |
| Auth for smoke | [ ] | [ ] |
| Monitoring | [ ] | [ ] |
| Kill switch owner | [ ] | [ ] |
| Read-only commands only approved | [ ] | [ ] |
| Time window approved | [ ] | [ ] |

**Signed:** _________________ **Date:** _________

---

## Conclusion (fill after Ops return)

| Field | Value |
|-------|-------|
| r9e3c ready? | pending |
| r9e3 status | `NEED_MORE_PROD_REVERIFY` |
| gate 12 | BLOCKED |

See [prod-reverify-access-checklist.json](./prod-reverify-access-checklist.json) and [P7.6-r9e3b doc](../../../docs/P7/P7.6-r9e3b-real-prod-reverify-access-package-and-ops-handoff.md).
