# Peima / 配吗

面向关系匹配的 MVP：**P0 主链路已稳定**；**P1 已完成「结构化占位版」能力建设**（匹配洞察、聊天只读摘要、预览池条目元数据、worker 工程与文案收口）。**P2-MVP 已完成最小闭环主体落地**（摘要可选持久化、结构化反馈、画像建议显式 accept、行为信号追加、轻量只读统计、会话级 **规则化** Copilot 只读建议、ChatPage 轻接入）。**P2.5 已完成一轮产品化补完**（画像建议在聊天页 accept/dismiss、独立 Copilot 页、摘要手动生成入口、全局 analytics 白名单、建议区分区展示、P2 表 migration 收口、联调验收文档）。**P3（关系时间线）已整阶段收口并联调通过**：只读聚合 API 与 `/chat/timeline`（P3-1）、`/final-match` 第二入口（P3-2）、长会话消息分页与「加载更多消息」（P3-3）。**本仓库所称 P3 仅指该「关系时间线」切片**，不等同于口头或路线图里可能出现的「所有中长期 P3 级能力」。详见 **`docs/P3/P3-relationship-timeline.md`**。除 **P6.1～P6.4**（Copilot **真实 LLM** 只读路径，接口不变，成功走模型、失败回退规则层）、**P6.5 / P6.6 / P6.7** 三条**独立**大模型结果层切片、**P6.8**（聊天会话驱动画像补全建议：`POST /chat/conversations/:conversationId/profile-completion-suggestion`，独立 `PROFILE_COMPLETION_AI_*`，成功时创建 **pending** `ProfileUpdateSuggestion` 并复用 mine / accept / dismiss）与 **P6.9**（**仅**该 POST 上最小治理：消息条数门槛、同 `sourceVersion` 的 pending 门禁、时间冷却；**400 / 409 / 429**；被挡请求不调 LLM）、**P6.10**（**仅** **ChatPage**：依赖既有 messages 与 **`GET /profile-suggestions/mine`** 的事前禁用/说明与 **400 / 409 / 429** 事后固定中文；**不**改后端治理语义、**不**加新接口）外，大量正文与建议仍由 **规则 / 模板 / 占位逻辑** 生成；**统一的 AI Agent、多 Agent 编排与端到端 simulation 流水线**仍未作为产品化主链接入。

---

## 当前项目状态（截至 P5 治理与运营收口；P6 含 Copilot 线、独立 AI 结果层切片、P6.8 聊天画像补全、P6.9 该链路治理与 P6.10 ChatPage UX hinting 已落地）

| 维度 | 说明 |
|------|------|
| **核心口径** | P0 稳定；P1 结构化占位已完成；**P2-MVP 最小闭环已落地**；**P2.5 补完项已合入**；**P3 关系时间线已收口**（P3-1/2/3，**仅该切片**）；**P5 治理与运营已完整交付并完成一轮 code review 修复**（RBAC、建议中心、审计日志、通知中心、分析仪表板）；**P4（产品化补完）已完成 5 个最小切片并进入阶段收口**；**P6** 已交付 **Copilot 模型化与运行收口（P6.1～P6.4）**、**三条独立 AI 结果层切片（P6.5～P6.7）**、**P6.8**（聊天驱动画像补全建议，pending 闭环）、**P6.9**（P6.8 **唯一 POST** 上最小治理）与 **P6.10**（ChatPage 体验增强，**不**改后端治理），**不是**统一 Agent / multi-agent / simulation 主链（详见下文「P6」）；**当前阶段重点是收口，不是扩功能**；Worker 全自动大模型编排、多 Agent simulation 一体化、主匹配决策层直接模型替换等仍不在当前已交付范围。 |
| **P0** | 端到端主流程可跑通并保持稳定（见下文「P0 主链路」）。 |
| **P1（已完成）** | P1-1～P1-6 均已落地，均为 **规则/占位** 层，不替代真实模型推理。 |
| **P2-MVP（已完成）** | 数据表 + API + Web 聊天页轻感知层；Copilot 仅为 **基础建议层**（只读、不落库）；analytics **我的统计** 为计数级只读接口。 |
| **P2.5（已完成）** | 见下文「P2.5 产品化补完」；与 **P6.1～P6.10** 已落地能力并存，**不**表示全仓已接入统一 Agent / simulation 主链。 |
| **P3（已完成）** | **关系时间线（唯一含义）**：单会话只读时间线 API + `/chat/timeline` + FinalMatch 第二入口 + 消息分页；**不**含 Analytics 深化、Worker 自动生成、建议中心后台等（见「当前限制 / 后续方向」）。验收、联调备忘、限制、推送前清单见 **`docs/P3/P3-relationship-timeline.md`**；**不**新增时间线专用表、**不**改 P0 聊天契约。 |
| **P5（已完成）** | **治理与运营完整交付**：轻量 RBAC（`UserRole` + `Permission` 矩阵）、建议中心聚合查询 API、Admin 建议中心、审计日志系统（查询/详情/导出/失败路径）、RBAC 持久化、WebSocket/REST 通知中心、Admin 分析仪表板，以及 code review 后的 history / audit / notification / export 修复。详见 **`docs/P5/`** 与仓库当前实现。 |
| **P6（已落地）** | **Copilot 线（P6.1～P6.4）**：真实 LLM 只读 Copilot、运行手册、验收与稳定性收口；**结果层切片（P6.5～P6.7）**：会话摘要 AI、匹配解释 AI、最终匹配主结论（读路径 `primaryConclusion`）；**P6.8**：聊天驱动画像补全建议（`POST .../profile-completion-suggestion`，pending → accept/dismiss）；**P6.9**：该 POST 上最小治理（消息门槛、pending 门禁、冷却）；**P6.10**：ChatPage 上该按钮的事前提示与 **400 / 409 / 429** 事后文案统一（**不**改后端规则）。均**非**统一 Agent 主链；详见下文「P6」与 **`docs/P6/`**。 |

**P6（Copilot 模型化 + 独立 AI 结果层 + P6.8 + P6.9 + P6.10）**

### P6 当前进展

当前 **P6** 已完成五组交付，**并列存在、互不替代**：

1. **P6.1～P6.4（Copilot 线）**：在既有 **`GET /copilot/conversations/:conversationId/insights`** 契约下接入真实 LLM，失败回退规则层，并完成运行手册、首轮验收与稳定性口径收口。
2. **P6.5～P6.7（独立 AI 结果层切片）**：会话摘要、匹配解释、最终匹配主结论；各自独立配置前缀、调用链、来源标记与日志事件。
3. **P6.8（聊天驱动画像补全建议）**：基于当前会话近期消息调用独立 LLM，创建 **pending** `ProfileUpdateSuggestion`，复用既有 mine / accept / dismiss；仅 **ChatPage** 接入；详见下文「P6.8」。
4. **P6.9（P6.8 生成链路治理）**：**仅**作用于 P6.8 **唯一 POST**；消息条数门槛（首轮 **6** 条）、`sourceVersion = p6.8-profile-completion-ai-v1` 的 **pending** 门禁、**1 小时**冷却；**400 / 409 / 429**；被挡请求不调 LLM；详见下文「P6.9」。
5. **P6.10（ChatPage UX hinting）**：**仅** **ChatPage**；依赖既有 **messages** 与 **`GET /profile-suggestions/mine`** 做可推导的事前禁用/说明，并与 P6.9 状态码事后文案对齐；**不**加新接口、**不**改后端治理；详见下文「P6.10」。

