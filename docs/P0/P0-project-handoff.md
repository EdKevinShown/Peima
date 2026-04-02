# 配吗（peima）P0 交接文档

一句话说明：AI 驱动的关系匹配 MVP（预览池、问卷画像、批次匹配、单对象聊天闭环）。

---

## 1) 当前项目结论

P0 主流程已跑通，因此 **P0 可视为完成**。

已完成到什么程度：
- 用户完成注册/登录（JWT）
- 提交问卷并落库画像
- 生成预览池并在前端展示 6 个 item（full / blurred / locked）
- 入队匹配并通过 worker 跑 batch-match（支持 cron 自动触发）
- 前端展示最终匹配结果（final-match）
- 进入单对象聊天（chat），可创建 conversation 并发送消息

不影响 P0 完成判断、但仍属于工程化/优化项（建议不进入 P1）：
- 更复杂的匹配策略与更丰富的 explanation（目前为 P0 可跑通版）
- 更完善的错误提示/边界用例覆盖（例如多端并发、失败重试、数据脏写）
- 进一步的监控告警/链路追踪增强

---

## 2) 当前已跑通的主链路（顺序）

1. 注册 / 登录（手机号直登占位版，JWT 签发）
2. 问卷提交（`POST /questionnaire/submit`）
3. 图片数据与候选用户准备（确保候选用户存在 `images`）
4. `preview-pool generate`（`POST /preview-pool/generate`）
5. `preview-pool` 页面展示 6 个 item（按 `rankInPool` 升序、三层展示分层）
6. 匹配入队（`POST /matching/enqueue`）
7. worker 跑批次匹配（启动时注册 cron；手动或定时触发 `batch-match`）
8. final-match 页面展示最终结果（`GET /matching/result/:userId`）
9. chat 页面进入与发送消息
   - 创建会话：`POST /chat/conversations`
   - 拉取对话：`GET /chat/conversations/:conversationId`
   - 发送消息：`POST /chat/messages`

---

## 3) 当前项目结构（monorepo）

顶层：
- `apps/`
  - `apps/api`：NestJS 后端（模块化：auth/users/preferences/images/preview-pool/questionnaire/matching/chat）
  - `apps/web`：React + Vite 前端（登录、预览池、问卷、匹配状态/结果、聊天）
  - `apps/worker`：Node worker（定时/批次任务：batch-match，基于 Prisma 操作 DB）
  - `apps/admin`：预留（当前 P0 不强依赖）
- `packages/`
  - `packages/database`：Prisma schema、migrate、PrismaClient 导出
  - `packages/shared`：跨包类型/常量（当前主要用于项目骨架）
  - 其它占位包：`ai-prompts/ scoring/ sdk` 等
- `docs/`
  - `docs/P0`：P0 验收清单、bugfix 列表、交接文档
  - 未来：P1/P2/P3 的规划文档

---

## 4) 当前核心模块与状态

### auth
- 作用：最小身份边界（注册/登录/JWT/me）
- 当前状态：**已跑通 / P0 占位版**
- 关键接口：`POST /auth/register`、`POST /auth/login`、`GET /auth/me`（JWT）

### users
- 作用：用户基础资料（phone 作为自然键）
- 当前状态：**已完成（基础 CRUD）**
- 关键接口（路由形式）：`POST /users`、`GET /users/:id`、`PATCH /users/:id`

### preferences
- 作用：用户匹配偏好（用于评分/过滤的输入数据）
- 当前状态：**已完成（基础 upsert / 查询）**
- 关键接口：`PUT /preferences/:userId`、`GET /preferences/:userId`

### images
- 作用：用户照片记录与分析结果快照（P0 不做真实上传/AI）
- 当前状态：**已跑通（上传后结果入库版）**
- 关键接口：`POST /images`、`GET /images/user/:userId`、`GET /images/:id`、`DELETE /images/:id`

### preview-pool
- 作用：为 viewer 生成固定 6 人预览池，并落库三层展示结构
- 当前状态：**简化版可跑通 / 已对接前端展示**
- 关键接口：
  - `POST /preview-pool/generate`
  - `GET /preview-pool/user/:userId/latest`
  - `DELETE /preview-pool/:id`

### questionnaire
- 作用：固定题库问卷提交，生成/更新轻量画像（P0 简化评分）
- 当前状态：**简化版可跑通**
- 关键接口：
  - `GET /questionnaire/questions`（公开）
  - `POST /questionnaire/submit`（JWT）
  - （附带画像接口）`GET /questionnaire/profile/:userId`

