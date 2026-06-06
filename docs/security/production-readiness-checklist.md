# PEIMA Production Readiness Checklist

> **用途**：生产 / staging 上线前人工核对清单。  
> **性质**：只读运维文档 · 不替代自动化 CI · 不记录真实 secret 值。  
> **最后对齐代码**：`apps/api` CORS / JWT / RBAC / 图片鉴权 · `e2e/` onboarding Playwright · `.env.example`。

---

## 快速总览

| # | 类别 | 生产必须 | 验证方式 |
|---|------|----------|----------|
| 1 | 环境变量 | JWT / DB / Testing Observability 默认关闭 | 启动 API 不报错 · env 审计 |
| 2 | CORS | 仅正式前端域名 · 无 wildcard / `origin: true` | `cors.config.spec.ts` · 浏览器预检 |
| 3 | 图片访问 | 无公开 `/uploads/user-images` · JWT + 3-2-1 变体 | E2E + 手工 curl |
| 4 | Admin RBAC | capabilities / photo review / P76 已 RBAC | Jest admin specs |
| 5 | DB / Prisma | migrate deploy + generate | 部署脚本 |
| 6 | E2E | onboarding preview 契约 | Playwright |
| 7 | 构建 | API 编译 + Jest + Web build | 见 §7 |
| 8 | 回滚 | 关 observability / mutation gates | 见 §8 |

---

## 1. 环境变量（Env）

### 1.1 `JWT_SECRET`

- [ ] **生产 `NODE_ENV=production` 时必须显式设置**（不可省略）。
- [ ] **长度 ≥ 32 字符**，使用密码学安全随机值（禁止 `change-me-in-production` 等占位符）。
- [ ] 生成示例：`openssl rand -hex 32`
- [ ] 实现参考：`apps/api/src/common/config/jwt-secret.config.ts`（`JWT_SECRET_MIN_LENGTH_PRODUCTION = 32`）
- [ ] API 启动时通过 `getJwtSecret()` 校验；弱 secret 会直接抛错拒绝启动。

### 1.2 `DATABASE_URL`

- [ ] 指向生产 PostgreSQL 实例（含 `schema=public` 等必要参数）。
- [ ] 凭证仅存于部署平台 secret / `.env`（**不得**提交 git、不得写入 artifact）。
- [ ] 部署前确认网络可达、连接池/SSL 策略与托管方一致。
- [ ] Docker 场景参考 `.env.example` 中 `DOCKER_DATABASE_URL` 与 `postgres` 服务名。

### 1.3 `PEIMA_TEST_OBSERVABILITY_ENABLED`

- [ ] **生产默认关闭**（未设置或非 `"1"` 即关闭）。
- [ ] 关闭时：`/admin/testing-observability/*` 由 `TestingObservabilityGuard` 返回 **404**（对外不可见）。
- [ ] 参考：`.env.example` §15b · `testing-observability-env.ts`

### 1.4 `PEIMA_TEST_OBSERVABILITY_TOKEN`（仅在开启 observability 时）

- [ ] **若 `PEIMA_TEST_OBSERVABILITY_ENABLED=1`，token 必须强随机**（≥ 32 字符）。
- [ ] 禁止弱占位符：`local-dev-only` · `changeme` · `debug` · `testing` 等（启动时拒绝）。
- [ ] **生产额外要求**（`NODE_ENV=production` 且 observability 开启时）：
  - 必须设置 `PEIMA_TEST_OBSERVABILITY_TOKEN`
  - 必须配置 `PEIMA_ADMIN_USER_IDS`（至少一个 admin）
  - 请求需 **admin JWT + `x-peima-debug-token` 双因子**（见 `testing-observability.guard.ts`）
- [ ] 生成示例：`openssl rand -hex 32`
- [ ] **生产推荐**：保持 `PEIMA_TEST_OBSERVABILITY_ENABLED` 未设置或 `0`，不启用该模块。

### 1.5 其他生产相关 env（交叉引用）

| 变量 | 生产建议 |
|------|----------|
| `PEIMA_CORS_ALLOWED_ORIGINS` | 必填 · 见 §2 |
| `VITE_API_BASE_URL` | 指向生产 API 域名（Web 构建时注入） |
| `API_PUBLIC_BASE_URL` | 反向代理后的对外 API origin |
| `PEIMA_ADMIN_USER_IDS` | 仅列出真实运维/管理员 userId |
| `PEIMA_TEST_MATCH_*` | **默认全部关闭** · 见 §8 |