**P6** 整体仍**不是**统一 Agent / multi-agent / simulation 产品化主链。

### P6.1～P6.4 Copilot 线

- **P6.1**：真实 AI Copilot **最小实现**；**接口路径不变**（仍为 `GET /copilot/conversations/:conversationId/insights`）；配置可用且调用成功时走模型，否则回退 **P2** 规则聚合层；只读、不落库。
- **P6.2**：**Copilot 真实 LLM 运行手册**（OpenAI-compatible、provider、环境变量、`sourceType` / `sourceVersion`、fallback 与排查口径）。文档：`docs/P6/P6.2-copilot-llm-runbook.md`。
- **P6.3**：Copilot **首轮验收收口**（Accepted）。文档：`docs/P6/P6.3-acceptance-round1.md`。
- **P6.4**：**运行稳定性收口**（日志、`fallback` 原因码、配置与运行口径对齐）；**非**新功能扩展。文档：`docs/P6/P6.4-stability-closure.md`。

实现与首轮落地说明见 **`docs/P6/P6.1-implementation-round1.md`**。

### P6.5 Summary AI

- 独立接口：`GET /summary-ai/conversations/:conversationId`（JWT）
- 独立配置前缀：`SUMMARY_AI_*`
- 独立 `sourceType` / `sourceVersion`
- 独立日志事件：`summary_ai`
- 模型主路径 + 规则 fallback
- 不阻断原主链路

### P6.6 Match Explanation AI

- 独立接口：`GET /match-explanation-ai/match-results/:matchResultId`（JWT）
- 独立配置前缀：`MATCH_EXPLANATION_AI_*`
- 独立 `sourceType` / `sourceVersion`
- 独立日志事件：`match_explanation_ai`
- 模型主路径 + 规则 fallback
- 不改 matching 分数与主决策

### P6.7 Final Match Primary Conclusion

- 挂载位置：`GET /matching/result/:userId`（**读路径附加**，不写回 `MatchResult`）
- 新增字段：`primaryConclusion`
- 最小字段：`content`、`sourceType`、`sourceVersion`、`fallbackUsed`
- **不改** matching 决策、worker 写库、`finalScore`、既有 `reasonSummary` / `matchInsights`

具体实现：`MatchingService.getLatestResultForUser` 在查出最新 `MatchResult` 后调用 `FinalMatchConclusionService.generate`，将结果合并进响应返回；不改动批处理与主匹配链路。

特点：

- 只作用于最终匹配结果页主结论展示
- 不参与打分、排序或匹配决策
- 规则基线来自已有 `reasonSummary` 与 `matchInsights.explanation.whyMatch`
- AI 成功时返回模型文案；失败时 fallback 到规则基线
- 主链路保持可用，HTTP 仍返回 **200**（失败体现在 `primaryConclusion` 归因字段中）

当前 `sourceType` 三态：

- 规则直出：`final_match_conclusion_rule_based`
- 模型成功：`final_match_conclusion_model_<provider>`（实现中为 `final_match_conclusion_model_<slug>`）
- 失败回退：`final_match_conclusion_fallback_rule_based`

当前日志事件：`final_match_conclusion`

已验证：**A1** 规则直出、**A2** 模型成功、**A3** 模型失败回退均已通过。首轮验证中，**Kimi** provider 下 **A2（模型成功）** 路径已打通。

首轮收口记录：**`docs/P6/P6.7-final-match-primary-conclusion-round1.md`**

### P6.8 Conversation Profile Completion AI

- **唯一入口**：`POST /chat/conversations/:conversationId/profile-completion-suggestion`（JWT；可选 body `messageLimit`）
- **前端**：仅 **ChatPage** 人工触发；成功后刷新 `GET /profile-suggestions/mine`
- **行为**：基于当前会话**近期消息**调用独立配置的 LLM（`PROFILE_COMPLETION_AI_*`，**不**使用 `SUMMARY_AI_*`）；成功时创建一条 **pending** 的 `ProfileUpdateSuggestion`；复用既有 **accept / dismiss** 闭环写入 `UserProfile`（仅当用户接受且 `proposedPatch` 含有效字段时，按既有逻辑更新）
- **生成白名单（当前）**：`proposedPatch` 仅允许 **initiativeLevel**、**socialEnergy**、**emotionalExpression**、**relationshipPace**；**confidence**、**decisionOrientation**、**conflictResponse** 已从 P6.8 生成路径排除（prompt + 服务端过滤）。**既有**历史 suggestion **不**回溯清洗；**仅新生成**受该白名单约束。
- **边界**：**不改** matching；生成接口**不**自动写 `UserProfile`；**无** Worker / 多 Agent / simulation
- **归因**：`sourceType` 固定 **`hybrid`**；`sourceVersion` 固定 **`p6.8-profile-completion-ai-v1`**
- **首轮已验证**：生成 pending、mine 可见、accept、dismiss、无有效维度时 **422**、非 pending 再 accept/dismiss **400**

首轮收口记录：**`docs/P6/P6.8-conversation-profile-completion-round1.md`**

### P6.9 Conversation Profile Suggestion Governance

- **作用范围**：**仅** `POST /chat/conversations/:conversationId/profile-completion-suggestion`（P6.8 唯一生成入口）；治理只针对 **`sourceVersion = p6.8-profile-completion-ai-v1`** 这条链路的读库判断。
- **三项治理（首轮）**：① 参与拼 prompt 的**消息切片**总条数 **≥ 6**；② 已存在 **pending** 的 P6.8 建议则不再生成；③ 距上次同 `sourceVersion` 任意状态建议不足 **1 小时**则冷却。
- **状态码**：**400** 消息不足；**409** 已有 pending 的 P6.8 建议；**429** 冷却中；满足条件时仍可 **200** 创建 pending。
- **被治理挡住的请求不调用 LLM**。
- **边界**：**不改** matching、**不改** schema、**不改** accept / dismiss 主流程；**无** worker / 多 Agent / simulation；**不**扩到 CopilotPage / admin / timeline / suggestion center。
- **首轮已验证**：消息少于 **6** 条 **→ 400**；已有 pending **→ 409**；冷却中 **→ 429**；条件满足 **→ 200**。

首轮收口记录：**`docs/P6/P6.9-conversation-profile-suggestion-governance-round1.md`**

### P6.10 Conversation Profile Suggestion UX Hinting

