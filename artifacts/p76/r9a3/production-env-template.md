# P7.6-r9a3 — Production Env Template Evidence

> **Gap:** G-05 · **Status:** **done** (spec only · **not** committed to repo code)  
> **Closeout:** [P7.6-r9a3](../../../docs/P7/P7.6-r9a3-production-readiness-remediation-execution-closeout.md)

---

## Safe defaults (production)

```bash
# Read path — default OFF
PEIMA_P76_READ_PATH_ENABLED=0
PEIMA_P76_READ_PATH_VIEWER_IDS=
PEIMA_P76_READ_PATH_SOURCE_VERSION=p7.6-r7j3-staging-cohort-v1
PEIMA_P76_READ_PATH_REQUIRE_PM_SIGNOFF=1
PEIMA_P76_READ_PATH_REQUIRE_OPS_SIGNOFF=1
PEIMA_P76_READ_PATH_FALLBACK_LEGACY=1
PEIMA_P76_READ_PATH_STRICT_VIOLATION_BLOCK=1

# Percent / kill switch — default safe
PEIMA_P76_PRODUCTION_PERCENT_ENABLED=0
PEIMA_P76_PRODUCTION_PERCENT=0
PEIMA_P76_PRODUCTION_KILL_SWITCH=1
PEIMA_P76_PRODUCTION_FALLBACK_LEGACY=1
PEIMA_P76_PRODUCTION_ALLOWLIST_VIEWER_IDS=
```

---

## Policy statements

| policy | value |
|--------|-------|
| production read path default | **off** (`ENABLED=0`) |
| percent default | **0** |
| allowlist default | **empty** |
| fallback legacy | **on** (`FALLBACK_LEGACY=1`) |
| kill switch | **enabled** (`KILL_SWITCH=1` = force ignore sidecar) |
| production migrate | **not executed** in r9a3 |

---

## Reviews

| review | status | date |
|--------|--------|------|
| Eng default-off review | **pass** (spec) | 2026-05-17 |
| Ops approval | **ack** (role) | 2026-05-17 |

---

## Notes

- Implement in IaC / `.env.production` in a **future** Eng PR after r9a1 `PASS_TO_R9B`.
- Until then, production must not set read path vars to enabled.
