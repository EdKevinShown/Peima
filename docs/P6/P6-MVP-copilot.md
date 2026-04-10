# P6-MVP：真实 AI Copilot（只读，失败可回退）

> **Status: 已落地（Copilot 切片；首轮验收见 `docs/P6/P6.3-acceptance-round1.md`）**

面向当前 Peima / 配吗 仓库真实状态：**项目整体已到 P5**；后端仍以规则 / 模板 / 占位逻辑为主，**真实 AI 生产链尚未正式接入**；前端已有聊天内 Copilot 卡片与独立 `CopilotPage`。  
**P6-MVP** 仅为完整 P6 中的 **最小切片**：真实 AI Copilot，**只读**，**失败可回退**。本文档 **不构成** `docs/P6/P6-ai-production-evolution-plan.md` 中梯队 A/B/C 的全量承诺。

---

## 1. 目标

在 **不改变 P0 聊天主链路契约** 的前提下，为 **已存在的会话级 Copilot 洞察** 增加 **可选的真实模型生成路径**：当配置允许且调用成功时，用户在同一套 UI 与同一 HTTP 契约下看到 **由模型生成的只读建议**；当未配置、超时、错误或策略关闭时，**行为与今日一致**，仍由 `copilot-rules.ts` 的规则层产出。  
整体仍满足 README / P2 口径：**不代发消息、洞察不落库**（延续当前 `CopilotService` 注释与实现方式）。

---

## 2. 做什么（最小范围）

- **唯一业务入口**：继续只服务 **`GET /copilot/conversations/:conversationId/insights`**，响应形状保持与 `CopilotInsightsResponse`（`apps/api/src/modules/copilot/dto/copilot-response.dto.ts`）及前端 `apps/web/src/api/copilot.ts` 类型一致或可向后兼容扩展。
- **后端**：在 **`apps/api/src/modules/copilot/`** 内增加 **极薄的模型调用适配**（超时、错误处理、可选 feature flag），在成功时用模型 **润色或重写** 与当前规则层相同的结构化字段（`communicationAdvice`、`riskHints`、`suggestedTopics`、`relationshipState` 等），**仍不写入消息、建议、信号表**。
- **前端**：**不新增页面**；继续仅在 **`ChatPage`**（内嵌卡片 + 错误不阻塞发消息）与 **`CopilotPage`**（`/copilot`，手动刷新）展示；`CopilotInsightCard` 继续作为展示组件，仅需能区分「模型来源 / 规则来源」（若产品要在 UI 上弱提示，属可选，不强制改文案规模）。

### 2.1 `sourceType` / `sourceVersion` 口径（MVP）

- **模型调用成功且响应被采纳为对外结果时**：`sourceType` 使用 **`model_*`** 形式标明模型来源（例如 `model_openai` / `model_anthropic` 等，具体取值在实现时与 `AI_PROVIDER` 对齐并写入共享常量或文档）。
- **任何降级路径**（开关关闭、密钥缺失、超时、错误、输出无法安全映射回 DTO 等）：对外返回 **与当前一致** 的规则层结果，`sourceType` **保留为 `rule_based`**（与现有 `P2SourceType.RuleBased` 一致）。
- **`sourceVersion`**：用于标识 **规则模板版本**（如现有 `COPILOT_RULE_VERSION`）或 **模型侧版本/快照**（如模型名 + prompt 版本号）；成功走模型与走规则时应 **分别可区分**，便于排障与审计。

**P6.2 收口（实现与运维）**：`model_<slug>` 中 `slug` 优先取 **`AI_PROVIDER`**，未设置时按 **`AI_BASE_URL` 主机名** 推断（避免 DeepSeek 等误显示为 `openai`）；无法识别时用 `openai_compatible` 表示「协议兼容、厂商未标注」。模型成功时 `sourceVersion` 采用 **`slug|model|prompt 版本`** 三节格式。详见 `docs/P6/P6.2-copilot-llm-runbook.md`。

---

## 3. 不做什么（严格排除）

- **不做** 完整 P6：`docs/P6/P6-ai-production-evolution-plan.md` 中的 Worker 队列扩展、多 Provider 生产化、simulation、多 Agent 编排、WebSocket 流式等 **均不在 P6-MVP**。
- **不做** 摘要链路 AI 化（`POST .../summary/generate`、摘要持久化策略、历史版本）—— **不在本轮改写入路径**。
- **不做** 匹配核心 AI 化、match explanation、预览池/问卷的模型重写。
- **不做** Copilot 洞察落库、异步任务、用户侧「再生成」版本树（除非后续单独立项）。
- **不做** 自动代发消息、推送、工具调用链。

---

## 4. 为什么先做 Copilot，而不是 Summary / Match Explanation

1. **端到端已打通**：前端已有 `getCopilotInsights`、聊天内卡片与独立 `CopilotPage`；后端已有 `CopilotController` → `CopilotService` → `buildCopilotInsights`，**增量最小**。
2. **只读、无持久化**：当前设计明确 **洞察不落库**；Summary 涉及 **生成与落库** 及用户对产品「事实摘要」的信任边界，变更成本高。
3. **失败隔离已存在**：`ChatPage` 已对 Copilot 加载失败单独展示并重试，**不阻塞发消息**；Match explanation 往往紧贴匹配决策，**容错与合规叙事更重**。
4. **与 P6 规划一致**：总规划将「低风险试点」指向可切换、可降级能力；Copilot 建议天然带 **「仅供参考」** 定位，适合作为 **第一条真实模型接线**。

---

## 5. 最小可交付范围（DoD 粒度）

