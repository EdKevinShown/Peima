# P7.6-r9e3f — Staging Monitoring Watch Summary

- **status:** `PASS_WITH_GRAFANA_IMPORT_PENDING`
- **environment:** production-like-staging
- **watch:** 2026-05-19T09:15:58.743Z → 2026-05-19T09:41:00.437Z (**25** min · target 30–60)
- **Grafana:** `GRAFANA_PHYSICAL_IMPORT_PENDING`

## P0 counters (max observed)

| counter | value | pass |
|---------|-------|------|
| finalScoreChangedCount | 0 | yes |
| matchResultCandidateChangedCount | 0 | yes |
| workerMutationUnexpectedCount | 0 | yes |
| nonAllowlistSidecarDisplayCount | 0 | yes |
| rolledBackSidecarDisplayCount | 0 | yes |
| violationSidecarDisplayCount | 0 | yes |
| percentEnabledWithoutSignoffCount | 0 | yes |
| readPathEnabledAfterRollbackCount | 0 | yes |

## P1 signals

| signal | value |
|--------|-------|
| api5xxSpikeCount | 0 |
| fallbackUnexpectedSpikeCount | 0 |
| adminApi401403404RegressionCount | 0 |
| monitoringDataGap | true |
| userFacingReportsCount | 0 |

## SQL violations (after watch)

- allowlist combined: 0
- canonical combined: 0
- fixture finalScore drift: 0

## Env safety (local mirror)

- READ_PATH_ENABLED=0
- VIEWER_IDS=empty
- KILL_SWITCH=1
- PERCENT=0
