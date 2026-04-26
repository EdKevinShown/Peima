# P6 Round 2 Orchestrator A1/A2 验收收口

> **性质**：仅记录 Round 2 orchestrator 在 **A1 / A2** 阶段的实现落点与实机验收结果；不替代 `truth/` 与 `specs/` 文档。  
> **与 specs 对齐**：主链 vs admin 缺口、下一单点优先级见 [`specs/P6-round2-orchestration-mvp.md` §6 / §7](../specs/P6-round2-orchestration-mvp.md)（main 收口后已修订）。

---

## A1 实现到达层级

- 已从入口壳子升级为真实链路：**pool 读取 → deep-screen → prescreen v0**。
- `run-orchestration-mvp` 返回真实 envelope（含阶段状态与 `simulationQueueHint`）。
- A1 中 `aiSimulation` 明确为 `skipped`。

## A2 实现到达层级

- 在 A1 基础上，`runMode = "mvp"` 时可真实调用 **AI simulation enqueue**。
- orchestrator 返回 AI simulation 产物：
  - `simulationJobId`
  - `acceptedCandidateCount`
  - `simulationQueueActual`
- 同时返回：
  - `deeplink`
  - `finalMatchConsumptionHint`（最小真实摘要）

## Phase C v0 回归锚点（防模拟人口退回全池 6 人）

- **主锚点（自动化）**：`apps/api/test/post-pool-deep-screen-orchestrator.spec.ts` — 用例 **`runOrchestrationMvp (mvp): enqueue receives shortlist-only hint (2) when pool has 6 items`**。含义：shadow 路径可对 **6** 人做 prescreen，但 MVP 下调用 `AiSimulationV1Service.enqueue` 时，`hintSnapshot` 长度与 `shortlistBinding.shortlistCandidateUserIds` 长度均为 **shortlist 规模（本例 2）**，且 `shortlistFingerprint` 与 `computeShortlistFingerprint(shortlistCandidateUserIds)` 一致；**不依赖** LLM、DB job 行或具体是哪两个 id（由 mock shortlist 固定为 `c1`/`c2`）。
- **辅助（e2e）**：`apps/api/test/run-orchestration-mvp.e2e-spec.ts` 在 shortlist 不成立时断言显式 **`shortlist_size_lt_2`**，且不做全池 6 人 hint 回退。

## Phase C v1.0 回归锚点（10 场景评分/解释/三层链冻结）

- **10×N 全矩阵**：`apps/api/test/shortlist-scenarios-v0.spec.ts` — **`Phase C v1.0: locks full 10×N matrix (score/status/reason/riskPoint/evidenceSnippet/reviewStatus)`**（`cand_alpha` / `cand_beta`）。
- **解释全量篡改后 fourDim / decision 不变**：`apps/api/test/shortlist-four-dim-v0.spec.ts` — **`Phase C v1.0: explanation-only mutation does not change fourDim or decision (10-scene matrix)`**。
- **fourDim.rankedCandidateUserIds === decision.rankedCandidateUserIds**：`shortlist-four-dim-v0.spec.ts` — **`Phase C v1.0: fourDim.rankedCandidateUserIds === shortlistDecisionV0 (fixture b/a)`**；`shortlist-scenarios-v0.spec.ts` — **`Phase C v1.0: each candidate has 10 scenes; fourDim.rankedCandidateUserIds === decision (fixture a/b)`**。
- **同输入确定性**：`shortlist-scenarios-v0.spec.ts` — **`Phase C v1.0: same binding+items yield identical scenarios, fourDim, and decision (twice)`**；`shortlist-four-dim-v0.spec.ts` — **`Phase C v1.0: locks scenarios -> fourDim -> decision chain for same input (deterministic)`**。
- **四维公式版本（审计）**：`shortlist-four-dim-v0.spec.ts` 中 `rankingFormulaVersion` 断言为 **`shortlist_four_dim_formula_v6`**（与 **10 场景** 下 `longTermStability` 六分母均值口径一致；见 `SHORTLIST_FOUR_DIM_RANKING_FORMULA_V0`）。

## 实机验收通过点

- `previewPool / deepScreen / prescreen` 在 orchestrator 路径下真实跑通。
- `simulationQueueHint` 为真实值。
- `runMode = "mvp"` 下可真实 enqueue AI simulation。
- 返回体包含 `simulationJobId`、`acceptedCandidateCount`、`simulationQueueActual`。
- 返回体包含 `deeplink` 与 `finalMatchConsumptionHint`。
- 现有 AI simulation job 查询接口可查到真实 job 产物。

## Final Match 最小消费层接入（very small）

- Final Match 页面已完成最小 sidecar 消费接入，形成与 orchestrator A2 deeplink 对齐的当前闭环。
- 当前消费来源：
  - URL query 中的 `aiSimJobId`
  - `getAdminAiSimulationV1Job(aiSimJobId)` 查询结果
- 页面新增低权重内部状态块：`AI 模拟侧车状态（内部）`。
- 最小展示字段：
  - `aiSimJobId`
  - `jobStatus`
  - `candidateInJob`
  - `sidecarReady`
