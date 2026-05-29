# P7.6-r9b — HTTP GET Smoke Summary

> **Closeout:** [P7.6-r9b](../../docs/P7/P7.6-r9b-http-get-smoke-execution-closeout.md) · **`PASS_TO_R9C_PRODUCTION_ALLOWLIST_LIVE_PLANNING`**

## Execution

| 项 | 值 |
|----|-----|
| Date (UTC) | 2026-05-18T15:33:37Z |
| Environment | dev/staging (`localhost:5432` / `peima-postgres`) |
| API | in-process Nest + supertest |
| Auth | JWT Bearer (`sub` = `viewerUserId`) |
| Script | `apps/api/scripts/p76-r9b-http-get-smoke.mjs` |

## Env (read path on)

```text
PEIMA_P76_READ_PATH_ENABLED=1
PEIMA_P76_READ_PATH_VIEWER_IDS=<5 Route C ids>
PEIMA_P76_READ_PATH_SOURCE_VERSION=p7.6-r7j3-staging-cohort-v1
PEIMA_P76_PRODUCTION_PERCENT=0
```

## Results

| case | viewer | HTTP | displaySourceType | pass |
|------|--------|------|-------------------|------|
| allowlist_active | 4 viewers | 200 | `p76_allowlist_sidecar_readonly` | **4/4** |
| rolled_back | `cmr4r7j4050025z64stag0001` | 200 | `match_result_original` · `rolled_back` | **1/1** |
| non_allowlist | `cmo7ksq8s00006znosryc9k0n` | 200 | `static_fallback` · `not_allowlisted` | **1/1** |

## SQL

| metric | value |
|--------|-------|
| violation_count | **0** |
| route_c_rows | **5** |
| rolled_back_count | **1** |

## Fixture

- Seeded **5** Route C `match_results` · tag `p7.6-r9b-http-get-smoke-fixture` · [fixture-seed-log.json](./fixture-seed-log.json)