- **作用范围**：**仅** **ChatPage**「根据本轮对话生成画像建议」；**不**扩到 CopilotPage、admin、timeline、suggestion center。
- **数据依赖**：当前页已加载会话 **messages**；**`GET /profile-suggestions/mine`**（status / sourceVersion / createdAt）；**无**新 REST 接口。
- **事前提示**（可推导时按钮禁用 + **单行**原因，优先级固定：消息不足 → 已有 P6.8 **pending** → 冷却）：冷却仅在前端可据 `mine` **可靠**推导时事前禁用；否则依赖 **429** 与事后文案。
- **事后文案**（与事前口径一致）：**400** → 当前会话用于生成的消息不足 6 条；**409** → 已有一条待处理的画像补全建议；**429** → 当前画像补全建议仍在冷却时间内。
- **边界**：**不改** P6.8 / P6.9 后端治理语义；**不改** schema；**不改** accept / dismiss 主流程；**无** worker / 多 Agent / simulation；**无**倒计时、轮询、全局通知。
- **首轮已验证**：消息不足可事前禁用且与 **400** 文案一致；已有 pending 可事前禁用且与 **409** 一致；冷却可推导时可事前禁用，否则 **429** 事后文案一致；条件满足时仍可 **200** 创建 pending。

首轮收口记录：**`docs/P6/P6.10-conversation-profile-suggestion-ux-hinting-round1.md`**

### P6 当前结论

截至目前，**P6** 在仓库内包含五层已完成内容：

- **Copilot 模型化线（P6.1～P6.4）**：真实 LLM 接入既有 Copilot 只读接口 + 运行与稳定性收口。
- **独立 AI 结果层切片（P6.5～P6.7）**：摘要、匹配解释、最终匹配主结论；独立入口、独立配置、独立来源标记、独立日志、模型主路径 + 规则 fallback、不阻断原主链路、可独立验收与归因。
- **P6.8**：聊天驱动画像补全建议；独立 Chat POST 入口 + 独立 env；pending suggestion + 既有 accept/dismiss；不改 matching、不自动写画像（生成侧）。
- **P6.9**：P6.8 生成链路最小治理；无 schema 变更；不改 accept/dismiss；挡流请求不调 LLM。
- **P6.10**：ChatPage 展示层 UX hinting；不增接口、不改服务端治理规则；与 P6.9 状态码展示对齐。

当前阶段**仍不是**统一 AI orchestration / 全仓单一编排平台阶段；已交付项均为**边界清晰**的切片与 Copilot 子链。

### P6 暂未展开的内容

以下内容仍不属于当前已完成范围：

- Worker 侧全自动大模型生成与统一编排
- 多 Agent / simulation 一体化流水线
- 主匹配决策层直接模型替换
- 通用 AI 编排平台
- 更重的生产化治理（与当前切片级交付区分）
- （补充）多场景复杂模拟、全局模型优化等产品化层

当前策略：在**非**统一编排前提下，将 Copilot 与各结果层切片做稳后，再评估更重生产化形态（演进背景仍见 **`docs/P6/P6-ai-production-evolution-plan.md`**）。

### P6.7 环境变量示例

```env
FINAL_MATCH_CONCLUSION_AI_ENABLED=true
FINAL_MATCH_CONCLUSION_AI_PROVIDER=kimi
FINAL_MATCH_CONCLUSION_AI_BASE_URL=https://api.moonshot.cn
FINAL_MATCH_CONCLUSION_AI_MODEL=kimi-k2.5
FINAL_MATCH_CONCLUSION_AI_API_KEY=your_kimi_api_key
```

当前实现下，`FINAL_MATCH_CONCLUSION_AI_BASE_URL` 应填写**供应商根域名**（如 `https://api.moonshot.cn`）；客户端会自行拼接 **`/v1/chat/completions`**，**请勿**在 BASE_URL 末尾再手动追加 `/v1`。

**P1 已交付能力（摘要）**

- **P1-1**：`MatchResult.matchInsights`（JSON）落库；worker batch-match 写入占位结构；`GET /matching/result/:userId` 向下兼容返回。
- **P1-2**：`FinalMatchPage` 展示洞察卡片；无合法 `matchInsights` 时回退为 P0 展示。
- **P1-3**：`GET /chat/conversations/:conversationId/summary` 只读占位摘要（不落库）；`ChatPage` 轻展示，失败则隐藏，**不**影响发消息与 `POST /chat/messages`。
- **P1-4**：`PreviewPoolItem.itemMeta`（JSON）落库；generate 写入占位；`PreviewPoolPage` 轻展示，无效则隐藏。
- **P1-5**：worker batch-match 候选侧批量加载；结构化日志（`[batch-match]` 等）。
- **P1-6**：占位文案与免责声明收敛至 `packages/shared/constants`（需先 build shared）。

**P2-MVP 已交付能力（摘要）**

- **数据**：`conversation_summaries`、`user_feedbacks`、`profile_update_suggestions`、`behavior_signals`（及既有 `UserProfile` 等）；无独立 `copilot_insights` 表。
- **API（均需 JWT，风格与 chat 对齐）**：chat 摘要读/可选生成落库；`POST/GET /feedback`；profile 建议创建/我的列表/accept/dismiss；behavior-signal 追加与我的列表；`GET /analytics/p2-overview/mine`；`GET /analytics/p2-overview`（**P2.5**：仅 env 白名单用户，否则 **403**）；`GET /copilot/conversations/:id/insights`（**P2** 规则聚合基线；**P6.1～P6.4** 可选真实 LLM，失败回退规则层；只读）。
- **Web**：`ChatPage` 条件展示摘要、摘要「生成并更新」、Copilot 卡片与跳转完整建议页、画像建议待处理/已处理分区、会话快捷反馈（👍/😐/👎）；失败降级，不阻塞发消息。
- **Shared**：P2 相关类型与常量（`sourceType` / `sourceVersion`、建议状态、反馈 subject 等）。
- **DB（P2.5）**：P2 四表见迁移 `20260405100000_p2_persistence_mvp`，空库 `migrate deploy` 可复现（曾用 `db push` 的库需自行 baseline）。

**P2.5 产品化补完（摘要）**

- **画像建议**：`ChatPage` 内列表 + **接受 / 忽略**，成功后刷新列表；已处理默认折叠。
- **Copilot**：路由 **`/copilot?conversationId=`**（`CopilotPage`），只读展示 insights（含 `basedOn`）；聊天内仍保留轻量卡片。
- **摘要**：`ChatPage` **生成并更新摘要** 按钮，调用 `POST .../summary/generate` 并刷新展示（不依赖发消息刷新 Copilot）。
- **Analytics**：`GET .../p2-overview/mine` 任意登录用户可读；**全局** `GET .../p2-overview` 由环境变量 **`P2_ANALYTICS_GLOBAL_OVERVIEW_USER_IDS`**（用户 id 列表）控制，未列入则 **403**。
- **Migration**：P2 持久化表纳入正式 Prisma migration 历史（见上）。
- **联调/验收**：`docs/P2/P2.5-integration-checklist.md`（命令 + 手动勾选清单）。

