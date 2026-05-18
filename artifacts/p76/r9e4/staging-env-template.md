# P7.6-r9e4 — Staging Env Template

> **Copy source:** [docs/ops/peima-staging.env.example](../../../docs/ops/peima-staging.env.example)  
> **Freeze reference:** [r9c2 production-env-freeze](../r9c2/production-env-freeze.md)

---

## 1. Core API (required)

```bash
# --- Staging Postgres (REQUIRED: non-localhost host) ---
DATABASE_URL=postgresql://<user>:<password>@<staging-host>:5432/peima?schema=public

NODE_ENV=production
TZ=Asia/Shanghai
API_PORT=3000
API_HOST=0.0.0.0

# Generate per environment — DO NOT commit real value
JWT_SECRET=<generate-strong-secret-min-32-chars>
JWT_EXPIRES_IN=7d
```

---

## 2. P7.6 allowlist read path (bootstrap freeze)

**Initial staging deploy — MUST use these values:**

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

| Variable | Bootstrap | r9e3 controlled window (Ops only) |
|----------|-----------|-----------------------------------|
| `READ_PATH_ENABLED` | `0` | `1` (time-boxed) |
| `VIEWER_IDS` | empty | PM-locked 5 ids |
| `KILL_SWITCH` | `1` | `0` only during drill; restore `1` after |
| `PRODUCTION_PERCENT` | `0` | **must stay 0** |

---

## 3. Web build (required if deploying Web)

```bash
VITE_API_BASE_URL=https://api-staging.<your-domain>
```

Build-time only — rebuild Web after API URL changes.

---

## 4. Uploads / public URLs (recommended)

```bash
UPLOAD_DIR=/data/uploads/user-images
API_PUBLIC_BASE_URL=https://api-staging.<your-domain>
```

Without `API_PUBLIC_BASE_URL`, user image URLs in API responses may point at wrong host.

---

## 5. Optional (staging defaults off)

```bash
# Worker — omit if not deploying worker
# MATCH_CRON=0 0 * * *
# AI_*_WORKER_ENABLED=0

# Admin batch-match — only if needed for data prep
# PEIMA_ADMIN_USER_IDS=<comma-separated-user-ids>
```

---

## 6. Controlled enable block (NOT for bootstrap — r9e3 window only)

**Do not apply until:** migration OK · SQL `violation_count=0` · Grafana imported · PM/Ops signoff.

```bash
PEIMA_P76_READ_PATH_ENABLED=1
PEIMA_P76_READ_PATH_VIEWER_IDS=cmr4hm001016z64demo00m05a,cmfemn00100016z64seed0001,cmr4hf000716z64demo00f04a,cmr4hf000916z64demo00f05a,cmr4r7j4050025z64stag0001
PEIMA_P76_PRODUCTION_KILL_SWITCH=0
# PEIMA_P76_PRODUCTION_PERCENT must remain 0
# PEIMA_P76_PRODUCTION_PERCENT_ENABLED must remain 0
```

---

## 7. Secret handling rules

| Rule | |
|------|--|
| Never commit | `DATABASE_URL` password · `JWT_SECRET` · Grafana tokens · LLM API keys |
| Store in | Railway/Render secrets · AWS Secrets Manager · K8s Secret |
| Rotate | JWT + DB password on staging rebuild |
| Audit | Export redacted env snapshot to [real-prod-pod-env-check.md](../r9e3/real-prod-pod-env-check.md) with `environment=production-like-staging` |

---

## 8. Verification checklist (env only)

- [ ] `DATABASE_URL` does not contain `localhost` or `127.0.0.1`
- [ ] `PEIMA_P76_READ_PATH_ENABLED=0` at first API boot
- [ ] `PEIMA_P76_PRODUCTION_PERCENT=0`
- [ ] `PEIMA_P76_PRODUCTION_KILL_SWITCH=1`
- [ ] `PEIMA_P76_READ_PATH_FALLBACK_LEGACY=1`
- [ ] No real secrets in git
