# P7.6-r9e3h — Render Env Safety Check

> **Host (redacted):** `peima-api-staging.onrender.com`  
> **Closeout:** [P7.6-r9e3h](../../../docs/P7/P7.6-r9e3h-final-gate12-pm-ops-signoff.md)

## Required staging defaults (Gate 12)

| Variable | Required | Verified | Source |
|----------|----------|----------|--------|
| `PEIMA_P76_READ_PATH_ENABLED` | `0` | **yes** | r9e3e Phase B restore · r9e3f mirror |
| `PEIMA_P76_READ_PATH_VIEWER_IDS` | empty | **yes** | r9e3e Phase B · r9e3f mirror |
| `PEIMA_P76_PRODUCTION_KILL_SWITCH` | `1` | **yes** | r9e3e Phase B · r9e3f mirror |
| `PEIMA_P76_PRODUCTION_PERCENT` | `0` | **yes** | r9e3e Phase B · r9e3f mirror |
| `PEIMA_P76_PRODUCTION_PERCENT_ENABLED` | `0` | **yes** | r9e3e Phase B · r9e3f mirror |

## Writer / Apply gates (staging)

| Capability | Required state | Verified |
|------------|----------------|----------|
| Canonical sidecar writers | disabled / not exercised for prod apply | **yes** |
| Allowlist sidecar writers (prod path) | disabled | **yes** |
| Admin canonical **Apply** execution | disabled (r7d–r7j read-only only) | **yes** |
| `PEIMA_P76_CANONICAL_SIDECAR_ADMIN_ENABLED` | feature gate off unless explicit smoke | **yes** (404/403 when off) |

## Caveat

- **Confirm** live Render dashboard matches Phase B restore after any manual toggle during r9e3e/r9e3f work.
- Local `.env.staging` mirror passed r9e3f watch — **not** committed to git.

## Result

**Render env safety: PASS** for Gate 12 staging evidence package.
