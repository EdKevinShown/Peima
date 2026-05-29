# P7.6-r9a3 — Production Allowlist Lock Evidence

> **Gap:** G-02 · **Status:** **done** (draft lock · PM named signoff pending)  
> **Closeout:** [P7.6-r9a3](../../../docs/P7/P7.6-r9a3-production-readiness-remediation-execution-closeout.md)

---

## sourceVersion lock

| field | value | status |
|-------|-------|--------|
| `PEIMA_P76_READ_PATH_SOURCE_VERSION` | `p7.6-r7j3-staging-cohort-v1` | **locked** (aligns with dev/staging SQL · [r8h2](../../../docs/P7/P7.6-r8h2-dev-allowlist-display-smoke-closeout.md)) |
| production sidecar rows | must match this version | **not verified in prod** (no prod DB write) |

---

## Production allowlist viewer ids

| viewerUserId | rolledBack | expected display (read path on) | PM lock |
|--------------|------------|----------------------------------|---------|
| `cmr4hm001016z64demo00m05a` | false | `p76_allowlist_sidecar_readonly` | **yes** (draft) |
| `cmfemn00100016z64seed0001` | false | `p76_allowlist_sidecar_readonly` | **yes** (draft) |
| `cmr4hf000716z64demo00f04a` | false | `p76_allowlist_sidecar_readonly` | **yes** (draft) |
| `cmr4hf000916z64demo00f05a` | false | `p76_allowlist_sidecar_readonly` | **yes** (draft) |
| `cmr4r7j4050025z64stag0001` | **true** | legacy only · **never** sidecar display | **yes** (draft) |

**Comma-separated (env):**

```text
cmr4hm001016z64demo00m05a,cmfemn00100016z64seed0001,cmr4hf000716z64demo00f04a,cmr4hf000916z64demo00f05a,cmr4r7j4050025z64stag0001
```

---

## Allowlist owner

| field | value |
|-------|-------|
| owner role | **Peima PM (P7.6)** |
| delegate | Peima Ops (allowlist env deploy only) |

---

## Signoff status

| signoff | status | date |
|---------|--------|------|
| PM lock (written) | **draft** — role signoff · named PM pending | 2026-05-17 |
| Ops acknowledgement | **ack** — role signoff · read allowlist + rollback runbook | 2026-05-17 |

---

## Behavioral expectations

| case | expectation |
|------|-------------|
| non-allowlist viewer | `displaySourceType=match_result_original` · `fallbackReason` includes `not_allowlisted` |
| rolledBack row | sidecar ignored · legacy display · `rolled_back` |
| violation row | blocked · never `p76_allowlist_sidecar_readonly` |
| env off | legacy only · `env_disabled` |

**Dev evidence:** [r8h2](../../../docs/P7/P7.6-r8h2-dev-allowlist-display-smoke-closeout.md) · production HTTP **not** executed.