- `sidecarReady` 判定条件：
  - `hasJobId`
  - `hasReadableJob`
  - `candidateInJob`
- 明确边界：仅 sidecar / hint 消费，不参与 `finalScore`，不替代主结论。

### `finalMatchConsumptionHint` 调用方转交（A）与 sessionStorage 消费 — v0 收口

- **调用方**：预览池页在 **admin 能力**（`batchMatchTrigger`）下提供内部入口；成功调用 `POST /admin/post-pool-deep-screen/run-orchestration-mvp`（`runMode=mvp`）后，将 truth v0 **最小子集**写入 `sessionStorage`（键：`peima:finalMatchConsumptionHint:v0:<aiSimJobId>`），再跳转 orchestrator 返回的 `deeplink`。
- **Final Match**：进入页后按 URL `aiSimJobId` 读取对应 key，按 [`P6-final-match-consumption-hint-v0.md`](../truth/P6-final-match-consumption-hint-v0.md) 校验（`source`、`orchestrationSchemaVersion`、`simulationJobId` 与 URL 一致等）；通过则在内部区展示至少一项静态编排摘要（如 `poolId`、`runMode`、`hint.ready`、prescreen `bucketCounts`）；失败则静默降级。
- **并存**：与既有 **`aiSimJobId` + job 查询** 的运行态 sidecar **并行**；`sidecarReady` 语义不变，**不以** `hint.ready` 代替。
- **主链**：不改变 **`MatchResult.finalScore`** 与 worker 主公式；实现与 truth v0 对齐，**无**新后端 API、**无** hint 落库。

### Preview Pool 内部编排可选串联 `runJob` — 收口

- **位置**：仍在预览池页 **admin 内部**编排按钮链：`run-orchestration-mvp`（enqueue）成功后，在写 consumption hint 与跳转 `deeplink` **之前**，可按开关可选调用 **`POST /admin/ai-simulation/v1/jobs/:jobId/run`**（封装见 `apps/web/src/api/ai-simulation-v1.ts`）。
- **开关**：仅当 web 环境 **`VITE_PREVIEW_POOL_ORCH_CHAIN_RUN_JOB=1`** 且响应中存在非空 **`simulationJobId`** 时串联 run；**关闭或未设置时与改前行为一致**（不调 run、不增请求）。
- **超时与失败**：run 使用 **`AbortController`** 超时（默认 **30s**，可用 **`VITE_PREVIEW_POOL_ORCH_RUN_JOB_TIMEOUT_MS`** 覆盖）；超时、非 2xx 或其它失败 **不阻断**后续流程，仍写 hint（若有）并 **`location.assign`** 进入 Final Match；失败信息以 **`console.warn`（`[PreviewPool orchestration]`）** 提示，便于内部排障。
- **收益**：开关开启时可 **减少** 编排后再去别处 **手点一次 run** 的操作；到达 Final Match 时 job **更易已执行过 run**（仍依赖 LLM 时延，非保证）。
- **边界**：**不**改 worker 主公式、**不**写 **`MatchResult.finalScore`**、**不**新增后端 API、**不**把 run 内嵌进 orchestrator 服务端语义（编排仍为 enqueue-only；串联仅在前端内部路径）。

### 匹配等待页 → 预览池 Round 2 编排（admin 深链）— 收口

- **`MatchingWaitingPage.jsx`**：在既有「**管理员专用**」区块内增加一行深链，文案为 **`Round 2 编排（内部）`**，目标 **`/preview-pool?userId=<当前 viewer>`**（`userId` 与页面 `resolveUserId` 一致），用于从匹配等待进入已收口的 **预览池 admin 编排链**。
- **Gate**：与 **batch-match** 同源，复用 **`GET /admin/capabilities` → `batchMatchTrigger === true`**；**非 admin 不可见**（整块管理员区域不渲染，与改前一致）。
- **主等待逻辑**：**不**改变入队、刷新、`ready` 时跳转 Final Match、管理员 / 测试 batch-match 等既有行为。
- **性质**：**非** C 端正式功能入口；同段文案标明为 admin 内部编排链导航。

## 当前明确未做

- 不改 worker 主公式。
- 不写 `MatchResult.finalScore`。
- 不做前端大规模改版（仅最小内部状态块接入）。
- 不在本收口内扩展 B 线细项。
- **本轮 A 最小实现刻意未做**：非 admin 正式产品入口；hint 只读 API；envelope 全量写入 `sessionStorage`；跨域 / B1 扩展；以 hint 替代 job 运行态或主结论。
- **本轮 run 串联刻意未做**：后端 orchestrator 内嵌同步 run；worker 异步消费改造；C 端正式入口；数据库持久化 run 开关；B1 扩展。
- **本轮匹配等待深链刻意未做**：向非 admin / 全量 C 端开放该入口；新后端 API；改动 worker / `finalScore`；将链接做成正式主路径文案；改动 `specs/P6-round2-orchestration-mvp.md` 正文（本次仅 acceptance 收口本段）。

---

*本文路径：`docs/P6/acceptance/P6-round2-orchestrator-a1-a2-acceptance.md`*
