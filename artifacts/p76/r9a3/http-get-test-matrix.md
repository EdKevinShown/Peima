# P7.6-r9a3 — HTTP GET Test Matrix

> **Gap:** G-08 · **Status:** **done** (matrix) · execution **blocked** until fixture seed (r9b)  
> **Fixture spec:** [http-get-fixture-spec.md](./http-get-fixture-spec.md)

---

## Global assertions (every case)

| assertion | method |
|-----------|--------|
| `finalScore` unchanged | compare response vs DB pre-shot |
| `MatchResult.candidateUserId` unchanged | SQL pre/post |
| no `MatchResult` UPDATE | SQL audit / row version |
| worker winner unchanged | worker audit (if applicable) |
| no unhandled 500 | HTTP status |
| no DB write from read path | audit logs |

---

## Cases

| caseId | viewer | env | setup | expected `displaySourceType` | expected `displayCandidateUserId` | notes |
|--------|--------|-----|-------|------------------------------|-----------------------------------|-------|
| C0 | `cmfemn00100016z64seed0001` | off | baseline | `match_result_original` | legacy candidate | `env_disabled` |
| C1 | `cmfemn00100016z64seed0001` | on | allowlist + sidecar | `p76_allowlist_sidecar_readonly` | sidecar `selectedCandidateId` | |
| C2 | `cmr4r7j4050025z64stag0001` | on | rolledBack | `match_result_original` | legacy | `rolled_back` |
| C3 | `cmo7ksq8s00006znosryc9k0n` | on | non-allowlist | `match_result_original` | legacy | `not_allowlisted` |
| C4 | `cmfemn00100016z64seed0001` | on | missing sidecar | `match_result_original` | legacy | fallback |
| C5 | `cmfemn00100016z64seed0001` | on | stale `sourceVersion` | `match_result_original` | legacy | version mismatch |
| C6 | allowlist viewer | on | violation row | `match_result_original` | legacy | strict block |
| C7 | allowlist viewer | on | invalid sidecar candidate | `match_result_original` | legacy | candidate missing |

---

## Command template

```bash
# staging — after fixture seed (r9b)
curl -sS -H "Authorization: Bearer $JWT" \
  "$API_BASE/matching/result/$VIEWER_USER_ID" \
  | jq '{ displaySourceType, displayCandidateUserId, finalScore, candidateUserId, p76ReadPathMeta }'
```

---

## Artifact output (r9b)

- `artifacts/p76/r9b/http-get-smoke-<caseId>.json` per case
- summary `artifacts/p76/r9b/http-get-smoke-summary.json`
