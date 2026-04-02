# Peima / 配吗

AI 驱动的关系匹配 MVP，包含登录、问卷画像、预览池、批次匹配、最终结果与单对象聊天。

## 当前项目状态

- 当前状态：**P0 已完成**
- 当前阶段：**P0 验收通过，准备进入 P1**
- 已跑通能力（端到端）：
  - JWT 注册/登录与 `/auth/me`
  - 问卷获取与提交（画像落库）
  - 6 人预览池生成与前端展示
  - 入队匹配与 worker 批次匹配（含 cron 注册）
  - 最终匹配结果展示
  - 单对象聊天（进入会话 + 发送消息）
  - Docker Compose 跑通 `postgres / api / web / worker`
- 当前完成的是 P0 最小可运行 MVP，主流程已验收通过，但仍有生产级优化空间。

## 技术栈

- Web：React + Vite
- API：NestJS
- Worker：Node.js + TypeScript + node-cron
- Database：Prisma + PostgreSQL
- Auth：JWT（Nest + passport-jwt）
- Deployment：Docker Compose

## 环境要求

- Node.js >= 20
- pnpm >= 9
- Docker / Docker Compose（用于最小部署与 P0 验收）

## 快速开始

### 本地启动（最短命令）

```bash
pnpm install && pnpm dev:api
```

另开终端按需启动：

```bash
pnpm dev:web
pnpm dev:worker
```

### Docker 启动（最短命令）

```bash
cp .env.example .env
docker compose up -d postgres
docker compose run --rm api pnpm --filter @peima/database db:migrate -- --name docker_init
docker compose up -d --build api worker web
```

## 仓库结构（Monorepo）

| 路径 | 说明 |
|---|---|
| `apps/web` | 用户端前端：登录、问卷、预览池、匹配状态/结果、聊天页面 |
| `apps/admin` | 管理端占位（当前 P0 不强依赖） |
| `apps/api` | NestJS 后端：auth/users/preferences/images/preview-pool/questionnaire/matching/chat |
| `apps/worker` | 批处理 worker：cron 注册、batch-match、队列消费 |
| `packages/database` | Prisma schema、迁移脚本、PrismaClient 导出 |
| `packages/shared` | 跨包共享类型/常量（基础结构） |
| `packages/config` | 共享配置占位 |
| `packages/ai-prompts` | AI 提示词资产占位 |
| `packages/scoring` | 评分逻辑占位（P1 可扩展） |
| `packages/sdk` | SDK 占位 |
| `infrastructure` | Docker/Nginx/脚本/监控相关物料 |
| `docs/P0` | P0 交接、验收清单、bugfix 记录、状态摘要 |

## 当前已跑通的 P0 主链路

1. `/login` 登录（注册/登录，保存 `peimaToken` 与 `peimaUserId`）
2. `/questionnaire` 提交问卷（生成/更新用户画像）
3. 准备候选用户和图片数据（候选用户需有 images）
4. `/preview-pool` 生成并展示 6 人预览池
5. `/matching-waiting` 查看匹配状态
6. worker 执行 `batch-match`（手动一次或 cron 触发）
7. `/final-match` 查看最终匹配结果
8. `/chat` 进入聊天并发送消息

## 关键页面

- `/login`：P0 注册/登录入口，完成 token 与 userId 持久化
- `/questionnaire`：加载固定题库并提交 12 题答案
- `/preview-pool`：展示最新 6 人预览池（full / blurred / locked）
- `/matching-waiting`：查询并展示匹配状态（waiting/processing/ready）
- `/final-match`：展示最终匹配对象与评分摘要
- `/chat`：加载会话与消息，支持发送消息

## 关键 API（及 JWT 保护）

- 公开：
  - `POST /auth/register`
  - `POST /auth/login`
  - `GET /questionnaire/questions`

- 需要 JWT：
  - `GET /auth/me`
  - `POST /questionnaire/submit`
  - `POST /preview-pool/generate`
  - `GET /preview-pool/user/:userId/latest`
  - `POST /matching/enqueue`
  - `GET /matching/status/:userId`
  - `GET /matching/result/:userId`
  - `POST /chat/conversations`
  - `POST /chat/messages`
  - `GET /chat/conversations/:conversationId`

> 说明：受保护接口会校验 token 用户与请求中的 `userId/senderUserId` 一致性。
>
> 前端行为补充：登录后会把 `peimaToken` / `peimaUserId` 写入 `localStorage`，并在核心请求中自动携带 `Authorization: Bearer <token>`。

### 页面与接口对应关系

- `/login`：
  - `POST /auth/register`
  - `POST /auth/login`
  - `GET /auth/me`
- `/questionnaire`：
  - `GET /questionnaire/questions`
  - `POST /questionnaire/submit`
- `/preview-pool`：
  - `POST /preview-pool/generate`
  - `GET /preview-pool/user/:userId/latest`
- `/matching-waiting`：
  - `GET /matching/status/:userId`
- `/final-match`：
  - `GET /matching/result/:userId`
  - （进入聊天入口）`POST /chat/conversations`
