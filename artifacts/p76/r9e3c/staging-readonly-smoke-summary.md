# P7.6-r9e3c — Staging Read-only Smoke Summary

- **generatedAt:** 2026-05-19T01:25:52.496Z
- **environment:** staging (`production-like-staging`)
- **status:** `PASS_STAGING_READONLY_SMOKE`
- **customer production:** no

## Redaction

- No tokens · no full `DATABASE_URL` · no viewer IDs in this artifact
- Host redacted only: `aws-1-ap-southeast-2.pooler.supabase.com:5432`

## Readonly DB

| Check | Result |
|-------|--------|
| Connection | **pass** |
| Host (redacted) | aws-1-ap-southeast-2.pooler.supabase.com:5432 |
| `p76_allowlist_apply_meta` exists | **true** |
| `p76_canonical_match_result_meta` exists | **true** |
| `_prisma_migrations` count | **32** |
| allowlist rows | **0** (empty expected) |
| canonical rows | **0** (empty expected) |

## Violations (must be 0)

| Metric | Count |
|--------|-------|
| allowlist combined | **0** |
| canonical combined | **0** |

## Admin API (automated runner)

Required endpoints: **no 401 / 403 / 404**

| Path | Status | Outcome |
|------|--------|---------|
| `/admin/p76/allowlist-apply-meta` | 200 | pass (empty expected) |
| `/admin/p76/canonical-rehearsal` | 200 | pass · `featureEnabled=true` (empty expected) |
| `/admin/p76/canonical-rehearsal/aggregate` | 200 | pass |

## Admin API (operator manual, same session)

| Path | Status | Outcome |
|------|--------|---------|
| `/admin/p76/canonical-sidecar` | 200 | pass · `featureEnabled=true` · `totalVisible=0` |
| `/admin/p76/canonical-sidecar/aggregate` | 200 | pass · `totalVisible=0` |

## Mutation safety

- No DB write · no migration · no fixture seed · no read path · no percent
- No MatchResult / finalScore / worker mutation · no canonical promotion
- Staging only · no production rollout · no legacy removal

## Blockers

- none

## Next

**P7.6-r9e3d** PM/Ops review → then r9e5 §7: fixture seed · P7.6 GET matrix · rollback drill · Grafana · 30–60 min watch
