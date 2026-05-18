# P7.10-r6c1 — Sidecar Coverage Summary

## 1. Source artifact

| Field | Value |
|-------|-------|
| path | `artifacts/p76/r6c1/canonical-writer-shadow-audit.json` |
| `generatedAt` | `2026-05-18T19:20:15.290Z` |
| `sourceType` | `p76_canonical_writer_shadow_audit` |
| `sourceVersion` | `p7.10-r6a-canonical-writer-shadow-audit-v1` |
| `readPathSourceVersion` (env cohort) | `p7.6-r7j3-staging-cohort-v1` |
| audit `--limit` | **50** |

## 2. Metrics

| Metric | Value |
|--------|-------|
| totalRows | 50 |
| eligibleCount | 4 |
| blockedCount | 46 |
| missingSidecarCount | 45 |
| rowsWithSidecar | 5 |
| sidecarCoverageRate | **0.10** (10%) |
| missingSidecarRate | **0.90** (90%) |
| eligibleRate | 0.08 (8%) |
| wouldChangeCandidateCount | 4 |
| wouldChangeCandidateRate | 0.08 (8%) |
| appliedToMatchResultCount | 0 |

## 3. Reason counts

| `guardrails.reason` | Count |
|---------------------|-------|
| `missing_sidecar` | 45 |
| `ok` | 4 |
| `rolled_back` | 1 |

**Score delta bands:** `unknown` 46, `none` 4.

## 4. Interpretation

- A high **`missing_sidecar` rate does not mean the shadow builder failed.** It means most viewers in the recent-`MatchResult` sample lack a `p76_allowlist_apply_meta` row for cohort `p7.6-r7j3-staging-cohort-v1`.
- **`missingSidecarRate` = 0.90 (> 0.5)** → per [P7.10-r6c](../docs/P7/P7.10-r6c-canonical-writer-dual-write-rehearsal-design.md), **do not proceed** to Option B dedicated rehearsal sidecar **write** implementation yet.
- **`eligibleCount` = 4 (> 0)** → where sidecar exists and guardrails pass, the builder produces comparable proposals (`wouldChangeCandidateCount` = 4).
- **DB-level context (read-only counts, no user IDs):** 80 total `MatchResult` rows; **5** `p76_allowlist_apply_meta` rows for this `sourceVersion` (1 rolled back, 0 with `appliedToMatchResult=true`). Among the 50 most recent `MatchResult` rows (6 distinct viewers), **5** have a matching sidecar row — consistent with artifact `rowsWithSidecar` = 5.
- **Next data work:** explicit allowlist cohort filtering, local seed alignment ([P7.6-r7j1](../docs/P7/P7.6-r7j1-route-c-data-gap-inventory-closeout.md)), or dev-only sidecar generation — **not** rehearsal table migration.

## 5. Safety

- **No DB writes** during this audit run.
- `appliedToMatchResultCount` = **0**.
- All `rows[].shadow.appliedToMatchResult` = **false** (artifact safety check PASS).
- No sensitive keys (`rawPrompt`, `transcript`, `imageFeatures`, `rawImage`, `fullPrompt`) in serialized artifact.
- Runner uses read-only Prisma APIs only; no `MatchResult` / `matchInsights` mutation.