**P3 关系时间线（摘要，与 `docs/P3/P3-relationship-timeline.md` 一致）**

- **P3-1 / API 首屏**：`GET /chat/conversations/:conversationId/timeline`（JWT；仅参与者）；`messageSkip=0`（默认）时返回完整混合时间线：会话开始、**首屏消息窗口**（默认最多 200 条，升序）、本会话全部摘要快照、双方行为信号、**当前用户**会话反馈；响应含 **`messagePagination`**；只读 DTO。
- **P3-3 / 消息追加**：可选 Query **`messageSkip`**、**`messageLimit`**（默认 0 / 200，**上限 200**）；**`messageSkip>0`** 时仅返回 **`message_sent`** 切片 + **`messagePagination`**；时间线页 **「加载更多消息」** 合并排序去重。
- **Web 入口**：`/chat/timeline?conversationId=&userId=`；**`ChatPage`** 与 **`FinalMatchPage`**（P3-2）「查看关系时间线（只读）」；FinalMatch 与「进入聊天」共用 **`createConversation(userId)`** 同一会话。
- **联调注意**：时间线请求须与 chat/copilot **同一 API 基址**（以 **`.env`** 中 **`VITE_API_BASE_URL`** / **`API_PORT`** 及 **API 实际启动日志**为准，**勿将某一固定端口当作仓库默认值**）；勿将 `VITE_API_BASE_URL` 指到 Vite dev 端口，否则浏览器会出现 **`Cannot GET .../timeline`** 而直连 API 正常（详见 P3 文档 §6）。
- **收口文档**：整阶段说明、验收 checklist、联调备忘、已知限制、Git 推送前清单、提交用语见 **`docs/P3/P3-relationship-timeline.md`**。

**当前仍未纳入（勿与 P2-MVP / P2.5 / 本阶段 P3 混淆）**

- **本阶段 P3（关系时间线）已完成**；下列条目 **不属于** 该 P3 切片，属后续产品方向或中长期能力。
- **统一** AI Agent、多 Agent 编排、端到端 simulation **一体化**产品化流水线（**P6.1～P6.10** 已交付者为 Copilot 子链、独立 HTTP/读路径切片、**P6.8** 聊天画像建议 POST、**P6.9** 同 POST 治理与 **P6.10** ChatPage 体验增强（**不**增接口），**不是**该一体化主链，见上文「P6」）。
- Copilot / 摘要的 **Worker 自动生成**、历史版本产品化、完整建议治理后台。
- 独立「设置 / 建议中心」页（当前建议能力集中在 **ChatPage** 与 **CopilotPage**）。
- **Analytics** 更细粒度治理、缓存与大盘产品化（当前仅有计数级只读接口 + P2.5 全局白名单）。

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
| `apps/web` | 用户端：登录、问卷、预览池、匹配状态/结果、聊天、**关系时间线**（`/chat/timeline`；`/final-match` 第二入口）；**P6.10**：ChatPage 上 P6.8/P6.9 相关按钮 UX hinting（仅前端，不改 API） |
| `apps/admin` | 管理端占位（当前不强依赖） |
| `apps/api` | NestJS：auth/users/preferences/images/preview-pool/questionnaire/matching/chat；**P2**：feedback、profile-suggestion、behavior-signal、analytics、copilot（及 chat summary 持久化相关）；**P3**：chat 关系时间线 `GET .../timeline`（可选 `messageSkip` / `messageLimit`）；**P6**：copilot 模块 **P6.1～P6.4** 真实 LLM 路径；`summary-ai`、`match-explanation-ai`；matching 内 **P6.7** `primaryConclusion` 读路径生成；chat 内 **P6.8** `POST .../profile-completion-suggestion`、**P6.9** 同路径治理（**P6.10** 无服务端增量，见 `apps/web` ChatPage） |
| `apps/worker` | 批处理：cron、batch-match、队列消费 |
| `packages/database` | Prisma schema、迁移、PrismaClient |
| `packages/shared` | 共享类型；**P1 起**含 `constants`（如 `P1_DISCLAIMER` 等）及 `dist/constants` 构建产物；**P2** 增量类型/常量（`P2SourceType`、反馈 subject、suggestion 状态等） |
| `packages/config` | 共享配置占位 |
| `packages/ai-prompts` | AI 提示词资产占位（未接真实推理链） |
| `packages/scoring` | 评分逻辑占位 |
| `packages/sdk` | SDK 占位 |
| `infrastructure` | Docker/Nginx/脚本等物料 |
| `scripts` | 本地开发脚本（`seed-users.js` 创建 6 个测试用户；`upload-images.sh` 给用户上传测试图片） |
| `docs/P0` | P0 交接、验收清单、bugfix、状态摘要 |
| `docs/P1` | **P1 状态、范围、架构增量、验证摘要**（见下文文档索引） |
| `docs/P2` | **P2 范围、状态、验证、P2.5 联调清单**（见下文文档索引） |
| `docs/P3` | **P3 关系时间线**阶段收口、验收 checklist、推送前清单（见下文文档索引） |
| `docs/P4`～`docs/P6` | **P4 已完成 5 个最小切片并有收口文档**；P5 已落地；**P6** 含 **P6.1～P6.4**（Copilot）、**P6.5～P6.7**（独立切片）、**P6.8**（聊天画像补全）、**P6.9**（该链路治理收口）、**P6.10**（ChatPage UX hinting 收口）、**`P6-ai-production-evolution-plan.md`**（演进规划）；详见下文「文档索引」 |

## 当前项目结构（P0 / P1 / P2-MVP / P2.5 / P3 / P5 / P6 切片）

以下目录树按**当前仓库真实路径**整理，仅收录 P0 主链路、P1 结构化占位、P2 相关核心、P5 治理与运营等核心源码与约定入口，**不是**完整文件系统导出（已省略 `node_modules`、`dist` 等依赖与编译产物）。**[P0]** 主链路基础能力；**[P1]** P1 结构化占位（洞察、只读摘要、预览元数据等）；**[P2]** P2-MVP **新增或显著改动**；**[P2.5]** 在 P2 基础上的 Web/迁移/权限等小步补完；**[P5]** 权限、审计、通知、分析与建议治理（见树内标注）。

