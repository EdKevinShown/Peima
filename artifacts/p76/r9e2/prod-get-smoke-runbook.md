# P7.6-r9e2 — Production GET Smoke Runbook

> **Runbook:** [P7.6-r9e2](../../../docs/P7/P7.6-r9e2-real-prod-ops-execution-runbook.md)  
> **Owner:** Peima API Eng + Peima Ops

---

## Endpoint

```http
GET /matching/result/:viewerUserId
Authorization: Bearer <production JWT · sub=viewerUserId>
```

**Base URL:** production API _________________________

---

## Cases (required)

| # | viewerUserId | caseType | expected `displaySourceType` | expected fallback |
|---|--------------|----------|------------------------------|-------------------|
| 1 | `cmr4hm001016z64demo00m05a` | allowlist_active | `p76_allowlist_sidecar_readonly` | none |
| 2 | `cmfemn00100016z64seed0001` | allowlist_active | `p76_allowlist_sidecar_readonly` | none |
| 3 | `cmr4hf000716z64demo00f04a` | allowlist_active | `p76_allowlist_sidecar_readonly` | none |
| 4 | `cmr4hf000916z64demo00f05a` | allowlist_active | `p76_allowlist_sidecar_readonly` | none |
| 5 | `cmr4r7j4050025z64stag0001` | rolled_back | `match_result_original` (not sidecar) | `rolled_back` |
| 6 | `cmo7ksq8s00006znosryc9k0n` | non_allowlist | legacy / `static_fallback` | `not_allowlisted` |

---

## Record per case

| field | record |
|-------|--------|
| httpStatus | |
| candidateUserId (persisted) | |
| finalScore | |
| displayCandidateUserId | |
| displaySourceType | |
| p76ReadPathMeta | |
| fallbackUsed | |
| fallbackReason | |
| pre/post candidateUserId same? | |
| pre/post finalScore same? | |
| PASS / BLOCK | |

---

## PASS criteria

- allowlist → `p76_allowlist_sidecar_readonly` · `displayCandidateUserId` = sidecar `selectedCandidateId`
- rolledBack → legacy · **not** sidecar
- non-allowlist → legacy · **not** sidecar
- `candidateUserId` unchanged
- `finalScore` unchanged
- HTTP **200** · no 5xx · no exception

---

## Fail actions

- any BLOCK → **STOP live window** · kill switch · notify incident channel
- paste results to `artifacts/p76/r9e3/real-prod-get-smoke-results.json` (r9e3 closeout)

---

## Rehearsal baseline

[artifacts/p76/r9d/production-get-smoke-results.json](../r9d/production-get-smoke-results.json) — 6/6 PASS (local)
