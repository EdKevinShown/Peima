# 配吗（peima）P1 功能范围说明

本文档说明 **P1 阶段实际交付了什么**、**明确未做什么**，以及与 P0 的边界。便于 README 引用与项目交接。

---

## 1. P1 阶段目标

在 **不破坏 P0 主链路** 的前提下，完成 **「结构化占位版」能力建设**：

- 为匹配结果、预览池条目、聊天场景提供 **结构化字段或独立只读接口**，正文由 **规则 / 模板 / 占位逻辑** 生成。
- 前端在 **字段合法时展示增强信息**，在 **字段缺失或非法时回退** 到 P0 体验。
- Worker 在 **不改变批处理对外契约** 的前提下，提升 **批内查询效率** 与 **日志可观察性**。
- 将多处置顶文案 **统一收口** 到 `packages/shared`，便于后续替换为真实文案或模型输出时单点维护。

**非目标**：在 P1 内 **正式接入真实 AI Agent**、完成 **多 Agent 编排**、或交付 **端到端真实 simulation 流水线**（若与产品路线图一致，属后续阶段）。

---

## 2. P1 已交付能力范围

| 能力 | 说明 |
|------|------|
| **匹配洞察结构** | `MatchResult.matchInsights`（JSON，可选）；worker 写入 **占位** 内容；结果接口 **兼容** 返回 |
| **最终匹配页洞察 UI** | `FinalMatchPage` 展示洞察卡片；无合法 `matchInsights` 时 **不展示** 洞察区 |
| **聊天摘要只读接口** | `GET /chat/conversations/:conversationId/summary`；**不落库**；占位 `summary` / `chatStageHint` / `generatedAt` |
| **聊天页摘要展示** | `ChatPage` 进入页请求摘要；失败 **隐藏** 区块；**不影响** 消息加载与发送 |
| **预览池条目元数据** | `PreviewPoolItem.itemMeta`（JSON，可选）；generate 时写入 **占位**；列表页轻展示 |
| **Worker 工程优化** | 候选上下文批量查询；结构化日志（含失败原因码，**仅日志**） |
| **文案统一** | `P1_DISCLAIMER`、`P1_MARK`、`P1_HINT_PREFIX` 等 **运行时常量**（shared 编译产出）供 worker 与 API 引用 |

---

## 3. P1 明确未纳入范围

- **真实 AI Agent** 调用链、提示词工程、流式输出、工具调用等 **未在 P1 正式接入**。
- **多 Agent 编排**、复杂 simulation / explanation **独立微服务** **未建设**。
- **Redis / 新消息队列**、异步任务平台 **未引入**（仍依赖现有 worker + DB）。
- **大规模前端重构**、设计系统换代 **未做**。
- **匹配核心算法升级**（如替换 `computeFinalScoreV1`）**未做**。

---

## 4. 当前仍为规则 / placeholder 的部分

以下能力在 P1 中 **仅具备「结构化 + 占位内容」**，**不**代表真实 AI 结论：

- **`matchInsights` 全文**（含 `explanation`、`riskFlags`、`openingTopics`、`chatSimulationSummary` 等）— 由 worker 内 **规则** 生成。
- **`itemMeta`**（`slotReason`、`shortHint`、`tags`）— 由 preview-pool **按槽位模板** 生成。
- **Chat summary** — 由 chat service **按消息条数、收发方统计** 等 **规则** 拼接。

后续若接入模型，应在产品与技术方案中 **单独定义** 数据来源、版本与降级策略。

---

## 5. 对 P0 主链路保持不变的边界

- **主流程顺序**：注册登录 → 问卷 → 预览池 → 入队 → 批次匹配 → 结果 → 聊天 **未因 P1 而改变**。
- **API**：未改变 **matching 入队与状态**、**preview-pool 路由与鉴权**、**chat 发消息** 的契约；summary **独立路由**，**不**合并进会话详情响应。
- **数据语义**：`MatchResult` 核心字段含义、队列状态、`BatchMatch` 统计含义 **与 P0 一致扩展**；P1-5 **未改** 打分公式与选优逻辑。
- **数据库**：除 `matchInsights`、`itemMeta` 等与 P1 直接相关的列外，**未为 P1 增加额外表或无关大改**。

---

*文档版本：与仓库 **P1-6 完成** 状态对齐。*
