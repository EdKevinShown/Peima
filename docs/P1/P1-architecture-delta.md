# 配吗（peima）P1 相对 P0 的结构增量说明

本文档从 **架构与模块** 角度概括：P1 在 P0 之上 **增加了什么**，以及 **哪些核心边界未改变**。不涉及未来详细设计。

---

## 1. 数据层（Prisma / PostgreSQL）

| 增量 | 实体（Prisma） | 说明 |
|------|----------------|------|
| 可选 JSON 列 | `MatchResult.matchInsights` | 存 **规则/占位** 生成的结构化洞察；旧行可为空 |
| 可选 JSON 列 | `PreviewPoolItem.itemMeta` | 存 **规则/占位** 槽位元数据；旧行可为空 |

**未变**：User、队列、批次、会话、消息等 P0 核心实体关系；P1 **未**为聊天摘要等新增独立表（P1-3 为 **现算不落库**）。

---

## 2. 应用层（apps/api）

| 增量 | 模块 | 说明 |
|------|------|------|
| 读路径透传 | `matching` | `GET /matching/result/:userId` 返回体 **增加** 可选字段 `matchInsights`；**未改造** 为 DTO 裁剪 |
| 新只读路由 | `chat` | `GET /chat/conversations/:conversationId/summary`；**未**并入 `GET .../conversations/:conversationId` |
| 写路径扩展 | `preview-pool` | `generate` 创建 item 时写入 `itemMeta`；**未改** 六槽策略与候选选取算法描述层面的语义 |

**未变**：auth、questionnaire、matching 入队、chat `POST /messages` 等 **主路径** 的请求与响应契约。

---

## 3. Worker（apps/worker）

| 增量 | 位置 | 说明 |
|------|------|------|
| 批处理写库 | `batch-match.processor` | 创建 `MatchResult` 时写入 `matchInsights`（占位模块 `match-insights-placeholder`） |
| 查询模式 | 同上 | 对每个 queue 的候选 **批量** `findMany` + 内存 Map，替代逐条 `findUnique`/`findFirst`（**语义等价**） |
| 可观察性 | 同上 + 可选 scheduler | **结构化日志** 字段（batchId、queueId、viewerUserId、event、reasonCode 等） |
| 文案依赖 | `match-insights-placeholder` | 引用 `@peima/shared/constants` 中 **占位文案常量** |

**未变**：`matching-score.ts` 中 **权重与公式**；batch 输入（waiting 队列 + 活跃预览池）与输出（队列状态、`MatchResult`、batch 汇总）**业务含义**。

---

## 4. 前端（apps/web）

| 增量 | 页面/API 客户端 | 说明 |
|------|------------------|------|
| 类型与展示 | `FinalMatchPage`、`matching.ts` | 条件展示 `matchInsights`，校验失败则 **等价 P0** |
| 类型与展示 | `ChatPage`、`chat.ts` | 进入页请求 summary，失败 **隐藏区块** |
| 类型与展示 | `PreviewPoolPage`、`previewPool.ts` | 条件展示 `itemMeta` |

**未变**：路由路径、P0 页面主布局与发消息流程；**未**做全站设计系统替换。

---

## 5. packages/shared

| 增量 | 说明 |
|------|------|
| `types` | 如 `MatchInsights`、`PreviewPoolItemMeta` 等与 JSON 契约对齐的类型（具体以仓库为准） |
| `constants` | P1-6：`p1-placeholders.ts` 及 **tsc 编译产物** `dist/constants/*.js`，供 Nest 与 worker **运行时** `require` |

**未变**：shared **不是** AI SDK；**不承担** 推理、Agent、外部 HTTP 调用。

---

## 6. 契约与边界小结（相对 P0）

- **新增**：两列 JSON、一条 chat **只读** GET、三处前端 **条件 UI**、worker **批量查询 + 日志**、shared **运行时常量编译**。
- **不变**：P0 主链路顺序、匹配打分公式、发消息语义、预览池 **六人槽位与 displayMode 体系** 的业务定义、无 Redis/新队列。

---

*本文档仅描述 **P1 已完成** 的增量；不对 P2 做展开。*
