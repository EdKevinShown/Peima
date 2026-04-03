# P2 状态摘要（P2-MVP）

本文档描述 **P2-MVP** 的工程结论：最小闭环主体已在仓库落地，**不等同于**完整产品化或真实大模型生产链路。

---

## 1. P2 目标（回顾）

在不动 P0 主链路、不删除 P1 占位能力的前提下，为「摘要持久化、结构化反馈、画像建议、行为信号、轻量统计、会话级基础建议」建立 **可演进的契约、数据表与 API**，产出仍以 **规则 / 模板 / 占位 / hybrid** 为主。**真实 AI Agent、多 Agent、真实 simulation 流水线未作为本阶段交付前提。**

---

## 2. P2 当前范围（MVP 界定）

| 在内 | 不在内（MVP） |
|------|----------------|
| Prisma 增量表：`conversation_summaries`、`user_feedbacks`、`profile_update_suggestions`、`behavior_signals` | `copilot_insights` 独立表、画像历史表、物化视图 |
| 上述表的 Nest 最小 CRUD/只读与鉴权风格与现有 chat 对齐 | 运营后台、多维 BI、复杂埋点平台 |
| `packages/shared` 中 P2 类型与常量（`sourceType` / `sourceVersion`、建议状态等） | 全量 OpenAPI、SDK 生成 |
| Web `ChatPage` 上对 summary / feedback / copilot / 待处理建议的 **轻量感知层** | 独立 Copilot 页、建议 accept/dismiss 全功能 UI |

---

## 3. 已完成能力（P2-MVP）

- **Chat summary**：`GET .../summary` 优先读最新持久化行，无则规则回退；`POST .../summary/generate` 写入快照；`sourceType` / `sourceVersion` 随响应。
- **Feedback**：`POST /feedback`、`GET /feedback/mine`；JWT + `userId` 与 token 一致。
- **Profile suggestion**：创建、我的列表、`accept` / `dismiss`；**仅 accept 事务内** `userProfile` upsert；`proposedPatch` 白名单维度合并。
- **Behavior signal**：`POST` 追加、`GET /mine`；repository 不提供 update/delete。
- **Analytics**：`GET /analytics/p2-overview`、`GET /analytics/p2-overview/mine`；只读 `count`。
- **Copilot**：`GET /copilot/conversations/:id/insights`；只读规则聚合（summary + 本会话反馈 + 用户信号量 + 待处理建议数），**不落库、不代发消息**。
- **Web**：`ChatPage` 条件展示摘要卡片、反馈快捷按钮、Copilot 卡片、待处理建议提示；失败降级不阻塞发消息。

---

## 4. 未完成能力（勿与 MVP 混淆）

- 真实 LLM 调用、Agent 工具链、流式输出。
- Worker 侧自动生成摘要 / 信号回流 / 定时聚合。
- Copilot / 摘要 **历史版本** 列表与产品级缓存策略。
- Analytics **权限细分**（当前全局 overview 对任意登录用户可读，仅适合研发/内测形态）。
- 前端建议 **accept/dismiss** 完整流、独立设置页。

---

## 5. 与 P1 / P3 的边界

| 阶段 | 边界 |
|------|------|
| **P1** | 结构化占位（`matchInsights`、`itemMeta`、不落库 summary 等）仍保留；P2 在旁 **增量** 表与路由，不删除 P1 行为。 |
| **P2-MVP** | 数据与 API **可到可验**；规则与契约为主，**不宣称**生产级 AI。 |
| **P3（建议）** | 接入模型或独立推理服务、权限与可观测、Worker 编排深化、Web 体验闭环；在 **不改变 P0 契约** 前提下替换/增强生成实现。 |

---

## 6. 当前结论

- **P2-MVP**：最小闭环 **已完成**，可用于联调、演示与后续迭代基线。
- **非完整产品化**：安全治理、RBAC、大盘监控、A/B、完整 Copilot 产品形态 **未** 在本阶段交付。

---

## 7. 相关文档

- `docs/P2/P2-scope-notes.md`：范围与原则（初稿，部分「后续阶段」表述以本文状态为准）。
- `docs/P2/P2-validation-summary.md`：分模块验证项与已知限制。