---

## 2. CORS

### 2.1 生产只允许正式前端域名

- [ ] `NODE_ENV=production` 时 **`PEIMA_CORS_ALLOWED_ORIGINS` 必填**；缺失则 API 启动失败。
- [ ] 值为逗号分隔的 **完整 origin**（含 scheme），例如：  
  `PEIMA_CORS_ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com`
- [ ] 仅包含实际上线的 Web / Admin 域名；**不要**包含 `localhost`（除非该环境就是本地 staging）。
- [ ] 实现：`apps/api/src/common/config/cors.config.ts` · `buildNestCorsOptions()`

### 2.2 禁止宽松 CORS

- [ ] **不允许** `PEIMA_CORS_ALLOWED_ORIGINS=*`（wildcard 会在启动时抛错）。
- [ ] **不允许** Nest `origin: true`（反射任意 Origin）——当前实现为 **显式 allowlist + callback**，未使用 `origin: true`。
- [ ] **不允许** wildcard + credentials 组合（当前 `credentials: false`，仍须保持显式 origin）。
- [ ] 开发默认值（仅 `NODE_ENV≠production` 且 env 未设）：`http://localhost:5173` · `http://localhost:3000`

### 2.3 部署后 smoke

- [ ] 从生产 Web origin 发起 API 请求返回正常。
- [ ] 从未授权 origin 发起请求被 CORS 拒绝（浏览器 Network 可见 blocked）。
- [ ] Playwright E2E 本地须用 **`http://localhost:5173`**（非 `127.0.0.1`），与 dev CORS 默认一致。

---

## 3. 图片访问

### 3.1 `/uploads/user-images` 不能公开

- [ ] API **未**挂载 `uploads/user-images` 静态目录（`main.ts` 无 `useStaticAssets` / `ServeStaticModule`）。
- [ ] 磁盘路径 `UPLOAD_DIR`（默认 `apps/api/uploads/user-images`）仅服务端读写；**浏览器不得**直接 GET 该 URL。
- [ ] `UserImage.imageUrl` 字段可能仍含 legacy path 字符串，但前端应通过 `AuthenticatedUserImage` + `/images/:id/content` 展示（见 `apps/web/src/api/images.ts` · `resolveUserImageUrl`）。
- [ ] E2E 断言：预览池阶段 **零** `/uploads/user-images/` 网络请求（`e2e/fixtures/network.ts`）。

### 3.2 `/images/:id/content` 必须 JWT 鉴权

- [ ] 路由：`GET /images/:id/content` · `@UseGuards(JwtAuthGuard)`（`images.controller.ts`）。
- [ ] 无 token → **401** `not authenticated`。
- [ ] 访问决策：`UserImageContentAccessService.resolveAccess()` — 本人照片 / 预览池 slot / photo-review admin 以外 → **403**。
- [ ] 响应头：`Cache-Control: private, no-store`。
- [ ] 手工验证（需有效 JWT）：
  ```bash
  curl -i "https://<api>/images/<imageId>/content"
  # 期望 401

  curl -i -H "Authorization: Bearer <token>" \
    "https://<api>/images/<otherUserImageId>/content"
  # 非授权关系期望 403
  ```

### 3.3 Preview Pool 3-2-1 展示契约

| Group | Rank | `displayMode` | API 行为 | UI 标签 |
|-------|------|---------------|----------|---------|
| Group 1 | #1–#3 | `clear` | 返回原图 bytes | 清晰 |
| Group 2 | #4–#5 | `blurred` | 服务端 **sharp blur(24)** 后返回 | 朦胧 |
| Group 3 | #6 | `hidden` | **403** `photo locked for this preview slot` | 待解锁（占位/锁） |

- [ ] 实现：`user-image-content-access.service.ts` · `user-image-content.service.ts` · `OnboardingPreviewPoolGallery.jsx`
- [ ] Onboarding 预览 UI **不得**调用 `GET /users/:candidateUserId` 解析候选人姓名（E2E 网络契约已覆盖）。

---

## 4. Admin 权限

### 4.1 已迁移至 RBAC（`RbacGuard` + `@RequirePermission`）

