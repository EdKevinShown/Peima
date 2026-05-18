# P7.6-r9e2 — Prod RDS SQL Pack

> **Runbook:** [P7.6-r9e2](../../../docs/P7/P7.6-r9e2-real-prod-ops-execution-runbook.md)  
> **Owner:** Peima DBA + Peima Ops (Platform)  
> **Target:** production PostgreSQL · **read-only** checks unless approved migrate window

---

## 1. Table exists

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'p76_allowlist_apply_meta';
```

**Expected:** one row · `p76_allowlist_apply_meta`

---

## 2. Sidecar rows

```sql
SELECT
  "viewerUserId",
  "selectedCandidateId",
  "sourceVersion",
  "pmSignoffStatus",
  "opsSignoffStatus",
  "applied",
  "dryRun",
  "rolledBack",
  "appliedToMatchResult",
  "appliedToFinalScore",
  "appliedToWorkerRanking",
  "appliedToDisplay"
FROM p76_allowlist_apply_meta
ORDER BY "createdAt" DESC;
```

**Expected (Route C · PM lock):**

| viewerUserId | applied | rolledBack |
|--------------|---------|------------|
| `cmr4hm001016z64demo00m05a` | true | false |
| `cmfemn00100016z64seed0001` | true | false |
| `cmr4hf000716z64demo00f04a` | true | false |
| `cmr4hf000916z64demo00f05a` | true | false |
| `cmr4r7j4050025z64stag0001` | false | **true** |

`sourceVersion` = `p7.6-r7j3-staging-cohort-v1` · all violation flags **false**

---

## 3. Violation count (must = 0)

```sql
SELECT COUNT(*) AS violation_count
FROM p76_allowlist_apply_meta
WHERE "appliedToMatchResult" = true
   OR "appliedToFinalScore" = true
   OR "appliedToWorkerRanking" = true
   OR "appliedToDisplay" = true;
```

**Expected:** `violation_count = 0` → else **STOP** · do not enable read path

---

## 4. Applied / rolled back counts

```sql
SELECT COUNT(*) AS applied_count
FROM p76_allowlist_apply_meta
WHERE "applied" = true;

SELECT COUNT(*) AS rolled_back_count
FROM p76_allowlist_apply_meta
WHERE "rolledBack" = true;
```

**Expected:** `applied_count = 4` · `rolled_back_count = 1` (after prod sidecar seed)

---

## 5. Record results

Paste outputs into [r9e1 real-prod-rds-check.md](../r9e1/real-prod-rds-check.md) on **r9e3** closeout.
