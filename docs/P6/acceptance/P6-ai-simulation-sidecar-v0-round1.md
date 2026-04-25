# AI 模拟侧车 v0 — Round 1 实现收口（审核 / 复核工作台）

> **性质**：首轮 **仅前端** 收口说明；**不替代** [`P6-ai-simulation-v1-implementation-notes.md`](../truth/P6-ai-simulation-v1-implementation-notes.md) 的契约定义，也**不**替代 [`P6-ai-simulation-v1-round1-acceptance-conclusion.md`](./P6-ai-simulation-v1-round1-acceptance-conclusion.md) 的实机验收结论。  
> **范围**：`FinalMatchPage` 上的 **AI 模拟 v1 内部侧车**；后端仍只用既有 **`GET /admin/ai-simulation/v1/jobs/:jobId`**，**未**扩主链、preview pool、worker、`MatchResult`。

---

## 1. 改了哪些前端文件

| 文件 | 说明 |
|------|------|
| `apps/web/src/api/ai-simulation-v1.ts` | 新增：`getAdminAiSimulationV1Job(jobId)`，请求 Admin GET job。 |
| `apps/web/src/components/review/AiSimulationSidecarV0.jsx` | 新增：侧车展示组件（成功 / 失败 / 空 / 排队 / 无权限 / 不在 job 内）。 |
| `apps/web/src/pages/FinalMatchPage.jsx` | 读取 URL `aiSimJobId`、在匹配结果就绪后拉 job、于「匹配复审与补充解读」区块 **顶部** 挂载侧车。 |

---

## 2. 侧车如何通过 `aiSimJobId` + `candidateUserId` 绑定当前候选

1. **页面路径**：`/final-match?userId=<viewerId>&aiSimJobId=<simulationJobId>`（`userId` 与既有匹配结果页一致）。  
2. **`candidateUserId`**：来自 **`getMatchingResult(userId)`** 返回的当前 **`result.candidateUserId`**（与页面上正在展示的「本轮对方」一致）。  
3. **`aiSimJobId`**：来自 URL 查询参数，对应 Admin **`enqueue`** 返回的 **`simulationJobId`**。  
4. **绑定逻辑**：前端调用 **`GET /admin/ai-simulation/v1/jobs/:aiSimJobId`**，在响应 **`results[]`** 中 **`find` `candidateUserId === result.candidateUserId`** 的那一条 item，作为本侧车的唯一数据源。

若 job 中 **没有** 该 `candidateUserId`，侧车进入 **「当前候选不在该模拟 job 中」** 说明态（不猜其它字段）。

---

## 3. 各态分别是什么

| 状态 | 条件（摘要） | 侧车表现 |
|------|----------------|----------|
| **空态 · 未关联 job** | URL **无** `aiSimJobId` | 提示未关联模拟 job；说明可追加 `aiSimJobId` 参数。 |
| **空态 · 等待候选** | 有 `aiSimJobId` 但匹配结果尚未带出 `candidateUserId` | 短句等待对方 ID（一般极短）。 |
| **加载** | 已具备 `aiSimJobId` 与 `candidateUserId`，正在请求 GET job | 「加载模拟 job…」。 |
| **无权限** | GET job 返回 **403**（非 Admin 白名单或无权） | 固定说明：需 Admin 白名单与有效登录；不影响页面上方匹配结论。 |
| **不在 job 内** | GET 成功但 **`results` 中无对应 `candidateUserId`** | 说明对方不在该 job 队列；展示 jobId 便于核对。 |
| **排队 / 运行中** | 匹配到的 item **`status` 为 `queued` / `running`** | 中文说明 + **「刷新状态」**（再次 GET）。 |
| **成功** | **`status === succeeded`** 且 `evaluator` 结构可用 | 展示 `simulationRankScore`、`continue_recommendation`、`risk_tags`、`mitigation_hints`（默认仅首条，可展开其余）；`transcriptLite` 放在 **默认折叠** 的 `<details>` 内。 |
| **失败** | **`status === failed`** | 展示 `errorCode`；若为 **`schema_validation`** 且存在 **`failureDetail.path` / `reason`** 则展示；否则提示无字段级 failureDetail；可提供刷新。 |

---

## 4. 最小手工验收步骤

1. 使用 **已在 `PEIMA_ADMIN_USER_IDS` 的账号** 登录 Web，保证 token 有效。  
2. 用 Admin 路径完成一次 **AI 模拟 v1 enqueue → run**，记下 **`simulationJobId`**，并确认 **`simulationQueueActual`** 中含当前要看的 **`candidateUserId`**。  
3. 打开：  
   **`/final-match?userId=<viewerId>&aiSimJobId=<simulationJobId>`**  
   其中 **`viewerId`** 须与创建 job 时的 **`viewerUserId`** 一致，且该 viewer 的 **`getMatchingResult`** 当前 **`candidateUserId`** 须落在该 job 的 **`results`** 中。  
