# Peima Staging Deployment Runbook (Ops Index)

> **P7.6 gate:** [P7.6-r9e4](../P7/P7.6-r9e4-staging-production-like-environment-bootstrap-runbook.md)  
> **Status:** index only · **not executed**

---

## Quick links

| Topic | Document |
|-------|----------|
| Master runbook | [P7.6-r9e4](../P7/P7.6-r9e4-staging-production-like-environment-bootstrap-runbook.md) |
| Architecture | [staging-architecture.md](../../artifacts/p76/r9e4/staging-architecture.md) |
| Env template | [peima-staging.env.example](./peima-staging.env.example) |
| Postgres + migrate | [staging-postgres-migration-runbook.md](../../artifacts/p76/r9e4/staging-postgres-migration-runbook.md) |
| API deploy | [staging-api-deploy-runbook.md](../../artifacts/p76/r9e4/staging-api-deploy-runbook.md) |
| Web deploy | [staging-web-deploy-runbook.md](../../artifacts/p76/r9e4/staging-web-deploy-runbook.md) |
| Monitoring | [staging-monitoring-runbook.md](../../artifacts/p76/r9e4/staging-monitoring-runbook.md) |
| r9e3 reverify | [staging-r9e3-reverify-checklist.md](../../artifacts/p76/r9e4/staging-r9e3-reverify-checklist.md) |
| Migration job | [peima-staging-migration-job.md](./peima-staging-migration-job.md) |
| Compose example | [docker-compose.staging.example.yml](../../docker-compose.staging.example.yml) |
| **Beta（无域名 · IP 内测）** | [beta-au-ip-deploy.md](./beta-au-ip-deploy.md) · [docker-compose.beta.yml](../../docker-compose.beta.yml) |

---

## Recommended order

1. Provision Postgres → set `DATABASE_URL`
2. Run migration job → verify `p76_allowlist_apply_meta`
3. Deploy API with **read path off** · **percent 0** · **kill switch on**
4. Import Grafana + test alert
5. (Optional) Deploy Web with `VITE_API_BASE_URL`
6. Seed sidecar / match data if needed
7. Execute [r9e2](../P7/P7.6-r9e2-real-prod-ops-execution-runbook.md) → backfill [r9e3](../P7/P7.6-r9e3-real-prod-ops-execution-closeout.md)
8. Record **P7.6-r9e5** closeout when bootstrap complete

---

## Hard rules

- No real secrets in git
- No customer production DB without explicit approval
- No percent rollout · no legacy removal
- Staging evidence: `environment=production-like-staging`
