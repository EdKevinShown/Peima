# P7.6-r9e4 — Staging Architecture

> **Runbook:** [P7.6-r9e4](../../../docs/P7/P7.6-r9e4-staging-production-like-environment-bootstrap-runbook.md)  
> **Purpose:** production-like staging topology for r9e3 reverify · **not** customer production

---

## 1. Logical architecture

```text
                         [ Browser / Ops / CI ]
                                    |
                          HTTPS (public internet)
                                    |
         +--------------------------+---------------------------+
         |                          |                           |
   app-staging.<domain>    api-staging.<domain>          Grafana Cloud
   (static Web)            (NestJS API :3000)            (dashboards + alerts)
         |                          |
         |                    [ UPLOAD_DIR volume ]
         |                          |
         +--------------------------+
                                    |
                    [ Managed PostgreSQL 16 ]
                    (staging-only instance)
```

---

## 2. Component matrix

| Layer | Role | Deploy? | Notes |
|-------|------|---------|-------|
| **Postgres 16** | Prisma + sidecar data | **Required** | Dedicated instance; no shared dev DB |
| **API** | REST + static uploads + P7.6 read path | **Required** | `apps/api/Dockerfile` |
| **Web** | Admin P76 page + manual QA | Optional | `apps/web` · route `/admin/p76/allowlist-apply-meta` |
| **Admin app** (`apps/admin`) | Separate Vite app | Optional | Not in default staging minimal set |
| **Worker** | batch-match / AI queues | **Skip** | Not needed for P7.6 GET reverify |
| **Redis** | — | **Skip** | Not used by docker-compose core path |

---

## 3. Provider options (pick one stack)

### Tier A — Fastest bootstrap (managed PaaS)

| Component | Options |
|-----------|---------|
| Postgres | **Neon** · **Supabase** · **Railway Postgres** |
| API | **Railway** · **Render** · **Fly.io** |
| Web | **Vercel** · **Netlify** · Render static |
| Logs | Platform native + Grafana Cloud |
| TLS | Provider-managed |

### Tier B — Cloud VM / container (closer to future prod)

| Component | Options |
|-----------|---------|
| Postgres | **AWS RDS** · **GCP Cloud SQL** · **阿里云 RDS** |
| API | **ECS Fargate** · **GKE** · **EC2** + Docker |
| Web | S3 + CloudFront · OSS + CDN |
| Logs | CloudWatch · 阿里云 SLS · Loki |
| TLS | ALB / Ingress + ACM |

### Tier C — Reference only (not r9e3 evidence)

| Component | Notes |
|-----------|-------|
| `localhost` + `peima-postgres` | **Rehearsal only** — does **not** satisfy r9e3 |
| Root [docker-compose.yml](../../../docker-compose.yml) | Dev/local; missing full P76 env |

**Example extended compose (local VM smoke):** [docker-compose.staging.example.yml](../../../docker-compose.staging.example.yml)

---

## 4. Network & security

| Rule | Detail |
|------|--------|
| DB ingress | Allow **only** API (and migration job IP) |
| API ingress | Public HTTPS; rate limit at edge if available |
| Secrets | Platform secret store; **never** commit to git |
| CORS | API uses permissive `origin: true` today — staging Web origin should work without code change |
| Environment label | All artifacts: `production-like-staging` |

---

## 5. Data boundaries

| Data | Staging policy |
|------|----------------|
| `p76_allowlist_apply_meta` | Seed Route C cohort (5 rows) per PM lock · or anonymized copy from dev |
| `match_results` | Must exist for GET smoke viewers |
| Customer PII | **Do not** copy prod without legal/ops approval |
| Backups | Enable before first migrate deploy |

---

## 6. DNS placeholders

| Record | Target |
|--------|--------|
| `api-staging.<your-domain>` | API load balancer / PaaS URL |
| `app-staging.<your-domain>` | Web CDN / static host |

Replace `<your-domain>` in all runbooks before execution.

---

## 7. Success criteria (architecture)

- [ ] `DATABASE_URL` host ≠ `localhost`
- [ ] API base URL is `https://` and reachable from Ops laptop
- [ ] Grafana can query logs or metrics from staging API
- [ ] Worker **not** required for checklist above
