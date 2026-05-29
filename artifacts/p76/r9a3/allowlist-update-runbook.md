# P7.6-r9a3 — Allowlist Update Runbook

> **Gap:** G-03 · **Status:** **done** (docs only)  
> **Closeout:** [P7.6-r9a3](../../../docs/P7/P7.6-r9a3-production-readiness-remediation-execution-closeout.md)

---

## Who can change allowlist

| action | who | approval |
|--------|-----|----------|
| Add viewer | Engineering (PR) | **PM written approval** required |
| Remove viewer | Engineering (PR) | **PM + Ops** approval |
| Emergency remove | Ops (env only) | Ops lead + PM notified within 1h |
| Change `sourceVersion` | **Forbidden** without new cohort + PM signoff | PM + Eng + Ops |

---

## Standard change process

1. Open PR updating env template / IaC · reference [production-allowlist-lock.md](./production-allowlist-lock.md)
2. PM confirms viewer id + sidecar row exists for locked `sourceVersion`
3. Ops reviews deploy window · rollback owner on-call
4. Deploy **staging first** · smoke resolver or HTTP (r9b)
5. Production deploy **only** after r9a1 `PASS_TO_R9B` + r9c signoff chain

---

## Rollback on bad allowlist change

1. Kill switch on · clear `PEIMA_P76_READ_PATH_VIEWER_IDS`
2. Verify legacy display ([rollback-runbook.md](./rollback-runbook.md))
3. Incident note · PM/Ops notification

---

## Audit logging

| event | log |
|-------|-----|
| allowlist env change | deploy ticket id · old/new ids · actor |
| emergency remove | incident id · timestamp · actor |
| sidecar write | existing `p76_allowlist_apply_meta` audit columns |

---

## sourceVersion lock rule

- Production **must** use single locked version per cohort.
- Adding viewer **without** matching sidecar row → display falls back legacy (expected).
- Never mix multiple `sourceVersion` values in one production allowlist window.