| 区域 | 路由前缀 | Permission | Controller |
|------|----------|------------|------------|
| Admin capabilities | `GET /admin/capabilities` | `VIEW_ADMIN_CAPABILITIES` | `admin.controller.ts` |
| Photo review | `/admin/photo-review/*` | `MANAGE_PHOTO_REVIEW` | `admin-photo-review.controller.ts` |
| P76 allowlist meta | `/admin/p76/allowlist-apply-meta/*` | `VIEW_P76_ALLOWLIST_APPLY_META` | `p76-admin-allowlist-apply-meta.controller.ts` |
| P76 canonical rehearsal | `/admin/p76/canonical-rehearsal/*` | `VIEW_P76_CANONICAL_REHEARSAL` | `p76-canonical-rehearsal-admin.controller.ts` |
| P76 sidecar 只读 | `/admin/p76/canonical-sidecar/*` (GET) | `VIEW_P76_CANONICAL_REHEARSAL` | `p76-canonical-sidecar-admin.controller.ts` |
| P76 apply preview | `GET .../apply-preview` | `VIEW_P76_CANONICAL_REHEARSAL` | `p76-canonical-apply-preview.controller.ts` |
| P76 rollback preview | `GET .../rollback-snapshot-preview` | `VIEW_P76_CANONICAL_REHEARSAL` | `p76-canonical-rollback-snapshot-preview.controller.ts` |
| P76 apply / rollback 写入 | `POST .../apply` · `POST .../rollback` | `APPLY_P76_CANONICAL_REHEARSAL` · `ROLLBACK_P76_CANONICAL_WRITE` | `p76-canonical-admin-mutation.controller.ts` |

- [ ] 权限定义：`packages/shared/constants/p5-rbac.ts`
- [ ] 非 ADMIN 角色调用上述端点 → **403**（见 `admin-capabilities.controller.spec.ts` 等）。
- [ ] Web 侧 `GET /admin/capabilities`：401/403 时 fail-closed，不暴露 admin UI（`useAdminAccess` · `resolveAdminCapabilitiesFetch`）。

### 4.2 仍使用 legacy `assertCan*` / allowlist 的端点（待迁移清单）

以下仍依赖 `AdminService.assertCan*`（内部检查 `PEIMA_ADMIN_USER_IDS`）或 `test-match.policy.ts`，**尚未**统一到 `RbacGuard`：

| 方法 / 策略 | 影响端点（示例） | 迁移目标建议 |
|-------------|------------------|--------------|
| `assertCanTriggerBatchMatch` | `POST /admin/batch-match/run-once` | `Permission` + RBAC；保留 `PEIMA_ADMIN_BATCH_MATCH_DISABLED` kill-switch |
| `assertCanRunAiSimulationV1` | `AdminController` 内 AI simulation / prescreen / post-pool 等 POST | 独立 `RUN_AI_SIMULATION` 或复用 ADMIN role |
| `assertCanRunPostPoolDeepScreenShadow` | `POST /admin/post-pool-deep-screen/run-orchestration-mvp` 等 | RBAC permission |
| `assertCanRunPrescreenDebug` | `POST /admin/prescreen-v0/batch-debug` | RBAC permission |
| `assertCanReadMatchingObservabilitySummary` | `GET /admin/matching-observability/summary` | `VIEW_GLOBAL_ANALYTICS` 或专用 permission |
| `assertCanTriggerTestMatch` | `POST /test/matching/run-batch-once` | 生产 env **关闭** + 未来 RBAC / 移除 |
| `assertCanSeedTestPreviewPool` | `POST /test/preview-pool/seed-latest` | 生产 env **关闭** + 未来 RBAC / 移除 |
| `canSeeBatchMatchTrigger` | `GET /admin/capabilities` 响应字段 | 已 RBAC 保护端点本身；字段逻辑仍用 admin allowlist |

- [ ] **生产部署前**：确认 regular user JWT **无法**调用上表 mutation 端点（期望 403）。
- [ ] 跟踪迁移：将上表逐项替换为 `@RequirePermission` 并补充 Jest spec。

### 4.3 用户资料访问（非 Admin，但属 P0 安全）

- [ ] `GET /users/:id` · `PATCH /users/:id`：仅 **本人或 ADMIN**（`authorize-self-user-access.ts`）。
- [ ] Onboarding 预览池 UI 不得 fetch 候选人 profile（见 §3.3 · E2E）。

---

## 5. DB / Prisma

### 5.1 Migration deploy

- [ ] 部署流水线在启动新 API 版本 **之前** 执行：
  ```bash
  pnpm db:migrate:deploy
  # 等价：dotenv -e .env -- pnpm --filter @peima/database run db:migrate:deploy
  ```
