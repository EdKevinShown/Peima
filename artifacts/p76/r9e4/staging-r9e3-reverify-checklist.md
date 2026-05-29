# P7.6-r9e4 — Staging r9e3 Reverify Checklist

> **Execute after:** staging Postgres + API + monitoring ready  
> **Runbook order:** [P7.6-r9e2](../../../docs/P7/P7.6-r9e2-real-prod-ops-execution-runbook.md)  
> **Closeout target:** [P7.6-r9e3](../../../docs/P7/P7.6-r9e3-real-prod-ops-execution-closeout.md) → `PASS_REAL_PROD_OPS_EXECUTION`  
> **Label:** **`environment=production-like-staging`** on every artifact

---

## 0. Pre-flight

- [ ] Staging bootstrap complete ([r9e4 runbook](../../../docs/P7/P7.6-r9e4-staging-production-like-environment-bootstrap-runbook.md))
- [ ] `DATABASE_URL` host ≠ localhost
- [ ] `https://api-staging.<domain>` reachable
- [ ] `PEIMA_P76_READ_PATH_ENABLED=0` · `PERCENT=0` · `KILL_SWITCH=1` at start
- [ ] PM/Ops aware evidence is **staging**, not customer production

---

## 1. Execution table

| # | r9e2 step | Artifact to update | Pass criteria |
|---|-----------|-------------------|---------------|
| 1 | RDS SQL pack | [real-prod-rds-check.md](../r9e3/real-prod-rds-check.md) | Table exists · 5 sidecar rows · `violation_count=0` |
| 2 | Pod/env check | [real-prod-pod-env-check.md](../r9e3/real-prod-pod-env-check.md) | All `PEIMA_P76_*` match freeze · percent=0 |
| 3 | Grafana import | [real-prod-grafana-import-result.md](../r9e3/real-prod-grafana-import-result.md) | Dashboard + test alert |
| 4 | Migration check | [real-prod-migration-result.md](../r9e3/real-prod-migration-result.md) | `20260517120000_*` applied on staging |
| 5 | GET smoke | [real-prod-get-smoke-results.json](../r9e3/real-prod-get-smoke-results.json) | 6/6 · non-localhost `baseUrl` |
| 6 | Rollback drill | [real-prod-rollback-drill-result.md](../r9e3/real-prod-rollback-drill-result.md) | Kill switch · legacy fallback |
| 7 | Monitoring watch | [real-prod-monitoring-watch.md](../r9e3/real-prod-monitoring-watch.md) | 30–60 min · P0=0 |
| 8 | Signoff | [real-prod-ops-signoff.md](../r9e3/real-prod-ops-signoff.md) | PM + Ops + Eng |

Update summary: [r9e3-readiness-summary.md](../r9e3/r9e3-readiness-summary.md)

---

## 2. Artifact header template

Paste at top of each updated file:

```markdown
## Environment

| field | value |
|-------|-------|
| environment | production-like-staging |
| api_base_url | https://api-staging.<your-domain> |
| database_host | <redacted-staging-host> |
| executed_at_utc | <ISO-8601> |
| customer_production | **no** |
```

---

## 3. GET smoke (staging)

```bash
export API_BASE_URL=https://api-staging.<your-domain>
export JWT_SECRET=<staging-jwt-secret>   # from secret manager only
# Run harness per r9e2 prod-get-smoke-runbook.md
node apps/api/scripts/p76-r9b-http-get-smoke.mjs
```

**JSON must include:**

```json
{
  "environment": "production-like-staging",
  "baseUrl": "https://api-staging.<your-domain>",
  "results": [ "... 6 cases ..." ]
}
```

---

## 4. Controlled read path window (Ops only)

Only after steps 1–4 pass and signoff for enable window:

1. Set `PEIMA_P76_READ_PATH_ENABLED=1` + PM viewer IDs
2. Set `PEIMA_P76_PRODUCTION_KILL_SWITCH=0` (time-boxed)
3. Run GET smoke
4. Restore kill switch + read path off
5. Document in rollback drill artifact

**Never** set `PEIMA_P76_PRODUCTION_PERCENT > 0`.

---

## 5. PASS / BLOCK for r9e3 rerun

### PASS (`PASS_REAL_PROD_OPS_EXECUTION`)

- **8/8** checks **pass** with staging labels
- Grafana + watch + GET smoke on **non-localhost**
- [r9e3 closeout](../../../docs/P7/P7.6-r9e3-real-prod-ops-execution-closeout.md) updated

### BLOCK

- Any check still `localhost`
- Missing Grafana or empty GET `results`
- Evidence labeled as customer production
- percent > 0

---

## 6. After PASS

1. Rerun [P7.6-r9e](../../../docs/P7/P7.6-r9e-production-allowlist-monitoring-closeout.md)
2. Unblock [r9f planning](../../../docs/P7/P7.6-r9-production-percent-rollout-planning.md) (**planning only** · percent still 0)
3. Optional: clone stack for future **customer production** with separate r9e3 pass

---

## 7. Explicit non-goals

- Do not rename staging evidence as prod in signoff PDFs
- Do not enable percent rollout
- Do not delete legacy photo matching
