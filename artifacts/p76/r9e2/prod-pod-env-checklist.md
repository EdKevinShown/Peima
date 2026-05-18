# P7.6-r9e2 — Prod Pod / Env Checklist

> **Runbook:** [P7.6-r9e2](../../../docs/P7/P7.6-r9e2-real-prod-ops-execution-runbook.md)  
> **Owner:** Peima Ops (Platform)

---

## Service

| field | record |
|-------|--------|
| namespace | production |
| deployment | `peima-api` |
| image / commit | _________________ |
| checked at (UTC) | _________________ |

---

## Env variables (record from secret store / pod describe)

| variable | required | observed | pass |
|----------|----------|----------|------|
| `PEIMA_P76_READ_PATH_ENABLED` | `0` pre-live · `1` during allowlist window | | ☐ |
| `PEIMA_P76_READ_PATH_VIEWER_IDS` | PM-locked 5 ids (comma-separated) | | ☐ |
| `PEIMA_P76_READ_PATH_SOURCE_VERSION` | `p7.6-r7j3-staging-cohort-v1` | | ☐ |
| `PEIMA_P76_READ_PATH_REQUIRE_PM_SIGNOFF` | `1` | | ☐ |
| `PEIMA_P76_READ_PATH_REQUIRE_OPS_SIGNOFF` | `1` | | ☐ |
| `PEIMA_P76_READ_PATH_FALLBACK_LEGACY` | `1` | | ☐ |
| `PEIMA_P76_READ_PATH_STRICT_VIOLATION_BLOCK` | `1` | | ☐ |
| `PEIMA_P76_PRODUCTION_PERCENT_ENABLED` | `0` | | ☐ |
| `PEIMA_P76_PRODUCTION_PERCENT` | `0` | | ☐ |
| `PEIMA_P76_PRODUCTION_KILL_SWITCH` | `1` frozen · `0` only during controlled live | | ☐ |

---

## Policy checks

| check | required | pass |
|-------|----------|------|
| percent = **0** | yes | ☐ |
| non-allowlist cannot see sidecar | yes | ☐ |
| `sourceVersion` locked | yes | ☐ |
| fallback legacy on | yes | ☐ |
| kill switch available | yes | ☐ |

---

## Allowlist viewer ids (do not guess)

```
cmr4hm001016z64demo00m05a
cmfemn00100016z64seed0001
cmr4hf000716z64demo00f04a
cmr4hf000916z64demo00f05a
cmr4r7j4050025z64stag0001
```

---

## Fail actions

- percent > 0 → **STOP** · `BLOCK_PERCENT_ROLLOUT`
- read path on for all users → **STOP** · kill switch
