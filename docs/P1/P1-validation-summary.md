# 配吗（peima）P1 验证摘要（P1-1～P1-6）

本文档概括各 P1 竖切的 **验证方式与通过标准**，便于交接与回归。以 **手工验证、接口验证、构建验证** 为主；**未声称** 存在覆盖 P1 全量的自动化测试套件（若仓库后续补充 CI，以 CI 为准）。

---

## 通用前提

- 本地或 Docker Compose 已启动 **PostgreSQL、api、web、worker**（按项目 README）。
- 具备有效 **JWT** 与测试用户；P1-1 / P1-4 / P1-5 等依赖 **问卷 / 预览池 / 入队** 时，按 P0 流程准备数据。

---

## P1-1：matchInsights 落库与结果接口

**验证方式**

- **数据库**：`match_results` 行存在非空 `matchInsights`（列名以 Prisma 映射为准）。
- **Worker**：执行 batch-match 后，新产生的匹配结果含结构化 JSON。
- **接口**：`GET /matching/result/:userId`（Bearer JWT，userId 与 token 一致）响应中含 `matchInsights`，且含约定 key（`explanation`、`riskFlags`、`openingTopics`、`chatSimulationSummary` 等）；**历史行** 可为空，接口不报错。
- **兼容**：响应中 **保留** `finalScore`、`reasonSummary`、`status` 等 P0 字段。

**说明**：内容为 **占位/规则** 生成，**非**真实 AI 推理结果。

---

## P1-2：FinalMatchPage 洞察与回退

**验证方式**

- **构建**：`pnpm --filter @peima/web build` 通过。
- **有 `matchInsights`**：进入 `/final-match`，展示洞察卡片区块。
- **无或非法 `matchInsights`**：洞察区 **不出现**；`dl` 与「进入聊天」等 P0 区块 **仍可用**。

---

## P1-3：Chat summary 与 ChatPage

**验证方式**

- **接口**：`GET /chat/conversations/:conversationId/summary` 返回 `summary`、`chatStageHint`、`generatedAt`；非参与者或未授权与现有会话读取一致。
- **页面**：进入 `ChatPage` 时若 summary 成功则显示摘要区；**失败则隐藏**，消息列表与发送 **不受阻**。
- **契约**：`POST /chat/messages` 与 `GET /chat/conversations/:conversationId` **未合并** summary，响应体 **无** 单方面破坏性变更。

**说明**：摘要正文为 **规则/占位**，**非**大模型生成；**不落库**。

---

## P1-4：itemMeta 与 PreviewPoolPage

**验证方式**

- **迁移**：已应用 `PreviewPoolItem.itemMeta` 对应 migration（由 `prisma migrate` 生成）。
- **生成**：`POST /preview-pool/generate` 后，`GET /preview-pool/user/:userId/latest` 中 `items[].itemMeta` 非空且形状符合约定。
- **页面**：`PreviewPoolPage` 展示 `slotReason` / `shortHint` / `tags`；**无合法 `itemMeta`** 时不展示元数据区，**P0 列表行为保留**。
- **构建**：`api` / `web` build 通过。

---

## P1-5：Worker 批处理优化与日志

**验证方式**

- **构建**：`pnpm --filter @peima/worker build` 通过。
- **行为**：与优化前相同数据下，队列终态、`MatchResult` 选中对象与分数 **一致**（抽样对比或同环境回归）。
- **日志**：日志含 `[batch-match]` 前缀及 `batchId`、`queueId`、`viewerUserId`、`event`、`reasonCode`（如 `NO_ACTIVE_POOL`、`NO_SCORED_CANDIDATES` 等）等字段；**失败原因仅日志**，**未**新增 DB 状态枚举。

---

## P1-6：文案统一与 shared 构建

**验证方式**

- **构建**：`pnpm --filter @peima/shared build` 生成 `dist/constants`；`pnpm --filter @peima/api build`、`pnpm --filter @peima/worker build` 通过（含 prebuild 中 shared 步骤，以 `package.json` 为准）。
- **结果抽检**：新生成的 `matchInsights`、`itemMeta` 文案、chat summary **共享** 统一免责声明与「规则占位」标记（具体字串以 `packages/shared/constants/p1-placeholders.ts` 为准）。
- **契约**：**未改** JSON 字段名与 HTTP 路径。

---

## 说明

- 本摘要 **不替代** 项目根目录 README 中的环境与 Compose 说明。
- 任何 **真实 AI** 接入后的验证项 **不在** P1 范围内，需在后续阶段单独编写。
