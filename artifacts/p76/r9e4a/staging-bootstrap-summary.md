# P7.6-r9e4a — Staging Bootstrap Summary

- **generatedAt:** 2026-05-19T00:15:49.804Z
- **task:** P7.6-r9e4a
- **status:** `STAGING_BOOTSTRAP_PASS`
- **environmentType:** production-like-staging

## Supabase Postgres

| Field | Value |
|-------|-------|
| projectName | Peima |
| region | Oceania / Sydney |
| migrateDeploy | pass |
| p76_allowlist_apply_meta | exists |
| p76_canonical_match_result_meta | exists |

## Render API

| Field | Value |
|-------|-------|
| serviceName | peima-api-staging |
| apiBaseUrlHost | peima-api-staging.onrender.com |
| nestStarted | true |
| listeningPort | 3000 |
| root `/` | 404 expected (no root route) |
| `/auth/me` without token | 401 expected |

## Vercel Web

| Field | Value |
|-------|-------|
| projectName | peima-web-staging |
| webHost | peima-web-staging.vercel.app |
| rootDirectory | apps/web |
| viteApiBaseUrlHost | peima-api-staging.onrender.com |
| webOpened | true |
| webCallsRenderApi | true |
| register | 201 |
| me | 200 |
| onboarding photo status | 200 |
| reached route | `/onboarding/photo-upload` |

## Mutation safety

| Check | Value |
|-------|-------|
| canonicalWriteExecuted | false |
| adminApplyExecuted | false |
| percentChanged | false |
| previewPoolDisabled | false |
| legacyRemovalExecuted | false |

## Next step

P7.6-r9e3c — staging-prod-like read-only reverify
