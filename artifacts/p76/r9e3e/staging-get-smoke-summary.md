# P7.6-r9e3e — Staging GET Smoke Summary

- **status:** `PASS_STAGING_FIXTURE_GET_SMOKE`
- **overall:** Phase A (enabled) **6/0** · Phase B (disabled) **6/0**

## Read path enabled (Phase A)

> **Note:** [staging-get-smoke-results.json](./staging-get-smoke-results.json) retains **disabled-phase** rows only (`smokePhase=disabled`) because the enabled run was executed first and overwritten on Phase B. Enabled evidence: credentialed terminal `passCount=6 failCount=0` + [closeout](../../docs/P7/P7.6-r9e3e-staging-fixture-seed-and-get-smoke-closeout.md) §4.

| caseLabel | HTTP | outcome | displaySourceType | fallbackReason |
|-----------|------|---------|-------------------|----------------|
| case_allowlist_active_1 | 200 | pass | p76_allowlist_sidecar_readonly | — (overlay; baseline unchanged) |
| case_allowlist_active_2 | 200 | pass | p76_allowlist_sidecar_readonly | — |
| case_allowlist_active_3 | 200 | pass | p76_allowlist_sidecar_readonly | — |
| case_allowlist_active_4 | 200 | pass | p76_allowlist_sidecar_readonly | — |
| case_rolled_back | 200 | pass | match_result_original | rolled_back |
| case_non_allowlist | 200 | pass | match_result_original | not_allowlisted |

## Read path disabled (Phase B rollback check)

| case_allowlist_active_1 | 200 | pass | match_result_original | env_disabled |
| case_allowlist_active_2 | 200 | pass | match_result_original | env_disabled |
| case_allowlist_active_3 | 200 | pass | match_result_original | env_disabled |
| case_allowlist_active_4 | 200 | pass | match_result_original | env_disabled |
| case_rolled_back | 200 | pass | match_result_original | env_disabled |
| case_non_allowlist | 200 | pass | match_result_original | env_disabled |

## SQL violations

- before: allowlist=0 canonical=0
- after: allowlist=0 canonical=0