```
.
├── apps/
│   ├── api/
│   │   ├── package.json
│   │   └── src/
│   │       ├── main.ts                          [P0] Nest 入口
│   │       ├── app.module.ts                    [P0] 根模块；[P2] 挂接 feedback / profile-suggestion / behavior-signal / analytics / copilot；[P5] 挂接 RbacModule + SuggestionCenterModule；[P6] 挂接 summary-ai、match-explanation-ai；[P6.8] chat 内画像补全 POST；[P6.9] 同 POST 治理（读 profile-suggestion）
│   │       ├── common/
│   │       │   ├── prisma/                      [P0] PrismaModule / PrismaService
│   │       │   └── rbac/                        [P5] RBAC 守卫、装饰器、服务
│   │       └── modules/
│   │           ├── auth/                        [P0] 注册登录、JWT
│   │           ├── users/                       [P0] 用户与画像
│   │           ├── questionnaire/               [P0] 问卷与评分
│   │           ├── images/                      [P0] 用户图片
│   │           ├── preferences/                 [P0] 偏好
│   │           ├── preview-pool/                [P0] 预览池；[P1] itemMeta
│   │           ├── matching/                    [P0] 入队与状态；[P1] matchInsights 读出；[P6.7] Final Match Primary Conclusion（读路径 `primaryConclusion`）
│   │           ├── chat/                        [P0] 会话与消息；[P1] 摘要只读；[P2] ChatSummary* 持久化、summary DTO；[P6.8] `POST .../profile-completion-suggestion`；[P6.9] 同路径治理
│   │           ├── feedback/                    [P2] 结构化反馈 API
│   │           ├── profile-suggestion/          [P2] 画像建议创建/列表/accept/dismiss
│   │           ├── behavior-signal/             [P2] 行为信号追加与我的列表
│   │           ├── analytics/                   [P2] 只读概览；[P2.5] 全局 overview 白名单；[P5] 权限控制
│   │           ├── copilot/                     [P2] 会话级建议（只读、不落库）；[P6.1～P6.4] 真实 LLM 路径，失败回退规则层
│   │           └── suggestion-center/           [P5] 建议中心聚合 API（列表、统计、批量操作、导出）
│   ├── web/
│   │   └── src/
│   │       ├── main.jsx / App.jsx               [P0]
│   │       ├── router/index.jsx                 [P0] 路由
│   │       ├── pages/                           [P0] Login / Questionnaire / … / Chat；[P2.5] CopilotPage；[P6.10] ChatPage 画像补全按钮 UX hinting
│   │       ├── api/                             [P0] auth、questionnaire、previewPool、matching、chat；[P2] feedback、profile、copilot
│   │       ├── components/
│   │       │   ├── common/LoadingState.jsx      [P0]
│   │       │   ├── chat/ChatSummaryCard.jsx     [P2] 会话摘要展示
│   │       │   ├── copilot/CopilotInsightCard.jsx    [P2]
│   │       │   ├── feedback/FeedbackQuickActions.jsx [P2]
│   │       │   └── profile/ProfileSuggestionCard.jsx [P2] [P2.5] 待处理/已处理分区与折叠
│   │       └── utils/resolveUserId.js           [P0]
│   └── worker/
│       ├── Dockerfile
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── main.ts                          [P0] worker 入口
│           ├── schedulers/daily-match.scheduler.ts   [P0/P1] cron；[P1] 调度 batch-match
│           └── jobs/
│               ├── batch-match.processor.ts     [P0] 批匹配；[P1] 写入 matchInsights 占位
│               ├── matching-score.ts            [P0]
│               └── match-insights-placeholder.ts     [P1] 洞察占位结构
├── packages/
│   ├── shared/
│   │   ├── package.json
│   │   ├── tsconfig.constants.json
│   │   ├── constants/
│   │   │   ├── index.ts                         [P0/P1] 汇总导出；[P2] P2 常量
│   │   │   ├── p1-placeholders.ts              [P1] P1 免责声明与提示前缀等
│   │   │   ├── p2-source-type.ts               [P2]
│   │   │   ├── p2-feedback-subject-kind.ts     [P2]
│   │   │   └── p2-suggestion-status.ts         [P2]
│   │   └── types/
│   │       ├── index.ts                         [P1/P2] 类型汇总
│   │       ├── match-p1.ts                      [P1] matchInsights 等
│   │       ├── p2-chat-summary.ts               [P2]
│   │       ├── p2-feedback.ts                   [P2]
│   │       ├── p2-profile-suggestion.ts         [P2]
│   │       └── p2-signal.ts                     [P2]
│   └── database/
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/index.ts                         [P0] Prisma Client 再导出
│       └── prisma/
│           ├── schema.prisma                    [P0] 数据模型；[P1/P2] 增量表与字段
│           └── migrations/                      Prisma 迁移历史；含 P2 四表正式迁移（P2.5）
└── docs/
    ├── P2/
    │   ├── P2-scope-notes.md                    P2 范围与设计原则
    │   ├── P2-status-summary.md                 P2-MVP 状态与边界
    │   ├── P2-validation-summary.md             验证方式与已知限制
    │   └── P2.5-integration-checklist.md        P2.5 联调命令与手动验收清单
    ├── P3/
    │   └── P3-relationship-timeline.md          P3 关系时间线整阶段收口、联调备忘、验收与推送前清单
    ├── P4/
    │   └── P4-productization-plan.md            P4 规划与收口参考（已完成 5 个最小切片）
    ├── P5/
    │   └── P5-operations-and-history-plan.md    P5 总体规划与后续演进背景（当前仓库已有主要治理与运营能力落地）
    └── P6/
        ├── P6-ai-production-evolution-plan.md    P6 演进规划（Worker/编排等中远期）
        ├── P6.1-implementation-round1.md         P6.1 Copilot 真实 AI 最小实现
        ├── P6.2-copilot-llm-runbook.md           P6.2 Copilot LLM 运行手册
        ├── P6.3-acceptance-round1.md           P6.3 Copilot 首轮验收收口
        ├── P6.4-stability-closure.md           P6.4 Copilot 运行稳定性收口
        ├── P6.5-summary-ai-slice.md / P6.5-summary-ai-acceptance-round1.md
        ├── P6.6-match-explanation-ai-slice.md / P6.6-match-explanation-ai-acceptance-round1.md
        ├── P6.7-final-match-primary-conclusion-round1.md   P6.7 首轮收口记录
        ├── P6.8-conversation-profile-completion-round1.md   P6.8 首轮收口记录
        ├── P6.9-conversation-profile-suggestion-governance-round1.md   P6.9 首轮收口记录
        └── P6.10-conversation-profile-suggestion-ux-hinting-round1.md   P6.10 首轮收口记录
```

## 当前已跑通的 P0 主链路

1. `/login` 登录（注册/登录，保存 `peimaToken` 与 `peimaUserId`）
2. `/questionnaire` 提交问卷（生成/更新用户画像）
3. 准备候选用户和图片数据（候选用户需有 images）
4. `/preview-pool` 生成并展示 6 人预览池
5. `/matching-waiting` 查看匹配状态
6. worker 执行 `batch-match`（手动一次或 cron 触发）
7. `/final-match` 查看最终匹配结果（**P1**：有 `matchInsights` 时展示洞察卡片；**P6.7**：条件展示 `primaryConclusion` 主结论区块）
8. `/chat` 进入聊天并发送消息（**P1**：summary；**P2-MVP**：持久化摘要、Copilot、反馈与画像建议；**P2.5**：摘要手动生成、建议 accept/dismiss、跳转 Copilot 页；**P6.1～P6.4**：Copilot insights 可选真实 LLM，失败回退规则层；**P6.8** + **P6.9**：可选「根据本轮对话生成画像建议」→ 满足治理时 **pending** suggestion；**P6.10**：该按钮事前提示与 **400/409/429** 事后文案统一，**不**改后端治理）