- `/chat`：
  - `GET /chat/conversations/:conversationId`
  - `POST /chat/messages`

## 本地开发启动方式

安装依赖：

```bash
pnpm install
```

按需启动：

```bash
pnpm dev:web      # 用户端 Web
pnpm dev:api      # NestJS API
pnpm dev:worker   # Worker（dev 模式）
pnpm dev:admin    # Admin（占位）
```

## 最小 Docker 部署（P0）

用于本地快速拉起 `postgres / api / worker / web`，非生产级高可用部署。

### 1) 复制环境变量

```bash
cp .env.example .env
```

### 2) 启动 PostgreSQL

```bash
docker compose up -d postgres
```

### 3) 初始化数据库（Prisma migrate）

```bash
docker compose run --rm api pnpm --filter @peima/database db:migrate -- --name docker_init
```

### 4) 启动 API / Worker / Web

```bash
docker compose up -d --build api worker web
```

### 5) 查看日志与健康状态

```bash
docker compose ps
docker compose logs -f worker
docker compose logs -f api
docker compose logs -f web
```

worker 正常日志应包含：
- `worker started`
- `daily-match.scheduler cron registered: MATCH_CRON=...`
- 跑批时：`batch started` / `batch completed`（异常时 `batch failed`）

Web 正常访问地址：
- `http://localhost:5173`

### 快速健康检查

用于 1-2 分钟判断四个核心服务是否正常：

1. 服务状态：
   ```bash
   docker compose ps
   ```
   预期：`postgres / api / web / worker` 都是 `Up`。
2. Web 可访问：
   - 打开 `http://localhost:5173`
   - 可进入 `/login`
3. API 可响应：
   ```bash
   curl -i http://localhost:3000/auth/me
   ```
   预期：返回 `401`（说明 API 与鉴权中间件在工作）。
4. Worker 正常：
   ```bash
   docker compose logs --tail=50 worker
   ```
   预期：能看到 `worker started` 与 `cron registered`，手动触发后有 `batch started/batch completed`。

## P0 验收方式（简明）

测试数据前置条件：`preview-pool` 生成要求候选池至少有 **6 个带 images 的候选用户**（且不包含当前 viewer）。

按下列顺序执行：

1. 登录：访问 `/login` 完成注册/登录
2. 问卷：访问 `/questionnaire` 提交 12 题
3. 预览池：调用/触发 `preview-pool generate`，在 `/preview-pool` 查看 6 人池
4. 入队（enqueue）：
   - 使用前端流程进入等待页，或手动调用：
     ```bash
     curl -s -X POST http://localhost:3000/matching/enqueue \
       -H "Authorization: Bearer <TOKEN>" \
       -H "Content-Type: application/json" \
       -d "{\"userId\":\"<USER_ID>\"}"
     ```
5. 跑批（batch-match）：
   - 手动触发一次（推荐验收时使用）：
     ```bash
     docker compose exec worker node apps/worker/dist/main.js --batch-match
     ```
   - 或等待 cron 按 `MATCH_CRON` 自动触发
6. 结果：访问 `/final-match` 查看结果
7. 聊天：进入 `/chat` 并发送消息

详细验收与 bug 记录请看：
- `docs/P0/P0-acceptance-checklist.md`
- `docs/P0/P0-bugfix-list.md`

## 常见问题（P0 部署/验收）

1. worker 执行 batch-match 报 Prisma Client 未初始化  
   - 现象：`@prisma/client did not initialize yet...`
   - 处理：重建 worker 镜像，确保构建阶段执行了 `@peima/database` 的 Prisma generate。
   - 命令：
     ```bash
     docker compose up -d --build --force-recreate worker
     ```

2. web 端口异常（4173 / 5173 不一致）  
   - 现象：日志端口与映射不一致，宿主访问不稳定。
   - 处理：当前已统一为 5173；若仍异常，重建 web 并确认 `docker compose ps` 显示 `0.0.0.0:5173->5173/tcp`。
   - 命令：
     ```bash
     docker compose up -d --build --force-recreate web
     ```

3. preview-pool 生成失败：候选不足  
   - 现象：`POST /preview-pool/generate` 返回 `not enough candidates`。
   - 原因：可用候选用户不足 6 个，或候选用户缺少 `images`。
   - 处理：补齐候选用户与图片数据后再重试。

## 当前限制 / 后续方向

- 当前为 P0 最小实现，目标是流程可跑通，不是生产级高可用架构。
- 暂未覆盖复杂权限/RBAC、实时 WebSocket 聊天、生产级可观测性与弹性治理。
- P1 建议方向：explanation 层、AI simulation、更强匹配解释与策略升级。
- 建议 P1 优先起步项：先做 explanation 层，再逐步叠加 simulation 与策略增强。

## 文档索引

- `docs/P0/P0-project-handoff.md`：P0 完整交接文档（模块状态、主链路、建议）
- `docs/P0/P0-acceptance-checklist.md`：P0 验收清单与当前验收结论
- `docs/P0/P0-bugfix-list.md`：P0 问题与修复记录
- `docs/P0/P0-status-summary-short.md`：可快速转发的短摘要

## License

Private / TBD


