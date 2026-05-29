# P7.6-r9c1 — Live Grafana Dashboard Spec

> **Dashboard:** `P7.6 Allowlist Read Path — Production`  
> **UID (planned):** `p76-allowlist-read-path-v2`  
> **URL placeholder:** `https://grafana.prod.internal/d/p76-allowlist-read-path-v2`  
> **Owner:** Peima Ops (observability) · backup: Peima API Eng (matching)  
> **Closeout:** [P7.6-r9c1](../../../docs/P7/P7.6-r9c1-live-grafana-p0-alert-closeout.md)  
> **P7.10 terminology:** [P7.10-r2a](../../../docs/P7/P7.10-r2a-docs-artifacts-wording-cleanup-closeout.md)

## Implementation requirement

| item | status |
|------|--------|
| Query pack defined | **yes** — [monitoring-query-pack.md](./monitoring-query-pack.md) |
| JSON import to Grafana | **scheduled** — before **r9d** live execution · **not** blocking **r9c2** |
| P0 alert rules wired | **spec ready** — [p0-alert-routing.md](./p0-alert-routing.md) |

**P7.10 note:** Panel titles use **safe fallback / baseline display** wording. Log queries remain on **`fallback_legacy`** until **P7.10-r2b** dual-emit. Metric names `fallbackLegacyCount` / `legacyDisplayCount` in JSON artifacts are **historical** — interpret as **safeFallbackCount** / **baselineDisplayCount**.

---

## Section 1 — Traffic overview

| panel | metrics |
|-------|---------|
| Read path attempts / min | `readPathAttemptCount` |
| Sidecar display success / min | `sidecarReadSuccessCount` · `p76DisplayCount` |
| Safe fallback (baseline display) / min | `fallbackLegacyCount` · `legacyDisplayCount` *(historical metric names)* |

## Section 2 — P7.6 sidecar display

| panel | metrics |
|-------|---------|
| Allowlist sidecar hits | `sidecarReadSuccessCount` |
| By viewer (top 10) | breakdown `viewerUserId` label |

## Section 3 — Safe fallback (baseline display)

| panel | metrics |
|-------|---------|
| Safe fallback rate | `fallbackLegacyCount / readPathAttemptCount` |
| Safe fallback reasons | `fallbackReason` log facet |

*Not legacy photo matching — fallback to `resolveMatchResultDisplay` baseline when sidecar ineligible.*

## Section 4 — Blocked paths

| panel | metrics |
|-------|---------|
| Non-allowlist blocks | `nonAllowlistAttemptCount` |
| RolledBack blocks | `rolledBackBlockedCount` |
| Violation blocks | `violationBlockedCount` |

## Section 5 — Exception fallback

| panel | metrics |
|-------|---------|
| Exception fallback rate | `exceptionFallbackCount` |

## Section 6 — Main-chain immutability

| panel | metrics |
|-------|---------|
| finalScore changed (must be 0) | `finalScoreChangedCount` |
| MatchResult changed (must be 0) | `matchResultChangedCount` |
| Worker changed (must be 0) | `workerChangedCount` |

## Section 7 — Percent / kill switch

| panel | metrics |
|-------|---------|
| `PEIMA_P76_PRODUCTION_PERCENT` | stat panel · alert if >0 w/o signoff |
| `PEIMA_P76_READ_PATH_ENABLED` | stat |
| `PEIMA_P76_PRODUCTION_KILL_SWITCH` | stat |

## Section 8 — Rollback status

| panel | metrics |
|-------|---------|
| Rollback events | `rollbackCount` |
| Post-rollback baseline display % | `legacyDisplayCount` after kill switch *(historical metric name)* |

---

## Refresh / review

| window | frequency |
|--------|-----------|
| allowlist live window | **15m** on-call review |
| steady state | **1h** |