## 关键页面

- `/login`：注册/登录，token 与 userId 持久化
- `/my-images`：为**当前登录用户**添加图片记录（粘贴可访问的 **HTTPS 图片直链**；需 JWT）；用于预览池「至少 6 名带图候选」数据准备
- `/questionnaire`：固定题库并提交（12 题）
- `/preview-pool`：最新 6 人池（full / blurred / locked）；**P1**：条目可展示 `itemMeta` 占位文案
- `/matching-waiting`：匹配状态（waiting / processing / ready）
- `/final-match`：最终结果与评分摘要；**P1**：洞察卡片（条件展示）；**P6.7**：`primaryConclusion` 主结论（形状合法时展示）
- `/chat`：会话与消息、发送消息；**P1/P2**：会话摘要（条件展示）；**P2-MVP**：Copilot 卡片、快捷反馈；**P2.5**：摘要「生成并更新」、画像建议列表与操作、链至完整 Copilot 页；**P6.8** / **P6.9**：聊天内触发画像补全（`POST .../profile-completion-suggestion`，**P6.9** 治理）；**P6.10**：同页该按钮 UX hinting（**不**增接口）
- `/chat/timeline`：**P3** 关系时间线只读页；支持首屏时间线展示与长会话消息分页加载（需 `?conversationId=`，建议同时带 `userId=`）
- `/copilot`：**P2.5** 独立页，需 `?conversationId=`（建议同时带 `userId=` 以便返回聊天）；只读 insights，不代发消息；**P6.1～P6.4** 与聊天内同源 Copilot 接口，可选真实 LLM

## 关键 API（及 JWT 保护）

- 公开：
  - `POST /auth/register`
  - `POST /auth/login`
  - `GET /questionnaire/questions`

- 需要 JWT：
  - `GET /auth/me`
  - `POST /images`（`body.userId` 须与 token 用户一致）、`GET /images/user/:userId`、`GET /images/:id`、`DELETE /images/:id`
  - `POST /questionnaire/submit`
  - `POST /preview-pool/generate`
  - `GET /preview-pool/user/:userId/latest`
  - `POST /matching/enqueue`
  - `GET /matching/status/:userId`
  - `GET /matching/result/:userId`（**P1**：响应含可选 `matchInsights`；**P6.7**：响应含 `primaryConclusion`）
  - `GET /summary-ai/conversations/:conversationId`（**P6.5**，JWT；会话摘要 AI，独立于 P2 摘要持久化链路）
  - `GET /match-explanation-ai/match-results/:matchResultId`（**P6.6**，JWT；匹配解释 AI）
  - `POST /chat/conversations`
  - `GET /chat/conversations/:conversationId`
  - `GET /chat/conversations/:conversationId/timeline`（**P3**：关系时间线；支持可选 `messageSkip` / `messageLimit`）
  - `POST /chat/conversations/:conversationId/profile-completion-suggestion`（**P6.8** 生成 + **P6.9** 治理，JWT；满足条件 → pending `ProfileUpdateSuggestion`；**400/409/429** 见「P6.9」；**P6.10** 在 ChatPage 对该 POST 错误做固定中文映射，**不**改接口语义）
  - `POST /chat/messages`
  - `GET /chat/conversations/:conversationId/summary`（**P1/P2**：优先持久化行，否则规则摘要）
  - `POST /chat/conversations/:conversationId/summary/generate`（**P2**：生成并落库快照）
  - `POST /feedback`、`GET /feedback/mine`（**P2**）
  - `POST /profile-suggestions`、`GET /profile-suggestions/mine`、`POST /profile-suggestions/:id/accept|dismiss`（**P2**）
  - `POST /behavior-signals`、`GET /behavior-signals/mine`（**P2**）
  - `GET /analytics/p2-overview/mine`（**P2**，只读计数，**任意登录用户**）
  - `GET /analytics/p2-overview`（**P2**，只读全局计数；**P2.5**：**仅** `P2_ANALYTICS_GLOBAL_OVERVIEW_USER_IDS` 白名单内用户，否则 **403**）
  - `GET /copilot/conversations/:conversationId/insights`（**P2** 规则基线；**P6.1～P6.4** 可选真实 LLM，失败回退规则层；只读、不落库）

> 受保护接口会校验 token 用户与请求中的 `userId` / `senderUserId` 等一致性。  
> 前端：`peimaToken` / `peimaUserId` 存于 `localStorage`，请求携带 `Authorization: Bearer <token>`。  
> 全局 analytics 白名单见根目录 `.env.example` 中 `P2_ANALYTICS_GLOBAL_OVERVIEW_USER_IDS`。

### 页面与接口对应关系

- `/login`：`POST /auth/register`、`POST /auth/login`、`GET /auth/me`
- `/my-images`：`POST /images`、`GET /images/user/:userId`、`DELETE /images/:id`
- `/questionnaire`：`GET /questionnaire/questions`、`POST /questionnaire/submit`
- `/preview-pool`：`POST /preview-pool/generate`、`GET /preview-pool/user/:userId/latest`
- `/matching-waiting`：`GET /matching/status/:userId`
- `/final-match`：`GET /matching/result/:userId`（**P6.7** `primaryConclusion`）、`POST /chat/conversations`（进聊天）
- `/chat`：`GET /chat/conversations/:conversationId`、`POST /chat/messages`；**P2**：`GET .../summary`、`POST .../summary/generate`（手动生成）、`GET /copilot/.../insights`、`POST /feedback`、`GET /profile-suggestions/mine`、accept/dismiss 等（见 `apps/web/src/api`）；**P6.8** / **P6.9**：`POST .../profile-completion-suggestion`；**P6.10**：同页结合 messages + `mine` 的事前提示与上述 POST 事后文案
- `/chat/timeline`：`GET /chat/conversations/:conversationId/timeline`
- `/copilot`：Web 仅调 `GET /copilot/.../insights`（与聊天内同源接口）

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

### 环境变量配置

根目录 **`.env`** 包含关键配置（参考 **`.env.example`**）；重要字段：

| 字段 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 连接串（本地需 `localhost`；Docker 需宿主机端口映射） |
| `JWT_SECRET` | JWT 签名密钥 |
| `VITE_API_BASE_URL` | Web 访问 API 的基址，须与 **`API_PORT`** 及当前运行实例一致，以 **`.env`** 为准（**勿**在文档层面预设固定端口） |
| `PEIMA_ADMIN_USER_IDS` | 逗号分隔的管理员用户 ID 列表；可在 admin UI 触发手动 batch-match |
| `P2_ANALYTICS_GLOBAL_OVERVIEW_USER_IDS` | **P2.5**：全局 analytics 白名单用户 ID（默认仅自己可读；白名单用户可见全局统计） |