### matching
- 作用：队列入队与最终匹配结果查询（由 worker 批次生成）
- 当前状态：**P0 可跑通版已闭环**
- 关键接口：
  - `POST /matching/enqueue`
  - `GET /matching/status/:userId`
  - `GET /matching/result/:userId`

### chat
- 作用：一对一聊天入口（无 WebSocket，HTTP + 手动刷新）
- 当前状态：**已跑通（会话创建、消息发送、查询）**
- 关键接口：
  - `POST /chat/conversations`
  - `GET /chat/conversations/:conversationId`
  - `POST /chat/messages`
  - `GET /chat/user/:userId/latest`

### deployment
- 作用：docker-compose 最小化部署
- 当前状态：**已跑通**
- 关键说明：
  - `postgres` 提供 DB
  - `api` 提供 REST API
  - `web` 提供前端
  - `worker` 负责 batch-match/cron
  - 已修复关键部署问题：
    - worker 启动路径（原 `CMD /app/dist/main.js` 不存在问题）
    - worker 执行 batch-match 时 Prisma Client 未初始化问题
    - web 容器内外端口统一为 5173（避免 preview 默认 4173）

### worker cron
- 作用：启动即注册 cron（`MATCH_CRON`、`TZ` 可配置）
- 当前状态：**已跑通**
- 关键位置：`apps/worker/src/schedulers/daily-match.scheduler.ts`

---

## 5) 当前关键路由 / 页面（前端）

- `/login`：P0 注册/登录入口（token 写入 localStorage）
- `/questionnaire`：问卷题目与提交页面
- `/preview-pool`：展示最新预览池 6 个 item（full / blurred / locked）
- `/matching-waiting`：显示匹配状态；ready 后跳转 final-match
- `/final-match`：展示最终匹配对象与进入聊天入口（P0）
- `/chat`：显示对话列表并发送消息（HTTP 方式）

---

## 6) 当前关键 API（后端）

鉴权约定：
- `/auth/*`：公开
- 其它 P0 核心接口：JWT 保护（`Authorization: Bearer <token>`）

列出核心 API：
- `POST /auth/register`（公开）
- `POST /auth/login`（公开）
- `GET /auth/me`（JWT）
- `GET /questionnaire/questions`（公开）
- `POST /questionnaire/submit`（JWT）
- `POST /preview-pool/generate`（JWT）
- `GET /preview-pool/user/:userId/latest`（JWT）
- `POST /matching/enqueue`（JWT）
- `GET /matching/status/:userId`（JWT）
- `GET /matching/result/:userId`（JWT）
- `POST /chat/conversations`（JWT）
- `GET /chat/conversations/:conversationId`（JWT）
- `POST /chat/messages`（JWT）

---

## 7) P0 最终判断

- **结论：P0 已完成。**
- 当前更适合做：文档收口、轻量回归、边界与失败用例验证。
- 不建议进入 P1 开发。
- P1 推荐起点（非本次实现）：explanation/更精细匹配策略与更完善的系统级监控告警。

---

## 8) 可复制到新窗口的项目上下文 Prompt

```text
你是 peima（配吗）项目的全栈协作助手。

项目类型：monorepo，前端 React+Vite，后端 NestJS，worker Node.js，数据库 Prisma+PostgreSQL。

当前状态（P0 已完成）：用户注册/登录（JWT）-> 提交问卷画像 -> 生成 6 人 preview-pool -> enqueue matching -> worker batch-match（cron 注册）-> final-match 展示 -> chat 发送消息。

关键模块与接口：
- auth: /auth/register, /auth/login, /auth/me (JWT)
- preview-pool: /preview-pool/generate, /preview-pool/user/:userId/latest (JWT)
- questionnaire: /questionnaire/questions (public), /questionnaire/submit (JWT)
- matching: /matching/enqueue, /matching/status/:userId, /matching/result/:userId (JWT)
- chat: /chat/conversations, /chat/conversations/:conversationId, /chat/messages (JWT)

项目目录：
- apps/api：后端模块（含 auth/users/preferences/images/preview-pool/questionnaire/matching/chat）
- apps/web：前端页面（/login, /questionnaire, /preview-pool, /matching-waiting, /final-match, /chat）
- apps/worker：worker（daily-match.scheduler + batch-match.processor）
- packages/database：Prisma schema & PrismaClient

下一步建议：只做 P0 文档收口与轻量回归/边界测试，不进入 P1。
```

