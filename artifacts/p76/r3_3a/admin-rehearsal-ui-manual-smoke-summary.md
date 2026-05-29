# P7.7-r3.3a — Manual Admin UI Smoke Summary

- **generatedAt:** 2026-05-18T20:45:00.000Z
- **auditRunId:** `p77-r3-3a-admin-ui-manual-smoke-001`

## Insert

| Metric | Value |
|--------|-------|
| insertedCount | 5 |
| duplicateCount | 0 |
| appliedToMatchResultTrueCount | 0 |
| insertVerification | pass |

## Admin API (pre-UI probe)

| Check | Result |
|-------|--------|
| GET list | pass (200, 5 items) |

## Browser UI

| Check | Result |
|-------|--------|
| Page opened | pass |
| SHADOW banner | pass |
| Summary cards | pass (totalVisible=5) |
| Table rows | pass (5 rows) |
| auditRunId filter | pass |
| Detail drawer | pass |
| Safety flags | pass (isShadowOnly, notAppliedToMatchResult, readByGetPath=false, readByWorker=false) |
| Export visible JSON | pass (button clicked) |
| No write controls | pass |

## Cleanup

| Metric | Value |
|--------|-------|
| cleanupDeletedCount | 5 |
| finalRowsForAuditRunId | 0 |