### 启动注意事项

- **`pnpm dev:api`**（根目录）会通过 **`dotenv-cli`** 读取根目录 **`.env`** 并 **`--override`**，因此 **`DATABASE_URL` 以 `.env` 为准**；需保证 Postgres 在本机 **可访问**（若在 Docker 中，须有 **宿主机端口映射**，且 `DATABASE_URL` 使用 **`localhost:<映射端口>`**，不要用容器名 `postgres`）。
- **首次克隆 / 清过 `node_modules` 后**：建议先执行一次 **`pnpm --filter @peima/database build`** 与 **`pnpm --filter @peima/shared build`**（或 **`pnpm build:api`**，会顺带执行上述依赖），再 **`pnpm dev:api`**，否则易出现 Prisma Client / `shared` 的 `dist` 缺失。
- **Web**：`apps/web` 的 Vite 已配置从 **monorepo 根目录**加载 **`VITE_*`**，与 **`.env`** 中 **`VITE_API_BASE_URL`** 对齐即可；勿把 API 基址指到 Vite 自己的端口（见上文 P3 联调注意）。
- **Windows**：若 Docker 或 Node 出现 **`bind` / `EACCES` / 端口无权限**，多为 **Hyper-V 保留端口区间**；可提高 **`.env`** 中的 **`API_PORT`、`POSTGRES_PORT`**，并同步 **`DATABASE_URL`、`VITE_API_BASE_URL`**（以及改 API 后 **`docker compose up -d --build web`**）。
- **API e2e**：`pnpm --filter @peima/api test:e2e` 会通过 `apps/api/test/jest-e2e-env.ts` **自动加载** monorepo 根目录 **`.env`**（或 `apps/api/.env`），需其中 **`DATABASE_URL`** 指向 **已 migrate** 且 **当前可连** 的 Postgres；亦可继续在 shell 里导出 `DATABASE_URL` 覆盖。

构建 API / Worker 前需生成 Prisma Client；**P1-6 起** API / Worker 的构建链会先构建 `@peima/shared`（constants，含 P2 增量），详见各包 `package.json` 的 `prebuild` / `build`。

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
3. `curl -i http://localhost:<API_PORT>/auth/me`（将 `<API_PORT>` 换为 **`.env`** 中 **`API_PORT`** 与 **API 启动日志**所示实际监听端口）预期 `401`（鉴权在工作）。
4. `docker compose logs --tail=50 worker`：见 `worker started`、cron 注册；手动跑批后见 **`[batch-match]`** `batch_complete` 等。

## 快速本地测试（创建 6 个测试用户）

为快速验证 P0 主链路，可使用如下脚本自动生成 6 个测试用户、上传图片、生成预览池：

### 1) 创建 6 个测试用户与问卷

```bash
# 创建 6 个测试用户，自动注册、登录、提交问卷
# 结果：6 个 User + 对应 UserProfile（见脚本输出的 userId 列表）
node scripts/seed-users.js
```

### 2) 为用户上传图片

```bash
# 给 6 个用户各上传一张测试图片（生成最小 JPEG）
# 需保证 API 正常运行；根 URL 以 .env / API_PORT / 实际启动日志为准
bash scripts/upload-images.sh
```

执行完后，6 个用户将各有 1 张图片，可进行预览池生成。

### 3) Web 端快速调试

用户端（Web，默认端口 `5173`）：
1. 打开 `http://localhost:5173`，选一个测试手机号登录（如 `13008517773`）
2. `/my-images` 确认图片已上传（可选验证）
3. `/preview-pool` 点「生成预览池」，应显示 6 人池
4. 点用户进入匹配等待
5. 手动跑批（见下文「手动跑批」）后查看 `/final-match`
6. `/chat` 进入聊天测试 **P0/P1/P2** 能力（摘要、Copilot、建议等）

管理员端（Admin，默认端口 `5174`）可用于后台能力验证；普通用户链路不依赖 admin 页面。

> 测试用户手机号（执行 seed-users.js 后自动创建，可直接用）：  
> `13008517773` / `16846531247` / `16898806368` / `17930489006` / `16760022595` / `18221207794`

### 4) 管理员操作（可选）

根目录 `.env` 中配置 `PEIMA_ADMIN_USER_IDS`（用户 ID 列表），即可在 admin 端手动触发 batch-match：

