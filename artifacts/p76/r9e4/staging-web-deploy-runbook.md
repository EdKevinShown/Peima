# P7.6-r9e4 — Staging Web Deploy Runbook

> **Parent:** [P7.6-r9e4](../../../docs/P7/P7.6-r9e4-staging-production-like-environment-bootstrap-runbook.md)  
> **App:** `apps/web` · **Dockerfile:** [apps/web/Dockerfile](../../../apps/web/Dockerfile)

---

## 1. Scope

| In scope | Out of scope (minimal staging) |
|----------|-------------------------------|
| `apps/web` static build | `apps/admin` separate app |
| Route `/admin/p76/allowlist-apply-meta` | Full product QA |
| `VITE_API_BASE_URL` → staging API | Worker UI |

Web is **optional** for r9e3 GET smoke (curl/harness sufficient) but **recommended** for PM/Ops admin review.

---

## 2. Build

```bash
# Repository root — inject staging API at build time
export VITE_API_BASE_URL=https://api-staging.<your-domain>
pnpm --filter @peima/web build
```

Output: `apps/web/dist/`

**Docker build (alternative):**

```bash
docker build -f apps/web/Dockerfile \
  --build-arg VITE_API_BASE_URL=https://api-staging.<your-domain> \
  -t peima-web:staging .
```

Note: default Dockerfile runs `vite preview` — **production static hosting preferred** (Vercel/Netlify/S3).

---

## 3. Deploy (static hosting)

| Platform | Steps |
|----------|-------|
| **Vercel** | Root `apps/web` · build `pnpm build` · env `VITE_API_BASE_URL` |
| **Netlify** | Base directory `apps/web` · publish `dist` |
| **Render static** | Build command + publish dir `dist` |
| **Nginx** | Copy `dist/` → `app-staging.<domain>` |

Map custom domain: `app-staging.<your-domain>` → HTTPS.

---

## 4. Verification

| # | Check | Expected |
|---|-------|----------|
| 1 | Open `https://app-staging.<domain>/` | App loads |
| 2 | Login / JWT in localStorage per existing web auth | Session works |
| 3 | Navigate `/admin/p76/allowlist-apply-meta` | Page renders |
| 4 | Network tab: API calls go to `api-staging.<domain>` | Not localhost |
| 5 | `GET .../admin/p76/allowlist-apply-meta` | **200** with permission · or **403** if role missing |

**API route (server):** `GET /admin/p76/allowlist-apply-meta`  
**Permission:** `VIEW_P76_ALLOWLIST_APPLY_META`  
**Client:** [apps/web/src/api/p76AdminAllowlistApplyMeta.ts](../../../apps/web/src/api/p76AdminAllowlistApplyMeta.ts)

---

## 5. CORS

API enables broad CORS (`origin: true`). Staging Web on different subdomain should work without code changes.

If API is behind path prefix, ensure `VITE_API_BASE_URL` includes correct origin only (no trailing path unless configured).

---

## 6. Common failures

| Symptom | Fix |
|---------|-----|
| API calls to `localhost:3000` | Rebuild Web with correct `VITE_API_BASE_URL` |
| 403 on admin P76 | Grant role / use admin-capable test user |
| CORS error (rare) | Verify API URL scheme matches (`https`) |
| Empty allowlist table | Complete [postgres runbook](./staging-postgres-migration-runbook.md) seed |

---

## 7. Evidence

Optional screenshot or HAR redacted snippet attached to r9e5 closeout — **not** required in r9e4 runbook-only round.

---

## 8. BLOCK

- `VITE_API_BASE_URL=http://localhost:3000` in staging deployment
- Claiming Web deploy satisfies r9e3 without API + DB checks
