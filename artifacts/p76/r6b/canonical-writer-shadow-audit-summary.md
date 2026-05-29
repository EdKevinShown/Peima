# P7.10-r6b — Local DB Canonical Writer Shadow Audit Summary

## 1. Command

```bash
pnpm --filter @peima/api run build

cd apps/api
# Windows: load repo-root .env (runner dotenv paths did not pick up DATABASE_URL in this shell)
$env:DOTENV_CONFIG_PATH="<repo-root>/.env"
node -r dotenv/config dist/dev-cli/p710-r6a-canonical-writer-shadow-audit-runner.js \
  --limit=20 \
  --output=../../artifacts/p76/r6b/canonical-writer-shadow-audit.json \
  --pretty
```

`DATABASE_URL` loaded from repo-root `.env` (value not recorded here).

## 2. Artifact

| Field | Value |
|-------|-------|
| JSON path | `artifacts/p76/r6b/canonical-writer-shadow-audit.json` |
| `generatedAt` | `2026-05-18T19:04:39.590Z` |
| `sourceVersion` | `p7.10-r6a-canonical-writer-shadow-audit-v1` |
| `readPathSourceVersion` (env) | `p7.6-r7j3-staging-cohort-v1` |

## 3. Summary

| Metric | Value |
|--------|-------|
| totalRows | 20 |
| eligibleCount | 4 |
| blockedCount | 16 |
| wouldChangeCandidateCount | 4 |
| appliedToMatchResultCount | 0 |
| rowsWritten | 20 |

## 4. Reason counts

| Reason | Count |
|--------|-------|
| missing_sidecar | 15 |
| ok | 4 |
| rolled_back | 1 |

## 5. Score delta band counts

| Band | Count |
|------|-------|
| unknown | 16 |
| none | 4 |

## 6. Safety checks

- No DB writes (read-only `findMany` / `findUnique` only).
- `appliedToMatchResultCount` = **0**.
- All `rows[].shadow.appliedToMatchResult` = **false** (verified via inline Node check).
- No `rawPrompt` / `transcript` / `imageFeatures` / `rawImage` / `fullPrompt` keys in JSON.
- `MatchResult` / `finalScore` / `candidateUserId` unchanged by design (runner does not mutate rows).

## 7. Notes

- Sidecar lookup is **best-effort** by `viewerUserId` + `readP76ReadPathEnv().sourceVersion` (`p76_allowlist_apply_meta` unique key).
- **15 / 20** rows had **no sidecar** for the configured cohort version → `missing_sidecar` (expected for non–Route-C viewers or unstaged users).
- **4 eligible** rows would change display candidate vs baseline (`wouldChangeCandidateCount=4`); score delta band `none` (shadow v1 reuses baseline `finalScore`).
- **1** rolled-back sidecar row still audited with `eligible: false`.
- High `blockedCount` is informational, not a runner failure.
- This smoke does **not** authorize canonical production write or legacy writer disable.