```bash
# 假设 admin 用户 ID 已在 .env 配置
# 将 <API_PORT> 换为 .env 与 API 启动日志中的实际端口
curl -s -X POST http://localhost:<API_PORT>/admin/batch-match/run-once \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

若仅需命令行跑批（无需 admin UI）：

```bash
# Docker 内运行
docker compose exec worker node apps/worker/dist/main.js --batch-match
```

## P0 验收方式（简明）

前置：`preview-pool` 需要至少 **6 个带 images 的候选用户**（不含当前 viewer）。

> 本地快速测试可用上文「快速本地测试」章节的脚本一键创建。

顺序：登录 → 问卷 → 生成预览池 → `matching/enqueue` → worker `batch-match` → `/final-match` → `/chat`。

手动入队示例：

```bash
# 将 <API_PORT> 换为 .env 与 API 启动日志中的实际端口
curl -s -X POST http://localhost:<API_PORT>/matching/enqueue \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"<USER_ID>\"}"
```

手动跑批（Docker 内）：

```bash
docker compose exec worker node apps/worker/dist/main.js --batch-match
```

**P1 抽检（可选）**：结果接口含 `matchInsights`；预览池条目含 `itemMeta`；`GET .../summary` 返回摘要（均需有效 JWT 与数据前置）。

**P2-MVP 抽检（可选）**：`POST .../summary/generate` 后摘要带持久化标记；`POST /feedback` 与 `GET /feedback/mine`；画像建议 accept 后 `UserProfile` 更新；`GET /copilot/.../insights`；Web `/chat` 条件展示增强层。详见 `docs/P2/P2-validation-summary.md`。

**P2.5 抽检（可选）**：按步骤命令与勾选清单执行 `docs/P2/P2.5-integration-checklist.md`（含 `/mine` 与全局 overview **403/200**、CopilotPage、`ChatPage` 摘要按钮与画像建议操作等）。

**P3 抽检（可选）**：按 `docs/P3/P3-relationship-timeline.md` 内「手动验收 Checklist」执行（`/chat/timeline`、`/final-match` 入口、`GET .../timeline` 首屏与 `messageSkip>0`、加载更多）。

详细清单与 bug 记录：

- `docs/P0/P0-acceptance-checklist.md`
- `docs/P0/P0-bugfix-list.md`

## 常见问题（部署/验收）

1. **worker batch-match：Prisma Client 未初始化**  
   - 重建 worker，确保构建含 `@peima/database` generate。  
   - `docker compose up -d --build --force-recreate worker`

2. **Web 端口 5173**  
   - 确认映射为 `0.0.0.0:5173->5173/tcp`；异常时 `docker compose up -d --build --force-recreate web`

4. **端口口径（避免开错服务）**  
   - `5173 = web`（用户端）  
   - `5174 = admin`（管理端）  
   - API 端口以 **`.env`** 的 **`API_PORT`** 与 **API 实际启动日志**为准，**勿**将某一数值当作固定默认

3. **preview-pool：`not enough candidates`**  
   - 候选不足 6 或缺少 `images`，补齐后再试。

## 当前限制 / 后续方向

- 当前为 **P0 稳定 + P1 占位 + P2-MVP + P2.5 产品化补完 + P3（关系时间线）收口 + P5（治理与运营）完成 + P6（Copilot P6.1～P6.4 + 结果层 P6.5～P6.7 + P6.8 聊天画像补全 + P6.9 该 POST 治理 + P6.10 ChatPage UX hinting）** 的研发形态，非生产级高可用/安全/可观测全套。
- **未正式接入**：统一 AI Agent、多 Agent 编排、WebSocket 实时聊天、完整生产治理、**由 Worker 驱动的全链路大模型编排**（**P6.1～P6.10** 为 Copilot 子链、读路径、独立 GET、**P6.8** 单次 POST、**P6.9** 同路径治理与 **P6.10** ChatPage 展示层增强，**不是**该编排形态）。
- **P3（关系时间线）**：**已完成**（P3-1 只读聚合 + `/chat/timeline`、P3-2 FinalMatch 第二入口、P3-3 消息分页）；**仅指该切片**，见 `docs/P3/P3-relationship-timeline.md`。
- **P5（已完成）**：轻量 RBAC 权限模型、建议中心查询/管理 API、**Admin UI 建议中心管理界面**、审计日志系统（查询/详情/导出/失败路径）、RBAC 持久化、通知中心（WebSocket + REST）、分析仪表板，以及 code review 后的 audit/history/notification/export 修复。见 `docs/P5/` 与当前仓库实现。
- **当前阶段重点**：收口，不是扩功能。P4 已完成 5 个最小切片，现阶段以验收、文档与质量固化为主。**P6.1～P6.4**（Copilot）、**P6.5～P6.7**（独立结果层）、**P6.8**（聊天画像补全）、**P6.9**（P6.8 生成治理）与 **P6.10**（ChatPage UX hinting，**不**改后端治理）已按文档收口交付；**仍未完成**者见上文「P6 暂未展开的内容」。演进规划中 Worker 自动生成、决策层模型替换、多 Agent/simulation 等仍见 `docs/P6/P6-ai-production-evolution-plan.md`。详见 `docs/P4/P4-productization-plan.md`。
- **与旧「后续产品方向」条目的对应**：原列 Analytics / Worker / 历史版本 / 建议中心 / 权限系统等，已 **分别落入 P5 / P6（及 P4 体验项）**；**P5 已做** 者（权限、建议中心、审计、通知、分析）与 **P2.5 已做** 者（全局 analytics 白名单、聊天内建议闭环、Copilot 独立只读页、摘要手动生成）仍以 README 前文为准。

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

**P2（MVP + P2.5 收口）**

- `docs/P2/P2-scope-notes.md`：P2 范围与设计原则（含 MVP 状态引用）
- `docs/P2/P2-status-summary.md`：P2-MVP 状态、边界、结论（成文于 MVP；**P2.5 增量以 README 与本清单为准**）
- `docs/P2/P2-validation-summary.md`：分模块验证方式、结论与已知限制（文首链至 P2.5 联调清单）
- `docs/P2/P2.5-integration-checklist.md`：**P2.5** 联调命令与手动验收 checklist（推荐回归时优先使用）

**P3（关系时间线 — 已完成）**

- `docs/P3/P3-relationship-timeline.md`：**整阶段收口文档**（目标与范围、交付结果、联调与验收结论、**排查过程关键问题**、已知限制、轻量后续、提交用语）；附录含能力细节、代码入口、**Git 推送前收尾清单**、手动验收 checklist

**P4（产品化补完 — 已完成 5 个最小切片，当前阶段收口）**

- `docs/P4/P4-productization-plan.md`：P4 范围与边界（历史规划参考，当前以切片收口文档为准）
- `docs/P4/P4-current-slice-status.md`：当前 P4 五个切片的阶段收口文档（当前阶段口径以此文档为准）
- `docs/P4/P4-web-conventions.md`：Web 跨模块约定（API / 文案 / sourceType）
- `docs/P4/P4-ux-checklist.md`：手动验收清单

**P5（治理与运营 — 已完成）**

- `docs/P5/P5-phase-1-implementation.md`：P5 第一阶段交付物（权限模型、API 端点、使用指南、验收清单）
- `docs/P5/P5-phase-1-merge-guide.md`：P5 第一阶段合并指南（环境验证、数据库迁移、部署检查）
- `docs/P5/P5-PHASE-2-1-COMPLETION.md`：审计日志系统交付记录
- `docs/P5/P5-PHASE-2-ARCHITECTURE.md`：P5 Phase 2 架构与实现计划
- `docs/P5/P5-operations-and-history-plan.md`：总体规划与后续演进背景

**P6（Copilot 线 + 独立切片 + P6.8 + P6.9 + P6.10 + 演进规划）**

- `docs/P6/P6-ai-production-evolution-plan.md`：**P6** 演进规划（Worker 侧编排、决策层模型替换、多 Agent/simulation 等；与 **P6.1～P6.10** 已交付内容区分）
- `docs/P6/P6.1-implementation-round1.md`：**P6.1** Copilot 真实 AI 最小实现
- `docs/P6/P6.2-copilot-llm-runbook.md`：**P6.2** Copilot 真实 LLM 运行手册
- `docs/P6/P6.3-acceptance-round1.md`：**P6.3** Copilot 首轮验收收口
- `docs/P6/P6.4-stability-closure.md`：**P6.4** Copilot 运行稳定性收口
- `docs/P6/P6.5-summary-ai-slice.md`、`docs/P6/P6.5-summary-ai-acceptance-round1.md`：**P6.5** Summary AI
- `docs/P6/P6.6-match-explanation-ai-slice.md`、`docs/P6/P6.6-match-explanation-ai-acceptance-round1.md`：**P6.6** Match Explanation AI
- `docs/P6/P6.7-final-match-primary-conclusion-round1.md`：**P6.7** Final Match Primary Conclusion 首轮收口记录
- `docs/P6/P6.8-conversation-profile-completion-round1.md`：**P6.8** Conversation Profile Completion AI 首轮收口记录
- `docs/P6/P6.9-conversation-profile-suggestion-governance-round1.md`：**P6.9** Conversation Profile Suggestion Governance 首轮收口记录
- `docs/P6/P6.10-conversation-profile-suggestion-ux-hinting-round1.md`：**P6.10** Conversation Profile Suggestion UX Hinting 首轮收口记录

## License

Private / TBD