- [ ] 使用 **与生产 API 相同** 的 `DATABASE_URL`。
- [ ] 禁止对生产库执行 `prisma db push`（仅本地 dev 使用）。
- [ ] 大版本 migration 需 DBA / Eng 书面评审（参考 `docs/P7/P7.6-r9a2-production-readiness-remediation-plan.md` §migration）。

### 5.2 Prisma generate

- [ ] 构建 / 安装后确保 Client 与 schema 同步：
  ```bash
  pnpm --filter @peima/database run db:generate
  ```
- [ ] 根目录 `pnpm install` 的 `prepare` hook 会自动 `db:generate`；CI/CD 须在 `pnpm install` 后执行 API build。
- [ ] API `prebuild` 依赖 `@peima/database` build + `@peima/shared` build。

### 5.3 部署后 DB smoke

- [ ] API 健康启动，无 Prisma migration pending 错误。
- [ ] 抽样只读查询（如 `GET /auth/me` with test user）成功。

---

## 6. E2E（Playwright）

### 6.1 Onboarding preview 主流程

- [ ] 用例：`e2e/specs/onboarding-preview.e2e.spec.ts`
- [ ] 覆盖：Register → 上传 → 审美偏好 → 3-2-1 预览 → 问卷 → 匹配等待
- [ ] 前置：API `:3000` · Web `:5173` · demo 候选人已导入：
  ```bash
  pnpm --filter @peima/api run p75:r4-import-candidate-images \
    -- --folder=dev-assets/test-user-images --dryRun=false
  ```

### 6.2 网络安全契约（自动化断言）

- [ ] **无** `/uploads/user-images/` 请求
- [ ] 预览卡片图片 **仅** `GET /images/:id/content`
- [ ] **无** `GET /users/:candidateUserId`（候选人 profile）
- [ ] 6 slots：3×清晰 · 2×朦胧 · 1×待解锁 · `#1`–`#6` 可见

### 6.3 Final match（可选 · worker 依赖）

- [ ] 用例：`e2e/specs/final-match.e2e.spec.ts`（单独运行）
- [ ] 需 `PEIMA_TEST_PREVIEW_POOL_SEED_*` + `PEIMA_TEST_MATCH_*` allowlist；未配置则 **skip**

### 6.4 运行命令

```bash
pnpm test:e2e:install          # 首次：安装 Chromium
pnpm test:e2e:onboarding       # A. onboarding 主流程
pnpm test:e2e:final-match      # B. final match（可选）
pnpm test:e2e                  # 全部
```

---

## 7. 部署前命令

在 monorepo 根目录、使用与生产一致的 Node 20+ / pnpm 9+：

### 7.1 API TypeScript 编译

```bash
# 类型检查（不 emit）
pnpm --filter @peima/api exec tsc -p tsconfig.build.json --noEmit

# 或完整 Nest 构建（部署 artifact）
pnpm build:api
```

### 7.2 API Jest

```bash
pnpm --filter @peima/api test
```

- [ ] 关键 spec 必须通过，至少包括：
  - `cors.config.spec.ts`
  - `jwt-secret.config.spec.ts`
  - `testing-observability.spec.ts`
  - `admin-capabilities.controller.spec.ts`
  - `user-image-content-access.spec.ts`

### 7.3 Web 构建

```bash
# 生产 API URL 须在构建时注入
VITE_API_BASE_URL=https://api.example.com pnpm build:web
```

- [ ] `pnpm --filter @peima/web build` 无 error。
- [ ] 可选：`pnpm --filter @peima/web test`（单元 / 契约小测试）。

### 7.4 推荐顺序

```bash
pnpm install
pnpm db:migrate:deploy          # 生产库
pnpm --filter @peima/database run db:generate
pnpm --filter @peima/api exec tsc -p tsconfig.build.json --noEmit
pnpm --filter @peima/api test
VITE_API_BASE_URL=<prod-api> pnpm build:web
pnpm build:api
pnpm test:e2e:onboarding        # 对 staging 环境（可选但推荐）
```

---

## 8. 回滚

### 8.1 关闭 Testing Observability

| 动作 | Env |
|------|-----|
| 立即关闭测试监视 API | `PEIMA_TEST_OBSERVABILITY_ENABLED=0` 或 **删除**该变量 |
| 清除 debug token | 删除 `PEIMA_TEST_OBSERVABILITY_TOKEN` |
| 重启 | 滚动重启 API 实例 |

