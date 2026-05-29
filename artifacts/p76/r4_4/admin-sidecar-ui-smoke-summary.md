# P7.7-r4.4 — Admin Sidecar UI Local Smoke Summary

**Status:** `P7_7_R4_4_LOCAL_ADMIN_SIDECAR_UI_SMOKE_PARTIAL_API_AND_BUILD_COMPLETE`

**Generated:** 2026-05-19  
**auditRunId:** `p77-r4-4-admin-sidecar-ui-smoke-001`

## Seed (r3f3 runner, no cleanup)

| Metric | Value |
|--------|-------|
| insertedCount | 2 |
| duplicateCount | 2 |
| skippedCount | 1 |
| appliedToMatchResultTrueCount | 0 |
| appliedToFinalScoreTrueCount | 0 |
| appliedToWorkerRankingTrueCount | 0 |
| finalRows before cleanup | 2 |

Synthetic viewers: `r3f3-viewer-*` (no real user IDs).

**Side effect:** `artifacts/p76/r3f3/canonical-sidecar-writer-smoke-summary.json` overwritten by seed run.

## Admin API smoke (localhost:3000)

| Check | Result |
|-------|--------|
| GET list | **pass** — HTTP 200, `featureEnabled=true`, 2 items |
| GET aggregate | **pass** — HTTP 200, `totalVisible=2`, all violation counts 0 |
| GET detail | **pass** — HTTP 200, `rollbackTokenPresent` boolean only, no raw token |
| safety.readByGetPath | false |
| safety.readByWorker | false |

Auth: Bearer JWT for `PEIMA_ADMIN_USER_IDS[0]`; API env `PEIMA_P76_CANONICAL_SIDECAR_ADMIN_ENABLED=1` (full `.env` loaded for API process).

## Admin UI smoke (localhost:5173)

| Check | Result |
|-------|--------|
| Page opens | **pass** |
| Safety banner bullets (No Apply, etc.) | **pass** |
| Filters rendered | **pass** |
| Table rows with seeded data | **deferred** (browser session auth) |
| Detail drawer | **deferred** |
| Export visible JSON | **deferred** (no rows in browser session) |
| No Apply/Promote/Rollback/Delete buttons | **pass** (static grep + browser button list) |

## Cleanup

| Metric | Value |
|--------|-------|
| cleanupDeletedCount | 2 |
| finalRowsForAuditRunId | 0 |

## Safety

- Only `p76_canonical_match_result_meta` rows for this `auditRunId`
- No MatchResult / matchInsights / worker / GET changes
- No production or percent rollout
