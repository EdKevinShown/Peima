# Peima / 配吗

面向关系匹配的 MVP：**P0 主链路已稳定**；**P1 已完成「结构化占位版」能力建设**（匹配洞察、聊天只读摘要、预览池条目元数据、worker 工程与文案收口）。洞察、摘要与预览元数据等正文均由 **规则 / 模板 / 占位逻辑** 生成。**真实 AI Agent、多 Agent 编排与真实 simulation 流水线尚未在本仓库正式接入。**

---

## 当前项目状态（截至 P1-6）

| 维度 | 说明 |
|------|------|
| **核心口径** | P0 主链路已稳定；P1 已完成结构化占位版能力建设；真实 AI agent 尚未正式接入。 |
| **P0** | 端到端主流程可跑通并保持稳定（见下文「P0 主链路」）。 |
| **P1（已完成）** | P1-1～P1-6 均已落地，均为 **规则/占位** 层，不替代真实模型推理。 |

**P1 已交付能力（摘要）**

- **P1-1**：`MatchResult.matchInsights`（JSON）落库；worker batch-match 写入占位结构；`GET /matching/result/:userId` 向下兼容返回。
- **P1-2**：`FinalMatchPage` 展示洞察卡片；无合法 `matchInsights` 时回退为 P0 展示。
- **P1-3**：`GET /chat/conversations/:conversationId/summary` 只读占位摘要（不落库）；`ChatPage` 轻展示，失败则隐藏，**不**影响发消息与 `POST /chat/messages`。
- **P1-4**：`PreviewPoolItem.itemMeta`（JSON）落库；generate 写入占位；`PreviewPoolPage` 轻展示，无效则隐藏。
- **P1-5**：worker batch-match 候选侧批量加载；结构化日志（`[batch-match]` 等）。
- **P1-6**：占位文案与免责声明收敛至 `packages/shared/constants`（需先 build shared）。

**当前仍未纳入（勿与 P1 混淆）**

- 真实大模型调用链、AI Agent、多 Agent 编排、端到端真实 simulation 产品化流水线。

---

## 技术栈

- Web：React + Vite
- API：NestJS
- Worker：Node.js + TypeScript + node-cron
- Database：Prisma + PostgreSQL
- Auth：JWT（Nest + passport-jwt）
- Shared：跨包类型与 **运行时常量**（P1-6 起 constants 有编译产物，供 API/worker 引用）
- Deployment：Docker Compose

## 环境要求

- Node.js >= 20
- pnpm >= 9
- Docker / Docker Compose（用于最小部署与验收）

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
|------|------|
| `apps/web` | 用户端：登录、问卷、预览池、匹配状态/结果、聊天 |
| `apps/admin` | 管理端占位（当前不强依赖） |
| `apps/api` | NestJS：auth/users/preferences/images/preview-pool/questionnaire/matching/chat |
| `apps/worker` | 批处理：cron、batch-match、队列消费 |
| `packages/database` | Prisma schema、迁移、PrismaClient |
| `packages/shared` | 共享类型；**P1 起**含 `constants`（如 `P1_DISCLAIMER` 等）及 `dist/constants` 构建产物 |
| `packages/config` | 共享配置占位 |
| `packages/ai-prompts` | AI 提示词资产占位（未接真实推理链） |
| `packages/scoring` | 评分逻辑占位 |
| `packages/sdk` | SDK 占位 |
| `infrastructure` | Docker/Nginx/脚本等物料 |
| `docs/P0` | P0 交接、验收清单、bugfix、状态摘要 |
| `docs/P1` | **P1 状态、范围、架构增量、验证摘要**（见下文文档索引） |

## 当前已跑通的 P0 主链路

1. `/login` 登录（注册/登录，保存 `peimaToken` 与 `peimaUserId`）
2. `/questionnaire` 提交问卷（生成/更新用户画像）
3. 准备候选用户和图片数据（候选用户需有 images）
4. `/preview-pool` 生成并展示 6 人预览池
5. `/matching-waiting` 查看匹配状态
6. worker 执行 `batch-match`（手动一次或 cron 触发）
7. `/final-match` 查看最终匹配结果（**P1**：有 `matchInsights` 时展示洞察卡片）
8. `/chat` 进入聊天并发送消息（**P1**：进入页可请求只读 summary）

## 关键页面

- `/login`：注册/登录，token 与 userId 持久化
- `/questionnaire`：固定题库并提交（12 题）
- `/preview-pool`：最新 6 人池（full / blurred / locked）；**P1**：条目可展示 `itemMeta` 占位文案
- `/matching-waiting`：匹配状态（waiting / processing / ready）
- `/final-match`：最终结果与评分摘要；**P1**：洞察卡片（条件展示）
- `/chat`：会话与消息、发送消息；**P1**：会话摘要区（条件展示）

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
  - `GET /matching/result/:userId`（**P1**：响应含可选 `matchInsights`）
  - `POST /chat/conversations`
  - `GET /chat/conversations/:conversationId`
  - `POST /chat/messages`
  - `GET /chat/conversations/:conversationId/summary`（**P1**：只读占位摘要，不落库）

