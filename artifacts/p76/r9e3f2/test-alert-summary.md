# P7.6-r9e3f2 — Test Alert Summary

- **status:** `P7_6_R9E3F2_BLOCKED_BY_MISSING_GRAFANA_ACCESS`
- **test alert executed:** **no**

## P0 rules (expected — not wired in this run)

| ruleId | Counter | Wired | Test |
|--------|---------|-------|------|
| P0-01 | finalScoreChangedCount | — | — |
| P0-02 | matchResultCandidateChangedCount | — | — |
| P0-03 | workerMutationUnexpectedCount | — | — |
| P0-04 | nonAllowlistSidecarDisplayCount | — | — |
| P0-05 | rolledBackSidecarDisplayCount | — | — |
| P0-06 | violationSidecarDisplayCount | — | — |
| P0-07 | percentEnabledWithoutSignoffCount | — | — |
| P0-08 | readPathEnabledAfterRollbackCount | — | — |

## Test alert

| Field | Result |
|-------|--------|
| Fired | **no** |
| Marked as test | — |
| Alert rule ID | — |
| Fired at (UTC) | — |
| Route (spec) | PagerDuty → `#peima-incident` |
| Production incident | **no** |

## Ops action

Import dashboard first, then Grafana **Test rule** / contact point test notification. Record rule ID + UTC timestamp in a credentialed rerun (no API keys in artifacts).
