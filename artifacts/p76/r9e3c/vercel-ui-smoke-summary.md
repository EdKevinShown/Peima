# P7.6-r9e3c — Vercel UI Smoke (staging)

- **generatedAt:** 2026-05-19T00:20:39.320Z
- **environment:** production-like-staging
- **webHost:** peima-web-staging.vercel.app

## Root

| Check | Result |
|-------|--------|
| `GET /` | **200** — Peima Web home loads |
| Deep link `GET /login` | **404** — Vercel `NOT_FOUND` (platform, not app router) |
| Deep link `GET /admin/p76/canonical-sidecar` | **404** — Vercel `NOT_FOUND` |

## Network (this round)

| Check | Result |
|-------|--------|
| Web → Render API observed in browser | **not verified** (no authenticated session this round) |
| Prior r9e4a bootstrap | register **201**, me **200**, onboarding photo status **200** |

## Admin canonical sidecar UI

| Check | Result |
|-------|--------|
| Route reachable | **not verified** — SPA deep links 404 on Vercel |
| Safety banner `CANONICAL SIDECAR ONLY — NOT APPLIED TO MATCHRESULT` | **not verified** |
| Empty state / table / aggregate | **not verified** |
| No Apply / Promote / Rollback / Delete | **not verified** |
| No worker / PreviewPool / percent controls | **not verified** |

## Deferred

`uiManualSmokeDeferred = true`

**Reason:** Vercel returns platform 404 for non-root paths; admin sidecar UI and safety banner require SPA rewrite configuration and/or authenticated client-side navigation from `/` (not executed with login this round).

## Mutation safety

No UI write actions performed.
