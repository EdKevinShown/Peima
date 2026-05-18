# P7.7-r3.3 — Local Admin Rehearsal UI Smoke Summary

- **generatedAt:** 2026-05-18T20:40:00.000Z
- **auditRunId:** `p77-r3-3-admin-ui-smoke-001`
- **artifact:** `artifacts/p76/r6c2a/canonical-writer-shadow-audit-targeted.json`
- **environment:** dev

## Insert (r6f3, no cleanup)

| Metric | Value |
|--------|-------|
| insertedCount | 5 |
| duplicateCount | 0 |
| appliedToMatchResultTrueCount | 0 |
| insertVerification | pass |

## Admin API smoke (`PEIMA_P76_REHEARSAL_ADMIN_ENABLED=1`)

| Check | Result |
|-------|--------|
| GET list | **pass** (HTTP 200, 5 items) |
| GET aggregate | **pass** (HTTP 200, totalVisible=5) |
| GET detail | **pass** (HTTP 200, row + derived safety flags) |
| featureEnabled | true |

## Admin UI smoke

| Check | Result |
|-------|--------|
| `pnpm --filter @peima/web run build` | **pass** |
| Route `/admin/p76/canonical-rehearsal` registered | **pass** (static) |
| Safety banner + no write controls (static grep) | **pass** |
| Manual browser open | **deferred** (see closeout manual steps) |

## Cleanup

| Metric | Value |
|--------|-------|
| cleanupDeletedCount | 5 |
| finalRowsForAuditRunId | 0 |

## Safety

- No MatchResult / matchInsights mutation
- Rehearsal table insert + delete by `auditRunId` only
- No worker / GET integration exercised
