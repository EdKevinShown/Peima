# P7.7-r2 鈥?Local Smoke Automation Summary

## Status

```text
P7_7_R2_LOCAL_SMOKE_AUTOMATION_PASS
```

- startedAt: 2026-05-18T19:09:16.6901573Z
- finishedAt: 2026-05-18T19:09:36.3276736Z
- overallPass: True

## Steps

| Step | Status | Exit | Detail |
|------|--------|------|--------|| api_build | PASS | 0 |  |
| jest_regression | PASS | 0 |  |
| r9b_http_smoke_contract | PASS | 0 |  |
| r6a_shadow_audit | PASS | 0 |  |
| artifact_safety_check | PASS | 0 |  |

## Canonical shadow audit metrics

| Metric | Value |
|--------|-------|
| totalRows | 20 |
| eligibleCount | 4 |
| blockedCount | 16 |
| wouldChangeCandidateCount | 4 |
| appliedToMatchResultCount | 0 |

Artifact: `C:\Users\34713\Desktop\peima\artifacts\p76\r7r2\canonical-writer-shadow-audit.json`

## Notes

- DB steps use `DOTENV_CONFIG_PATH` + `node -r dotenv/config` (Windows-friendly).
- r9b sets `P76_SMOKE_EXPECT_RESULT_STATE_CONTRACT=1`.
- No MatchResult / matchInsights writes in this automation.
