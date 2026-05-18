# P7.10-r6c2a — Combined Targeted Canonical Writer Shadow Audit

## Command pattern

```powershell
cd apps/api
$env:DOTENV_CONFIG_PATH="<repo-root>/.env"
# Repeated per sidecar-covered viewer (viewerUserId redacted in docs)
node -r dotenv/config dist/dev-cli/p710-r6a-canonical-writer-shadow-audit-runner.js `
  --viewerUserId=<redacted> --limit=20 `
  --output=../../artifacts/p76/r6c2a/viewer-<n>-canonical-writer-shadow-audit.json --pretty
```

## Combined output

| Field | Value |
|-------|-------|
| JSON | `canonical-writer-shadow-audit-targeted.json` |
| `auditKind` | `p7.10-r6c2a-targeted-allowlist-cohort` |
| `generatedAt` | `2026-05-18T19:30:04.090Z` |
| totalRows | 5 |
| eligibleCount | 4 |
| appliedToMatchResultCount | 0 |

See [sidecar-covered-viewer-audit-summary.md](./sidecar-covered-viewer-audit-summary.md) for coverage interpretation.
