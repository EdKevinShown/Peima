# P7.6-r9e3h — R8 Unlock Boundary (Post Gate 12 PASS)

> **Gate 12 decision:** `PASS_GATE12_FOR_R8_CONTROLLED_IMPLEMENTATION`  
> **Closeout:** [P7.6-r9e3h](../../../docs/P7/P7.6-r9e3h-final-gate12-pm-ops-signoff.md)

## Allowed after Gate 12 PASS

| Milestone | Scope |
|-----------|--------|
| **P7.10-r8a** | Controlled implementation preflight closeout |
| **P7.10-r8b** | Rollback snapshot migration **design** |
| **P7.10-r8c** | Snapshot persistence implementation **dev/staging only** |
| **P7.10-r8d** | Apply service behind **hard-disabled** env gate |
| **Local/staging fixture smoke** | Only after **additional** r8 milestone signoff per r8d closeout pattern |

## r8 implementation constraints (always)

| Constraint | Required |
|------------|----------|
| Apply endpoint | env-gated · default **off** |
| Rollback endpoint | token-gated · no prod traffic |
| MatchResult mutation | **only** under explicit r8 smoke gates |
| Production traffic | **no** |
| `PEIMA_P76_PRODUCTION_PERCENT` | **0** |
| Legacy removal | **no** |
| Worker auto-trigger | **no** |
| Default enable Apply UI | **no** (r7i remains read-only) |

## Still blocked (Gate 12 PASS does not unlock)

| Item | Status |
|------|--------|
| Production canonical Apply | **blocked** |
| Percent rollout | **blocked** |
| Production rollout | **blocked** |
| Legacy photo matching removal | **blocked** |
| Default read path on production | **blocked** |
| r9e3 customer production complete | **blocked** (if still required) |

## First MatchResult write milestone

**P7.10-r8** (controlled) — **not** r7d–r7j (read-only).
