# P7.6-r9a4 — HTTP GET Fixture Readiness Closeout

> **Gap:** G-08 closure · **Status:** **ready_for_r9b_fixture_execution** (strategy + matrix **done** · **no DB seed** in r9a4)  
> **Closeout:** [P7.6-r9a4](../../../docs/P7/P7.6-r9a4-partial-gap-closure-evidence-closeout.md)  
> **Extends:** [r9a3 http-get-fixture-spec.md](../r9a3/http-get-fixture-spec.md) · [http-get-test-matrix.md](../r9a3/http-get-test-matrix.md)

---

## Fixture strategy (staging · r9b executes seed)

| fixture | viewer | MatchResult | sidecar | notes |
|---------|--------|-------------|---------|-------|
| allowlist | `cmfemn00100016z64seed0001` | 1 row · `candidateUserId` legacy · `finalScore=0.75` | ok · not rolledBack | C1 |
| rolledBack | `cmr4r7j4050025z64stag0001` | 1 row | `rolledBack=true` | C2 |
| non-allowlist | `cmo7ksq8s00006znosryc9k0n` | 1 row | none / ignored | C3 |
| missing sidecar | allowlist viewer | 1 row | delete row for locked version | C4 |
| stale sourceVersion | allowlist viewer | 1 row | env version mismatch | C5 |
| violation | allowlist viewer | 1 row | `violationStatus!=ok` | C6 |
| candidate missing | allowlist viewer | 1 row | invalid `selectedCandidateId` | C7 |

**Seed execution:** **r9b only** · tagged `p76-r9b-fixture` · **no seed in r9a4**

---

## Expected display (read path on)

| case | `displaySourceType` | `displayCandidateUserId` |
|------|---------------------|----------------------------|
| C1 allowlist | `p76_allowlist_sidecar_readonly` | sidecar `selectedCandidateId` |
| C2 rolledBack | `match_result_original` | legacy |
| C3 non-allowlist | `match_result_original` | legacy |
| C4–C7 negatives | `match_result_original` | legacy |

---

## Assertions (all cases)

| assertion | method |
|-----------|--------|
| `finalScore` unchanged | response vs DB pre-shot |
| `MatchResult.candidateUserId` unchanged | SQL pre/post |
| no DB write from read path | audit / row timestamps |
| no unhandled exception | HTTP 2xx/4xx only |
| fallback legacy on failure | C4–C7 |

---

## r9b command template

```bash
export API_BASE="${API_BASE:-http://localhost:3000}"
export JWT="<staging-test-jwt-for-viewer>"
curl -sS -H "Authorization: Bearer $JWT" \
  "$API_BASE/matching/result/$VIEWER_USER_ID" \
  | jq '{ displaySourceType, displayCandidateUserId, finalScore, candidateUserId, p76ReadPathMeta }'
```

**Pre:** `PEIMA_P76_READ_PATH_ENABLED=1` · allowlist + `SOURCE_VERSION=p7.6-r7j3-staging-cohort-v1`

---

## Artifact output paths (r9b)

| output | path |
|--------|------|
| per case | `artifacts/p76/r9b/http-get-smoke-<caseId>.json` |
| summary | `artifacts/p76/r9b/http-get-smoke-summary.json` |
| seed log | `artifacts/p76/r9b/fixture-seed-log.json` |

---

## Readiness verdict

| item | status |
|------|--------|
| fixture strategy | **done** |
| test matrix | **done** ([r9a3 matrix](../r9a3/http-get-test-matrix.md)) |
| DB seed | **pending** → **r9b** |
| HTTP execution | **pending** → **r9b** |

**G-08 r9a4 status:** **ready_for_r9b_fixture_execution** (counts as **done** for r9a1 rerun gate per [r9a4 §9](../../../docs/P7/P7.6-r9a4-partial-gap-closure-evidence-closeout.md))
