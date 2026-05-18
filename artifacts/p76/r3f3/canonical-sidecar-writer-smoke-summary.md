# P7.10-r3f3 Canonical Match Result Sidecar Writer Local Insert Smoke

- **generatedAt:** 2026-05-18T23:41:50.004Z
- **auditRunId:** r3f3-local-insert-smoke-001
- **environment:** dev
- **mode:** insert_only
- **pass:** true

## Counts

- attempted: 3
- inserted: 2
- duplicate: 2
- skipped: 1
- blocked: 0

## Verify

- rowCount: 2
- appliedToMatchResultTrueCount: 0
- appliedToFinalScoreTrueCount: 0
- appliedToWorkerRankingTrueCount: 0
- promotionStatusNotPromotedCount: 2

## Cleanup

- requested: true
- deletedCount: 2
- finalRowsForAuditRunId: 0

## Safety

- matchResultTouched: false
- workerTouched: false
- getTouched: false

## Duplicate probe

- duplicateCount: 2
- rowCountAfter: 2
- rowCountUnchanged: true
