# P2 范围说明（草稿）

> **执行状态（P2-MVP）**：最小闭环已在代码中落地。下文仍保留阶段边界与设计原则；**状态汇总**见 [P2-status-summary.md](./P2-status-summary.md)，**验证项**见 [P2-validation-summary.md](./P2-validation-summary.md)。

本文档描述 Peima / 配吗 monorepo 在 **P1 之后的 P2 阶段** 的工程边界、对象草案与实施顺序。P2 仍以 **规则 / 模板 / 占位 / 混合型** 产出为主；**不将真实大模型生产接入作为前置条件**。

---

## 1. P2 目标

在 **不破坏 P0 主链路**、**不移除 P1 占位能力** 的前提下，引入以下工程能力的主体设计与会话外持久化/结构化基础：

| 方向 | 说明 |
|------|------|
| **聊天摘要持久化** | 将会话摘要从「仅每次请求的占位计算」扩展为 **可落库、可版本化** 的快照；首版生成逻辑仍为 rule_based / template_based / placeholder。 |
| **Copilot 基础建议** | 提供 **只读建议层**（如阶段性要点、低风险话术提示），**不是**代用户发言、不是端到端自动聊天。 |
| **用户反馈结构化** | 对匹配、会话、建议等对象的可选 **结构化反馈**（如维度 + 评级/标签），供后续分析与质量闭环。 |
| **画像更新建议** | 系统 **不得** 静默直接修改 `UserProfile`；变更仅通过 **suggestion + 用户 accept / dismiss** 落地。 |
| **Behavior signals 回流** | 客户端或服务端可追加 **行为信号**（append-only 语义），为后续分析与 Worker 消费预留字段，首版可不接复杂管道。 |
| **Analytics 基础统计** | 只读层级的 **计数/漏斗/简单聚合** API 或查询约定，**不**承诺实时 BI 或多租户报表平台。 |

---

## 2. P2 范围

- **契约与共享类型**：前后端共用的字段、枚举、`source_type` / `source_version` 约定 **收敛到 `packages/shared`**（P2-MVP 已有一批类型与常量）。
- **数据模型（MVP 已落地）**：`conversation_summaries`、`user_feedbacks`、`profile_update_suggestions`、`behavior_signals` 等表与 migration 已随 P2-MVP 合入；**未** 单独建 `copilot_insights` 等扩展表。
- **API（MVP 已落地）**：在现有 Nest 模块旁 **增量** 模块（feedback、profile-suggestion、behavior-signal、analytics、copilot）及 chat summary 扩展；鉴权与 chat 风格对齐。
- **Worker（可选）**：仅在需要异步聚合、批量回填或与批匹配日志对齐时扩展；**不** 替代 P0 批处理对外契约（MVP 未强制接 Worker 自动生成）。

---

## 3. P2 暂不做什么

- **正式接入真实 AI Agent**、工具调用、流式输出、多 Agent 编排。
- **真实 simulation 流水线** 作为硬依赖；P2 文案与结构仍可为占位或 hybrid。
- **强制改写** 用户问卷画像或通过后台任务 **静默** `upsert` `UserProfile`（问卷用户主动提交路径与建议 accept 路径需在文档与实现中 **分支明确**）。
- **大规模前端重构**、设计系统替换。
- **替换** P0 核心匹配算法或批处理结果契约。

---

## 4. 与 P1 的边界

| P1 现状（保持） | P2 增量（不替代） |
|----------------|------------------|
| `MatchResult.matchInsights`、`PreviewPoolItem.itemMeta` 等 **JSON 占位** | 可为新对象 **补齐** `source_type` / `source_version` 列或 JSON 内字段；旧数据 **缺省字段时合法**。 |
| `GET .../chat/.../summary` **不落库**、规则生成 | **增加** 持久化路径后，宜约定 **读库优先或并存策略**，避免无故删除 P1 行为。 |
| `packages/shared` 中 P1 类型与 `P1_*` 常量 | **新增** P2 类型与常量文件；**不删除、不重命名** P1 导出。 |
| Worker 批匹配 + 结构化日志 | 行为信号可与日志 **并行** 演进，**不** 要求立即统一为一种介质。 |

---

## 5. 数据对象草案

以下为 **逻辑对象** 草案，用于对齐 shared 契约与后续 schema；**非** 最终表名或列名承诺。

