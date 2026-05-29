# P7.10-r6c1 — Canonical Writer Shadow Audit Summary

## Command

```powershell
# Pass 1: P7.7-r2 automation (build + Jest + r6a limit=20 default)
powershell -NoProfile -ExecutionPolicy Bypass -File apps/api/scripts/p77-r2-local-smoke-automation.ps1 `
  -SkipHttpSmoke -Pretty -AuditOutput artifacts/p76/r6c1/canonical-writer-shadow-audit.json

# Pass 2: expanded sample (limit=50) — authoritative r6c1 artifact
cd apps/api
$env:DOTENV_CONFIG_PATH="<repo-root>/.env"
node -r dotenv/config dist/dev-cli/p710-r6a-canonical-writer-shadow-audit-runner.js `
  --limit=50 --output=../../artifacts/p76/r6c1/canonical-writer-shadow-audit.json --pretty
```

`DATABASE_URL` loaded from repo-root `.env` (value not recorded).

## Artifact

| Field | Value |
|-------|-------|
| JSON | `artifacts/p76/r6c1/canonical-writer-shadow-audit.json` |
| Coverage | `artifacts/p76/r6c1/sidecar-coverage-summary.md` |
| `generatedAt` | `2026-05-18T19:20:15.290Z` |

## Summary (limit=50)

| Metric | Value |
|--------|-------|
| totalRows | 50 |
| eligibleCount | 4 |
| blockedCount | 46 |
| wouldChangeCandidateCount | 4 |
| appliedToMatchResultCount | 0 |

See [sidecar-coverage-summary.md](./sidecar-coverage-summary.md) for rates and interpretation.
