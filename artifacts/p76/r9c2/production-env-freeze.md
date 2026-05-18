# P7.6-r9c2 — Production Env Freeze (Pre-r9d)

> **Purpose:** intended safe values **before** r9d production allowlist live execution  
> **r9c2:** documented only · **not** applied to production in this round

---

## Frozen safe defaults

| variable | intended value | notes |
|----------|----------------|-------|
| `PEIMA_P76_READ_PATH_ENABLED` | `0` | read path **off** until r9d step 6 |
| `PEIMA_P76_READ_PATH_VIEWER_IDS` | `` (empty) | populated only at controlled enable |
| `PEIMA_P76_READ_PATH_SOURCE_VERSION` | `p7.6-r7j3-staging-cohort-v1` | PM-locked cohort |
| `PEIMA_P76_READ_PATH_REQUIRE_PM_SIGNOFF` | `1` | |
| `PEIMA_P76_READ_PATH_REQUIRE_OPS_SIGNOFF` | `1` | |
| `PEIMA_P76_READ_PATH_FALLBACK_LEGACY` | `1` | |
| `PEIMA_P76_READ_PATH_STRICT_VIOLATION_BLOCK` | `1` | |
| `PEIMA_P76_PRODUCTION_PERCENT_ENABLED` | `0` | |
| `PEIMA_P76_PRODUCTION_PERCENT` | `0` | |
| `PEIMA_P76_PRODUCTION_KILL_SWITCH` | `1` | force ignore sidecar until deliberate enable |

---

## Copy-paste block

```bash
PEIMA_P76_READ_PATH_ENABLED=0
PEIMA_P76_READ_PATH_VIEWER_IDS=
PEIMA_P76_READ_PATH_SOURCE_VERSION=p7.6-r7j3-staging-cohort-v1
PEIMA_P76_READ_PATH_REQUIRE_PM_SIGNOFF=1
PEIMA_P76_READ_PATH_REQUIRE_OPS_SIGNOFF=1
PEIMA_P76_READ_PATH_FALLBACK_LEGACY=1
PEIMA_P76_READ_PATH_STRICT_VIOLATION_BLOCK=1
PEIMA_P76_PRODUCTION_PERCENT_ENABLED=0
PEIMA_P76_PRODUCTION_PERCENT=0
PEIMA_P76_PRODUCTION_KILL_SWITCH=1
```

---

## Allowlist viewers (PM lock — not enabled until r9d)

| viewerUserId | status |
|--------------|--------|
| `cmr4hm001016z64demo00m05a` | active |
| `cmfemn00100016z64seed0001` | active |
| `cmr4hf000716z64demo00f04a` | active |
| `cmr4hf000916z64demo00f05a` | active |
| `cmr4r7j4050025z64stag0001` | **rolledBack** |

**5 ids · 4 active overlay · 1 rolledBack legacy**

---

## Verification audit (pre-r9d)

| check | method | r9c2 |
|-------|--------|------|
| prod env matches freeze | secret store export / ops audit | **documented** |
| percent = 0 | env | **spec** |
| read path off | env | **spec** |
| kill switch on | env | **spec** |

---

## Explicit

| item | r9c2 |
|------|------|
| production env changed | **no** |
| read path enabled | **no** |