- [ ] 验证：`GET /admin/testing-observability/users` → **404**
- [ ] 若曾泄露 token：轮换 token + 审计 access log

### 8.2 关闭 mutation / test gates

生产 incident 或误开测试开关时，逐项确认 **未启用**（或设为 `0` / `false`）：

| Env | 作用 |
|-----|------|
| `PEIMA_TEST_MATCH_ENABLED` | Web「测试跑一轮」 |
| `PEIMA_TEST_MATCH_USER_IDS` | 测试匹配 allowlist |
| `PEIMA_TEST_MATCH_RESULT_WRITER_ENABLED` | 测试 MatchResult 写入 |
| `PEIMA_TEST_MATCH_RESULT_WRITER_OPEN_FOR_ALL` | 放宽 writer allowlist |
| `PEIMA_TEST_PREVIEW_POOL_SEED_*` | 测试预览池 seed |
| `PEIMA_ADMIN_BATCH_MATCH_DISABLED=1` | **Kill-switch**：禁止 admin 触发 batch-match |
| `PEIMA_M5_RRM_SIM_READONLY_SUMMARY_WRITE_ENABLED` | M5 只读 summary 写 DB |
| `PEIMA_M5_RRM_TOP2_META_WRITE_ENABLED` | RRM Top2 meta 写 DB |
| `PEIMA_ONBOARDING_VISION_APPLY_TO_POOL` | Vision 结果写入预览池 |
| `PEIMA_ONBOARDING_PREVIEW_RELAX_*` | 放宽 onboarding 预览池 gate（仅 dev/staging） |

- [ ] P76 canonical **写入**（apply/rollback）无独立 env gate，依赖 RBAC；回滚时确认无异常 ADMIN JWT 泄露。

### 8.3 Rollback env checklist（应用版本 + 配置）

- [ ] **应用**：回滚到上一稳定镜像 / 部署版本（API + Web + Worker 同步）。
- [ ] **数据库**：
  - 若新版本 migration **不可逆**，禁止仅回滚代码；需 DBA runbook（forward-fix 或 restore backup）。
  - 若 migration 可安全滞后，回滚代码后确认 schema 仍兼容。
- [ ] **Env 快照**：恢复上一版 env（尤其 `JWT_SECRET` · `DATABASE_URL` · `PEIMA_CORS_ALLOWED_ORIGINS` · `VITE_API_BASE_URL`）。
- [ ] **Secrets**：若怀疑 JWT 泄露，轮换 `JWT_SECRET`（会使全部 session 失效，需公告）。
- [ ] **CORS**：回滚后从生产 Web origin 验证 API 可达。
- [ ] **Smoke**：登录 → 上传照片 → 预览池 6 槽 → 问卷 → 匹配等待（或 staging 等价路径）。
- [ ] **监控**：错误率 / 5xx / batch-match 队列深度恢复基线。

### 8.4 回滚后验证清单

- [ ] Testing observability **404**
- [ ] Regular user **403** on `/admin/*` mutation
- [ ] `/images/:id/content` 仍拒绝未授权访问
- [ ] 无浏览器直连 `/uploads/user-images/*` 200

---

## 附录 A — 相关文件索引

| 主题 | 路径 |
|------|------|
| Env 模板 | `.env.example` |
| JWT | `apps/api/src/common/config/jwt-secret.config.ts` |
| CORS | `apps/api/src/common/config/cors.config.ts` |
| Testing observability | `apps/api/src/modules/testing-observability/` |
| 图片鉴权 | `apps/api/src/modules/images/user-image-content-access.service.ts` |
| RBAC 常量 | `packages/shared/constants/p5-rbac.ts` |
| Legacy admin checks | `apps/api/src/modules/admin/admin.service.ts` |
| Playwright | `e2e/specs/onboarding-preview.e2e.spec.ts` |
| Ops 示例 | `docs/ops/peima-beta.env.example` · `docs/ops/peima-staging.env.example` |

---

## 附录 B — 签署（可选）

| 角色 | 姓名 | 日期 | 备注 |
|------|------|------|------|
| Eng | | | §7 构建 + §6 E2E |
| Ops | | | §1 env · §5 migrate · §8 回滚 |
| Security | | | §2 CORS · §3 图片 · §4 RBAC |

---

*本文档随代码演进需人工更新；若实现与清单不一致，以代码与 Jest/Playwright 为准。*
