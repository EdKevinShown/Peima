# P7.6-r9e4 — Staging API Deploy Runbook

> **Parent:** [P7.6-r9e4](../../../docs/P7/P7.6-r9e4-staging-production-like-environment-bootstrap-runbook.md)  
> **Env:** [staging-env-template.md](./staging-env-template.md)  
> **Dockerfile:** [apps/api/Dockerfile](../../../apps/api/Dockerfile)

---

## 1. Build image

From repository root:

```bash
docker build -f apps/api/Dockerfile -t peima-api:staging .
```

Image stages: `pnpm install` → `@peima/database` build → `@peima/shared` build → `nest build` → `start:prod`.

---

## 2. Required environment (initial boot)

Set in platform secret / compose override — see [staging-env-template.md](./staging-env-template.md).

**Critical gates:**

| Variable | Initial value |
|----------|---------------|
| `DATABASE_URL` | staging RDS URL (**not** localhost) |
| `PEIMA_P76_READ_PATH_ENABLED` | **`0`** |
| `PEIMA_P76_PRODUCTION_PERCENT` | **`0`** |
| `PEIMA_P76_PRODUCTION_KILL_SWITCH` | **`1`** |

---

## 3. Persistent uploads

API serves static files from `UPLOAD_DIR` at `/uploads/user-images/` ([main.ts](../../../apps/api/src/main.ts)).

| Platform | Pattern |
|----------|---------|
| Railway / Render | mounted disk |
| ECS / K8s | PVC / EBS volume → `/data/uploads/user-images` |
| Fly.io | volume mount |

Set:

```bash
UPLOAD_DIR=/data/uploads/user-images
API_PUBLIC_BASE_URL=https://api-staging.<your-domain>
```

---

## 4. Deploy steps (generic)

| # | Step |
|---|------|
| 1 | Push image to registry (GHCR · ECR · provider built-in) |
| 2 | Create service `peima-api-staging` |
| 3 | Attach secrets (§2) |
| 4 | Mount upload volume |
| 5 | Expose port `3000` |
| 6 | Map HTTPS `api-staging.<domain>` |
| 7 | Health check: `GET /health` or `GET /api/health` |
| 8 | Confirm logs show Nest listening on `0.0.0.0:3000` |

**PaaS one-liner alternative:** connect Git repo · set root Dockerfile `apps/api/Dockerfile` · inject env.

---

## 5. Post-deploy verification

### 5.1 Health

```bash
curl -sS "https://api-staging.<your-domain>/health"
# or /api/health per deployment routing
```

### 5.2 DB connectivity

Logs should **not** show Prisma connection errors to `localhost`.

### 5.3 Admin API (optional)

```bash
# Requires Bearer JWT for user with VIEW_P76_ALLOWLIST_APPLY_META
curl -sS -H "Authorization: Bearer <token>" \
  "https://api-staging.<your-domain>/admin/p76/allowlist-apply-meta?limit=5"
```

### 5.4 GET smoke (after data + controlled enable window)

Use [r9e2 prod-get-smoke-runbook](../r9e2/prod-get-smoke-runbook.md) against staging base URL.

Harness reference: `apps/api/scripts/p76-r9b-http-get-smoke.mjs` · set `API_BASE_URL` env.

---

## 6. Env export for r9e3

Redact secrets; capture to [real-prod-pod-env-check.md](../r9e3/real-prod-pod-env-check.md):

```text
environment=production-like-staging
service=peima-api-staging
PEIMA_P76_READ_PATH_ENABLED=0
PEIMA_P76_PRODUCTION_PERCENT=0
PEIMA_P76_PRODUCTION_KILL_SWITCH=1
DATABASE_URL host=<redacted>  # never paste password
```

For K8s: `kubectl exec ... env | grep PEIMA_P76`  
For Render/Railway: dashboard env export (redacted).

---

## 7. BLOCK conditions

- API `DATABASE_URL` contains `localhost`
- `PEIMA_P76_READ_PATH_ENABLED=1` on first deploy without signoff
- `PEIMA_P76_PRODUCTION_PERCENT > 0`
- No HTTPS on public smoke URL

---

## 8. Rollback (deploy layer)

| Action | When |
|--------|------|
| Roll back to previous image tag | Bad deploy |
| Set kill switch + read path off | P7.6 incident |
| Do **not** rollback Prisma unless DBA-approved | Schema already shared with data |