| 对象 | 用途 | 关键字段（草案） |
|------|------|------------------|
| **ConversationSummary**（或等价命名） | 会话摘要快照 | `conversationId`、`summary`、`chatStageHint`（若有）、`generatedAt`、`sourceType`、`sourceVersion`、`payload`（可选扩展 JSON） |
| **UserFeedback** | 结构化反馈 | `userId`、关联类型（如 match / conversation / suggestion）、`subjectId`、`kind`/`tags`、可选 `rating`、`sourceType`、`sourceVersion` |
| **ProfileUpdateSuggestion** | 画像更新建议 | `userId`、`status`（pending / accepted / dismissed）、**建议载荷**（diff 或问卷补丁形状）、`sourceType`、`sourceVersion`、时间戳 |
| **BehaviorSignal** | 行为信号 | `userId`、可选 `sessionId`/`conversationId`、`eventType`、`occurredAt`、可选 `properties` JSON、`sourceType`、`sourceVersion` |
| **AnalyticsEvent**（或视图查询） | 分析用事件或聚合输入 | 可与 BehaviorSignal **合并或拆分**，由实施阶段按体量决定；首版倾向 **窄表 append-only** |

**Copilot 建议**：可与 **独立建议条目表** 或复用「带 `kind=copilot_suggestion` 的通用建议结构」实现；首版 **基础建议层** 不要求独立微服务。

---

## 6. `source_type` / `source_version` 设计原则

- **`source_type`**：标明产出机制（例如 `rule_based`、`template_based`、`placeholder`、`hybrid`）；**常量** 在 `packages/shared` 中维护，避免魔法拼写。
- **`source_version`**： semver 或 **不透明字符串**（如 `v1`、`2026-04-placeholder`），用于 **同一 type 下规则迭代** 的可追溯性；**不要求** 全局统一语义版本。
- **旧数据**：缺省时解析为「未知」或沿用 P1 行为；**不得** 因缺字段导致主链路崩溃。
- **与 LLM 的关系**：若未来接入生产模型，新增 `source_type` 取值即可；P2 首版 **不依赖** 该路径。

---

## 7. 画像更新建议机制原则

- **唯一经系统写入 `UserProfile` 的自动路径**（除用户 **主动** 问卷提交等已有产品路径外）：**用户显式 accept** 与 suggestion 绑定的应用事务。
- **dismiss**：仅更新 suggestion 状态，**不** 修改画像。
- **pending**：可对用户展示；**不可** 将 pending 内容当作已生效画像参与匹配 **除非** 产品另行定义（默认 **不参与**）。
- **审计**：建议 **保留** `acceptedAt` / `dismissedAt` 或等价字段，便于排查与 analytics。

---

## 8. 最小实施顺序

与仓库约束一致：**先结构（文档 + shared），后 schema，后 API，后 UI**。

1. **契约**：`packages/shared` P2 类型与常量定稿（本步）。
2. **Schema**：Prisma 模型与 migration（单表起步，例如 ConversationSummary）。
3. **API**：最小只读/写入路由；chat summary 的 **GET 兼容** 策略写清。
4. **Suggestion / Feedback / Signal**：按需增量表与 API。
5. **Analytics**：只读聚合或窄事件表。
6. **Web**：按 API 稳定度接 UI。

---

## 9. 最小验收口径

本阶段（仅文档 + shared）验收：

- [ ] `docs/P2/P2-scope-notes.md` 存在且九个小节齐全，与 README / P1 文档 **无矛盾**（P1 仍占位、无真实 AI 承诺）。
- [ ] `packages/shared` 导出 P2 类型与常量，**构建** `pnpm exec tsc -p tsconfig.constants.json`（或仓库等价命令）通过，**现有 P1 导出** 不受影响。
- [ ] P2 契约中 **全部** 含 `source_type` / `source_version`（或引用共享 `SourceMetadata` 形状），suggestion 状态含 **pending / accepted / dismissed**。

后续阶段验收（占位，供 roadmap 引用）：

- Summary：持久化读写与 **与 P1 GET 行为并存** 的约定通过集成测试或手工清单验证。
- Suggestion：无 accept 则画像不变；accept 后画像与建议状态一致。
- Feedback / Signal：写入可追溯，`source_*` 可过滤。
- Copilot：返回建议 **不** 自动发消息。

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-04-04 | 初稿：P2 范围与 shared 契约对齐用。 |
