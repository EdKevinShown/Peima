# P7.6-r9a3 — HTTP GET Fixture Specification

> **Gap:** G-08 · **Status:** **partial** — spec **done** · **fixture not seeded** (Route C still NO_MATCH_RESULT)  
> **Closeout:** [P7.6-r9a3](../../../docs/P7/P7.6-r9a3-production-readiness-remediation-execution-closeout.md)

---

## Background

[r7k2](../../../docs/P7/P7.6-r7k2-m6-comparison-sql-evidence-closeout.md): Route C viewers have **no** `match_results` in dev. r8h2 used resolver + synthetic row.

---

## Target environment

| env | use |
|-----|-----|
| **staging** | seed fixture · execute r9b HTTP GET |
| production | **no seed in r9a3** |

---

## Seed plan (r9b execution — not run in r9a3)

| viewerUserId | `match_results` row | `finalScore` | sidecar row |
|--------------|---------------------|--------------|-------------|
| `cmfemn00100016z64seed0001` | 1 row · legacy `candidateUserId` | `0.75` (fixed) | yes · not rolledBack |
| `cmr4r7j4050025z64stag0001` | 1 row | `0.75` | yes · **rolledBack=true** |
| `cmo7ksq8s00006znosryc9k0n` | 1 row (non-allowlist) | `0.75` | optional none |

**Additional negative fixtures (staging only):**

| case | setup |
|------|--------|
| missing sidecar | allowlist viewer · delete sidecar row for locked version |
| stale sourceVersion | env version mismatch |
| violation row | `violationStatus != ok` (must block) |
| candidate missing | sidecar `selectedCandidateId` invalid |

---

## Auth

- JWT: `Authorization: Bearer <token>` where `sub` = `viewerUserId`
- Path: `GET /api/matching/result/:userId` (confirm route prefix in r9b against deployed API)

---

## Rollback of fixture

- Seed script reversible · tagged `p76-r9b-fixture`
- No production seed without r9c signoff

---

## r9b dependency

**r9b must create fixture before HTTP execution.** r9a3 only delivers this spec.