- 在 **API 进程内**（P6-MVP 不要求独立 Worker）完成：**可配置开关 + 单次同步请求** 的模型调用；成功则返回带 **可识别 `sourceType`/`sourceVersion`** 的 insights；失败则 **记录日志并回退** 到现有 `buildCopilotInsights`。
- **密钥不出仓库**：仅通过环境变量（或等价配置）注入，**禁止** 将 key 写入代码库。
- **权限与参与者校验不变**：仍通过现有 `ChatService.getConversationWithMessages` 等与聊天一致的鉴权/404/401 行为（与当前 `CopilotService` 一致）。

### 5.1 最小数据暴露原则（MVP）

- **模型输入仅限** 生成当前 Copilot 洞察 **所必需的会话上下文与聚合字段**（与现有 `CopilotService` 聚合逻辑一致的方向：如消息概要、摘要文本、反馈评分、行为信号计数、待处理建议数量等，以实际实现为准），**不默认发送** 与本次洞察生成 **无关** 的用户或会话数据。

---

## 6. 涉及的页面、后端模块、环境变量

| 类别 | 当前仓库中的落点 |
|------|------------------|
| **前端页面** | `apps/web/src/pages/ChatPage.jsx`（Copilot 卡片与错误/重试）、`apps/web/src/pages/CopilotPage.jsx`（完整洞察与 `basedOn`）、路由中已有 `/copilot`（见 `apps/web/src/router/index.jsx`） |
| **前端 API** | `apps/web/src/api/copilot.ts` → `GET ${baseUrl}/copilot/conversations/:id/insights` |
| **展示组件** | `apps/web/src/components/copilot/CopilotInsightCard.jsx`（已展示 `sourceType` / `sourceVersion`） |
| **后端模块** | `apps/api/src/modules/copilot/`：`copilot.module.ts`、`copilot.controller.ts`、`copilot.service.ts`、`copilot.repository.ts`、`copilot-rules.ts`、`dto/copilot-response.dto.ts`；依赖现有 `ChatService` 与 Prisma 聚合（与当前实现一致） |

### 6.1 建议环境变量（MVP 建议配置，不代表最终定版）

以下为 **P6-MVP 建议键名**，便于实现与评审对齐；**正式键名、默认值与 `.env.example` 同步以编码阶段为准**，可能与仓库现有 `.env.example` 中的 `OPENAI_*` 占位并存或逐步统一。

| 建议键名 | 用途（MVP 语义） |
|----------|------------------|
| `AI_COPILOT_ENABLED` | 是否对 Copilot 洞察启用模型路径（关闭则始终规则层） |
| `AI_PROVIDER` | 供应商标识（如 `openai`），与 `sourceType` 的 `model_*` 展示可对齐 |
| `AI_MODEL` | 模型名 / deployment 名 |
| `AI_API_KEY` | 调用密钥（不入库、不进仓库） |
| `AI_BASE_URL` | 可选；兼容自建网关或代理 Base URL |
| `AI_TIMEOUT_MS` | 单次调用超时，超时触发降级 |

说明：**`apps/api` 当前未引用 OpenAI SDK**，MVP 是在 `copilot` 模块内 **首次** 引入可控的模型调用路径。仓库 `.env.example` 中已有 `OPENAI_API_KEY`、`OPENAI_BASE_URL` 占位；实施时应在运行手册中说明 **MVP 建议键与占位键的映射或迁移**，本文档不强制二选一结论。

---

## 7. 降级策略

- **默认降级**：开关关闭、密钥缺失、超时、非 2xx、解析失败、或模型输出无法安全映射回 DTO 时 → **调用现有 `buildCopilotInsights`**，保证 **HTTP 200 + 结构合法**（与当前服务在 Prisma/聚合部分失败时仍尝试返回最小 insights 的思路一致）；此时 **`sourceType` 为 `rule_based`**。
- **不放大故障面**：聊天发送、摘要、匹配等 **其他接口不依赖** Copilot 成功。
- **可观测（MVP 最低线）**：至少 **结构化日志**（conversationId、耗时、错误类型、是否降级）；**不** 把 P6 全文要求的完整成本仪表盘作为 MVP 必选项。

---

## 8. 首轮验收标准（可勾选）

1. **关开关 / 无密钥**：`GET /copilot/conversations/:id/insights` 与 **当前** 规则层行为一致（`sourceType` 为 **`rule_based`**，与现有 `sourceVersion` 规则版本一致）。
2. **开开关且配置正确**：同一接口返回 **模型生成** 内容，`sourceType` 为 **`model_*`**，`sourceVersion` 标明模型/提示版本；`basedOn` 语义与现 DTO 一致。
3. **模拟模型故障**：强制超时或错误密钥后，接口 **仍成功返回** 规则层结果（`rule_based`），前端 **ChatPage / CopilotPage** 不出现整页崩溃；聊天发消息 **不受影响**。
4. **权限**：非参与者 / 未登录 与 **现有** Copilot/chat 行为一致（不弱化）。
5. **范围**：无新增 Agent、无 simulation、无匹配摘要 AI 化、无 Copilot 落库。

---

## 9. 阶段摘要

**P6-MVP**：在仓库已到 P5、仍以规则/模板为主、Copilot UI/API 已存在的前提下，**只把「真实模型」接到这一条只读洞察链路上**，并保持失败即回退到今日规则层；**完整 P6** 仍以 `docs/P6/P6-ai-production-evolution-plan.md` 为准，**未因本文自动扩展范围**。

**里程碑（文档收口）**：P6-MVP 已定义；P6.1 已实现；P6.2 已收口；**P6.3 首轮验收通过**（见 `docs/P6/P6.3-acceptance-round1.md`）。
