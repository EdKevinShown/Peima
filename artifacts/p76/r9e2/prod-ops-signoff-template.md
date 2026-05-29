# P7.6-r9e2 — Prod Ops Signoff Template

> **Runbook:** [P7.6-r9e2](../../../docs/P7/P7.6-r9e2-real-prod-ops-execution-runbook.md)  
> **Fill on:** P7.6-r9e3 real prod Ops execution closeout

---

## Evidence links

| area | artifact (r9e3) |
|------|-----------------|
| RDS | `artifacts/p76/r9e3/real-prod-rds-check.md` |
| pod/env | `artifacts/p76/r9e3/real-prod-pod-check.md` |
| Grafana | `artifacts/p76/r9e3/real-prod-grafana-import-check.md` |
| migration | `artifacts/p76/r9e3/real-prod-migration-check.md` |
| GET smoke | `artifacts/p76/r9e3/real-prod-get-smoke-results.json` |
| rollback drill | `artifacts/p76/r9e3/real-prod-rollback-drill-closeout.md` |
| monitoring | `artifacts/p76/r9e3/real-prod-monitoring-watch.md` |

---

## Signoff table

| role | owner | decision | date | notes |
|------|-------|----------|------|-------|
| **Ops** (Platform) | | ☐ approved ☐ approved_with_caveat ☐ pending ☐ blocked | | |
| **PM** (matching) | | ☐ approved ☐ approved_with_caveat ☐ pending ☐ blocked | | |
| **Engineering** (API matching) | | ☐ approved ☐ approved_with_caveat ☐ pending ☐ blocked | | |
| **Monitoring** (observability) | | ☐ approved ☐ approved_with_caveat ☐ pending ☐ blocked | | |
| **DBA** | | ☐ approved ☐ approved_with_caveat ☐ pending ☐ blocked | | |

---

## Accepted caveats

| # | caveat | accepted |
|---|--------|----------|
| 1 | percent remains **0** until r9f+ explicit execution approval | ☐ |
| 2 | legacy photo matching **retained** | ☐ |
| 3 | r9f = **planning/signoff only** (not execution) when PASS | ☐ |

---

## Gates

| question | answer |
|----------|--------|
| r9f 1% percent **planning** can start? | ☐ yes ☐ no |
| percent **execution** remains blocked? | ☐ yes (required) |
| legacy removal in scope? | ☐ no (required) |

---

## Rerun

After signoff → **rerun** [P7.6-r9e1](../../../docs/P7/P7.6-r9e1-real-prod-ops-reverify-closeout.md) → target `PASS_REAL_PROD_REVERIFY`
