# P7.6-r9e3f — P0 / P1 Counter Checklist

> **Watch:** 2026-05-19T09:15:58.743Z → 2026-05-19T09:41:00.437Z (25 min)

## P0 (must be 0)

| # | counter | max | pass |
|---|---------|-----|------|
| 1 | `finalScoreChangedCount` | 0 | yes |
| 2 | `matchResultCandidateChangedCount` | 0 | yes |
| 3 | `workerMutationUnexpectedCount` | 0 | yes |
| 4 | `nonAllowlistSidecarDisplayCount` | 0 | yes |
| 5 | `rolledBackSidecarDisplayCount` | 0 | yes |
| 6 | `violationSidecarDisplayCount` | 0 | yes |
| 7 | `percentEnabledWithoutSignoffCount` | 0 | yes |
| 8 | `readPathEnabledAfterRollbackCount` | 0 | yes |

## P1

| signal | observed | pass |
|--------|----------|------|
| API 5xx spike | 0 | yes |
| fallback unexpected spike | 0 | yes |
| admin 401/403/404 | 0 | yes |
| monitoring data gap | yes (no admin token in runner) | partial |
| user-facing reports | 0 | yes |
