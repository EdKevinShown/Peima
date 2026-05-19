# P7.6-r9e3c — Staging Read-only Smoke Summary

- **generatedAt:** 2026-05-19T00:20:39.320Z
- **task:** P7.6-r9e3c
- **environmentType:** production-like-staging
- **status:** `P7_6_R9E3C_STAGING_READONLY_EVIDENCE_PARTIAL_DB_PENDING`

## Access

| Item | Present | Notes |
|------|---------|-------|
| API host | yes | `peima-api-staging.onrender.com` (default from r9e4a) |
| Web host | yes | `peima-web-staging.vercel.app` |
| `PEIMA_STAGING_API_BASE_URL` | no | used known URL |
| `PEIMA_READONLY_DATABASE_URL` | no | SQL **skipped** |
| `PEIMA_ADMIN_SERVICE_TOKEN` | no | auth/cohort GET **skipped** |
| Viewer cohort JSON | no | matching GET **skipped** |
| `.env.staging` | yes | `DATABASE_URL` host = Supabase pooler (not queried) |

## HTTP GET (pass 2 / skip 5)

| Case | Code | Outcome |
|------|------|---------|
| `/health` | 404 | skipped |
| `/api/health` | 404 | skipped |
| `/` | 404 | **pass** (expected) |
| `/auth/me` no token | 401 | **pass** (expected) |
| `/auth/me` with token | — | skipped |
| `/matching/result/:viewerUserId` | — | skipped |
| `/admin/p76/canonical-sidecar` | 404 | skipped (no token / flag) |
| `/admin/p76/canonical-sidecar/aggregate` | 404 | skipped |

## SQL

**Not executed** — `PEIMA_READONLY_DATABASE_URL` missing.

## UI

- Root `/` opens (**200**)
- Deep links `/login`, `/admin/p76/canonical-sidecar` → Vercel **404 NOT_FOUND**
- `uiManualSmokeDeferred = true`

## Mutation safety

All write/mutation flags **false** (see JSON).

## Gate / next

- r9e3 remains **`NEED_MORE_PROD_REVERIFY`**
- **Not** r9e3 complete · **Not** PM/Ops signoff
- **Next:** supply access gaps and rerun r9e3c
