# P7.10-r6c2a — Sidecar-covered Viewer Audit Summary

## 1. Source

| Field | Value |
|-------|-------|
| Cohort `sourceVersion` | `p7.6-r7j3-staging-cohort-v1` |
| Strategy | Per-viewer r6a audit (`--viewerUserId`, `--limit=20`) × 5 sidecar-covered viewers |
| Combined artifact | `canonical-writer-shadow-audit-targeted.json` |
| Viewer IDs in this summary | **Redacted** (`viewer_1` … `viewer_5`; lexicographic assignment from DB query) |

## 2. Cohort (read-only DB)

| Metric | Value |
|--------|-------|
| Sidecar rows for cohort | 5 |
| Rolled-back sidecar rows | 1 (`viewer_5`) |
| `appliedToMatchResult=true` | 0 |

## 3. Aggregated audit metrics

| Metric | Value |
|--------|-------|
| targetedViewerCount | 5 |
| totalRows | 5 |
| eligibleCount | 4 |
| blockedCount | 1 |
| missingSidecarCount | 0 |
| rolledBackCount | 1 |
| sidecarCoverageRate | **1.00** |
| missingSidecarRate | **0.00** |
| wouldChangeCandidateCount | 4 |
| appliedToMatchResultCount | 0 |

## 4. Reason counts

| Reason | Count |
|--------|-------|
| `ok` | 4 |
| `rolled_back` | 1 |
| `missing_sidecar` | 0 |

## 5. Per-viewer (redacted)

| Viewer label | Rows | Eligible | missing_sidecar | rolled_back | wouldChangeCandidate |
|--------------|-----:|---------:|----------------:|------------:|---------------------:|
| viewer_1 | 1 | 1 | 0 | 0 | 1 |
| viewer_2 | 1 | 1 | 0 | 0 | 1 |
| viewer_3 | 1 | 1 | 0 | 0 | 1 |
| viewer_4 | 1 | 1 | 0 | 0 | 1 |
| viewer_5 | 1 | 0 | 0 | 1 | 0 |

## 6. Comparison to r6c1 (recent-50)

| Metric | r6c1 | r6c2a targeted |
|--------|------|----------------|
| sidecarCoverageRate | 0.10 | **1.00** |
| missingSidecarRate | 0.90 | **0.00** |
| eligibleCount | 4 | 4 |
| missing_sidecar rows | 45 | 0 |

## 7. Interpretation

- **sidecarCoverageRate ≥ 0.80** on the allowlist-covered cohort → shadow builder + sidecar lookup behave as expected when viewers have `p76_allowlist_apply_meta` rows.
- r6c1 **10%** coverage on unfiltered recent `MatchResult` rows is a **sample alignment** issue, not builder failure.
- `viewer_5` is rolled back → correctly **blocked** (`rolled_back`), not `missing_sidecar`.

## 8. Safety

- Read-only audit; no DB writes.
- `appliedToMatchResultCount = 0`; artifact safety checks **PASS** on all per-viewer and combined JSON.
