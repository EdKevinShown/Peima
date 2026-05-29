# P7.6-r9e3f — Render Log Watch Notes

> **Service:** peima-api-staging (Render)  
> **Environment:** production-like-staging  
> **Watch window:** 2026-05-19T09:15:58.743Z → 2026-05-19T09:41:00.437Z

## Procedure

1. Render Dashboard → **peima-api-staging** → Logs
2. Filter time range to watch window above
3. Search log facets (see [monitoring-query-pack.md](../r9c1/monitoring-query-pack.md)):
   - `p76.read_path.attempt`
   - `p76.display.sidecar`
   - `p76.fallback`
   - `error` / `5xx`

## Expected during post-r9e3e safe default

| signal | expected |
|--------|----------|
| read path enabled | **no** (`env_disabled` fallbacks only if probed) |
| sidecar display success | **0** during disabled window |
| P0 violation logs | **0** |
| 5xx spike | **none** |

## Runner API probe summary

| sample | health OK |
|--------|-----------|
| 0 @ 2026-05-19T09:15:58.920Z | yes (404) |
| 1 @ 2026-05-19T09:20:59.312Z | yes (404) |
| 2 @ 2026-05-19T09:25:59.465Z | yes (404) |
| 3 @ 2026-05-19T09:30:59.798Z | yes (404) |
| 4 @ 2026-05-19T09:35:59.966Z | yes (404) |
| 5 @ 2026-05-19T09:41:00.115Z | yes (404) |

**Note:** Physical Render log paste is ops-local; this artifact records procedure + API probe correlation. No secrets.