4. **成功路径**：侧车出现 evaluator 四字段 + 折叠 transcript；缓解提示仅一条时无「还有 N 条」按钮。  
5. **排队路径**：若 item 仍为 `queued`/`running`，点「刷新状态」直至 `succeeded` 或 `failed`。  
6. **失败路径**（若有）：`schema_validation` 时核对 **`failureDetail`** 与 **GET job JSON** 一致。  
7. **无 `aiSimJobId`**：侧车仅显示未关联说明，整页匹配区仍正常。  
8. **非 admin 账号**：GET 403，侧车显示无权限说明，页面其它功能不受影响。

---

## 5. 首轮手工验收结果（Round 1）

首轮已对侧车 **核心展示态** 做手工核对，结论如下：

| 验收项 | 结果 |
|--------|------|
| **成功态** | **已通过**：`succeeded` 且 evaluator 可用时，四分块与折叠 transcript 等行为符合 §3 / §4 预期。 |
| **空态** | **已通过**：无 `aiSimJobId`（或未关联 job）时，侧车仅提示关联方式，**不**影响主内容区加载与展示。 |
| **无权限态** | **已通过**：非白名单或 GET job **403** 时，侧车展示无权限说明，**不**阻断或改写上方匹配结果与既有复审流程。 |

**边界**：侧车仍为 **internal-only**（依赖 Admin GET、URL 手工带 `aiSimJobId`）；**不**写入 `MatchResult`、**不**改 worker、**不**回流 preview pool，**不改变**主匹配链语义与数据。

---

## 6. Round 1 internal pilot 总收口（AI 模拟 v1 + 侧车）

本轮 **internal pilot** 在「主链可跑、schema 与 `failureDetail`、侧车接入、prompt 语义」上已收口，最后一笔文档结论如下：

| 项 | 结论 |
|----|------|
| **Prompt 语义纠偏** | **已通过**：`transcript_lite` 对新 job 已回到 **关系匹配后首次私聊** 语境，不再稳定滑向面试/招聘/绩效话术；详见 [`P6-ai-simulation-v1-round1-acceptance-conclusion.md`](./P6-ai-simulation-v1-round1-acceptance-conclusion.md) **§3.2**。 |
| **旧 job 内容** | **落库快照**：prompt 更新 **不**回溯改写已持久化的 **`transcriptLite` / `evaluator`**；旧 job 保留旧文本 **属预期**；要比对新语义须 **新开 job** 或只看新 run 产生的 item。 |
| **当前剩余观感** | **非场景错误**：偶发 **模板感偏强、轮次多样性一般**，留待后续用轻量 prompt 或采样策略再优化，**不**改变本轮「场景纠偏到位」的结论。 |

---

## 7. AI 模拟 / 审核侧车 internal workflow v0（定义）

> **范围**：描述 **Round 1 当前** 内部如何真正把「模拟结果」接到「审核页侧车」；**不**改代码、**不**扩主链、**不**改 worker / `MatchResult` / preview pool。

### 7.1 角色与链路

| 步骤 | 谁 | 做什么 |
|------|-----|--------|
| **触发模拟** | 具备 **Admin 白名单** 的内部人员（JWT 有效），通过 **HTTP 工具或脚本** 调用 **`POST /admin/ai-simulation/v1/enqueue`**，必要时 **`POST .../jobs/:jobId/run`**。 |
| **拿到 `simulationJobId`** | **同一触发方**（或由其把 id 交给他人）：从 **enqueue 响应**读取 **`simulationJobId`**。 |
| **在 FinalMatchPage 看侧车** | 打开审核页的 **内部审核 / 复核人员**（通常也需 **Admin token** 才能 GET job）：浏览器访问 **`/final-match?userId=<viewerUserId>&aiSimJobId=<simulationJobId>`**；页面用 **`getMatchingResult`** 的 **`candidateUserId`** 与 job 的 **`results[]`** 对齐后渲染侧车。 |
| **看完后的内部使用** | **只读参考**：用于内部讨论、备注、是否继续人工跟进；**不**自动写回业务库、**不**改池顺序、**不**改 worker 分或 `MatchResult`；与 [`P6-ai-simulation-v1-implementation-notes.md`](../truth/P6-ai-simulation-v1-implementation-notes.md) **附录 A** 的 `failureDetail` 定点排障并列使用。 |

### 7.2 当前最别扭的一点

**`simulationJobId` 与审核 URL 的手工拼接**：enqueue 在 **API/终端侧**，侧车在 **浏览器**；中间无系统生成的 **一键深链**，易抄错 id、或 **`viewer` / `candidate` 与当前 `getMatchingResult` 不一致** 导致「不在该模拟 job 中」。

### 7.3 最值得先补的一个最小体验改进

**消灭或缩短「手工拼 `aiSimJobId`」**：在 Admin 成功响应旁增加 **「复制 Final Match 链接」**（预填 `userId` + `aiSimJobId`），或一页仅内部的 **URL 生成器**（输入 jobId + viewerId → 输出完整 URL）；**不**要求先做「按 viewer 自动查最新 job」等后端检索。最小方案定义见 [`P6-final-match-deeplink-v0.md`](../specs/P6-final-match-deeplink-v0.md)。

---

*本文路径：`docs/P6/acceptance/P6-ai-simulation-sidecar-v0-round1.md`*