> 受保护接口会校验 token 用户与请求中的 `userId` / `senderUserId` 等一致性。  
> 前端：`peimaToken` / `peimaUserId` 存于 `localStorage`，请求携带 `Authorization: Bearer <token>`。

### 页面与接口对应关系

- `/login`：`POST /auth/register`、`POST /auth/login`、`GET /auth/me`
- `/questionnaire`：`GET /questionnaire/questions`、`POST /questionnaire/submit`
- `/preview-pool`：`POST /preview-pool/generate`、`GET /preview-pool/user/:userId/latest`
- `/matching-waiting`：`GET /matching/status/:userId`
- `/final-match`：`GET /matching/result/:userId`、`POST /chat/conversations`（进聊天）
- `/chat`：`GET /chat/conversations/:conversationId`、`POST /chat/messages`；**P1**：`GET /chat/conversations/:conversationId/summary`

## 本地开发启动方式

```bash
pnpm install
```

按需启动：

```bash
pnpm dev:web      # 用户端 Web
pnpm dev:api      # NestJS API
pnpm dev:worker   # Worker（dev）
pnpm dev:admin    # Admin（占位）
```

构建 API / Worker 前需生成 Prisma Client；**P1-6 起** API / Worker 的构建链会先构建 `@peima/shared`（constants），详见各包 `package.json` 的 `prebuild` / `build`。

## 最小 Docker 部署

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

worker 正常日志应包含：`worker started`、`daily-match.scheduler cron registered: MATCH_CRON=...`；跑批时可见 **`[batch-match]`** 结构化日志（P1-5）及调度器日志。

Web：`http://localhost:5173`

### 快速健康检查

1. `docker compose ps`：`postgres / api / web / worker` 均为 `Up`。
2. 打开 `http://localhost:5173`，可进 `/login`。
3. `curl -i http://localhost:3000/auth/me` 预期 `401`（鉴权在工作）。
4. `docker compose logs --tail=50 worker`：见 `worker started`、cron 注册；手动跑批后见 **`[batch-match]`** `batch_complete` 等。

## P0 验收方式（简明）

前置：`preview-pool` 需要至少 **6 个带 images 的候选用户**（不含当前 viewer）。

顺序：登录 → 问卷 → 生成预览池 → `matching/enqueue` → worker `batch-match` → `/final-match` → `/chat`。

手动入队示例：

```bash
curl -s -X POST http://localhost:3000/matching/enqueue \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"<USER_ID>\"}"
```

手动跑批（Docker 内）：

```bash
docker compose exec worker node apps/worker/dist/main.js --batch-match
```

**P1 抽检（可选）**：结果接口含 `matchInsights`；预览池条目含 `itemMeta`；`GET .../summary` 返回占位摘要（均需有效 JWT 与数据前置）。

详细清单与 bug 记录：

- `docs/P0/P0-acceptance-checklist.md`
- `docs/P0/P0-bugfix-list.md`

## 常见问题（部署/验收）

1. **worker batch-match：Prisma Client 未初始化**  
   - 重建 worker，确保构建含 `@peima/database` generate。  
   - `docker compose up -d --build --force-recreate worker`

2. **Web 端口 5173**  
   - 确认映射为 `0.0.0.0:5173->5173/tcp`；异常时 `docker compose up -d --build --force-recreate web`

3. **preview-pool：`not enough candidates`**  
   - 候选不足 6 或缺少 `images`，补齐后再试。

## 当前限制 / 后续方向

- 当前为 **流程可跑通 + P1 占位增强** 的研发形态，非生产级高可用/安全/可观测全套。
- **未正式接入**：真实 AI Agent、多 Agent、WebSocket 实时聊天、完整生产治理。
- **后续（高层）**：在保持现有 JSON 字段与路由前提下，按需将占位生成替换为模型或策略服务，并定义来源/版本与降级；chat 摘要若需持久化可单独立项。

## 文档索引

**P0**

- `docs/P0/P0-project-handoff.md`：交接（模块、主链路）
- `docs/P0/P0-acceptance-checklist.md`：验收清单
- `docs/P0/P0-bugfix-list.md`：问题与修复
- `docs/P0/P0-status-summary-short.md`：短摘要

**P1**

- `docs/P1/P1-status-summary.md`：P1 阶段结论与总体状态
- `docs/P1/P1-feature-scope.md`：P1 做了什么 / 没做什么
- `docs/P1/P1-architecture-delta.md`：相对 P0 的结构增量
- `docs/P1/P1-validation-summary.md`：P1-1～P1-6 验证摘要

## License

Private / TBD
