# P6 静态层 → shortlist → AI sidecar → Final Match 最小消费（main 真值）

> **本文性质（必读）**
>
> * **仅描述当前 `main` 已实现行为**（预览池 / post-pool 编排 / shortlist 契约 / AI simulation v1 job 与侧车 / Final Match 只读展示）。
> * **不代表未来路线或产品承诺**；下文「升格为主链的前提」仅为 **工程与产品上的必要条件清单**，不构成排期或设计批复。
> * **若与代码或自动化测试冲突，以当前实现与回归锚点为准**；本文应随实现修正。

---

## 1. 范围与读者

* **在范围内**：从 **静态编排层**（预览池读取 → post-pool deep-screen → prescreen → Round 2 orchestrator MVP）到 **shortlist 契约与 binding**、**AI simulation v1 job**（含三层 JSON 侧车）、再到 **Final Match** 通过 `aiSimJobId` **只读消费**的端到端职责划分与 **主链 / 侧车边界**。
* **不在范围内**：未来若将 AI 决胜 **升格为** 主匹配唯一结论的详细设计、worker 内部公式变体、非 admin 的正式产品入口扩展、orchestrator 与侧车之外的全量 B 线。

**读者**：需要在不改主链的前提下扩展 Round 2 / 预览池 / Final Match 的产品与工程人员。

---

## 2. 分层总览

| 分层 | 一句话 |
|------|--------|
| **静态层** | 基于预览池与问卷画像，对候选人集合做 **维度深筛 + prescreen**，在 MVP 模式下 **解析出 2～3 人 shortlist** 并可选 **触发 AI job 入队**；**不**产出 `MatchResult`、**不**改写 worker 主公式。 |
| **shortlist 层** | 从预览池派生的 **只读契约**（固定 schema）给出 **有序** 2～3 个 `candidateUserId`，并导出 **`shortlistFingerprint`**；与 `hintSnapshot` 队列 **等长同序**，形成入队时的 **`shortlistBinding`**。 |
| **AI 模拟层** | `AiSimulationV1Job` + `AiSimulationV1Item`：对 binding 内每人跑 **transcript-lite + evaluator**，job 完成后在 **一致性门槛**满足时写入 **三层 JSON 侧车**；侧车 **不**写入 `MatchResult`。 |
| **Final Match 只读消费层** | 页面在已有 **主链匹配结果**（`getMatchingResult`）之外，用 URL **`aiSimJobId`** 调 **admin**  job 查询接口拉取 job JSON，**只读解析** scenarios / fourDim / decision，在 **内部低权重区块** 展示；缺失或不一致时 **降级或警示**，不替代主结论。 |

---

## 3. 静态层职责

### preview pool / deep-screen / prescreen / orchestrator 各负责什么

* **Preview pool**：持久化的 **预览池及槽位候选人**（`PreviewPool` / `PreviewPoolItem`）；编排从池中解析候选人 id 集合（可被 `candidateUserIdsOverride` 覆盖用于 shadow）。
* **Deep-screen（post-pool 维度批）**：对解析出的候选人跑 **G1-R 等维度规则**，得到 **通过 / 未通过** 集合（`dimensionMatchSummary`）；用于 shadow 全量路径与后续 shortlist **资格过滤**（shortlist 成员必须均在 passed 集合内）。
* **Prescreen v0**：在 shadow 中可对 **全量候选** 跑 batch（若条件满足）；在 **MVP shortlist 决议** 中仅对 **shortlist 的 2～3 人** 再跑 **`purpose: "shadow"`** 的 batch，用于构造 **仅含 shortlist 的 `simulationQueueHint`**（每人 `bucket` 不得为 `demote`）。
* **Orchestrator（`runOrchestrationMvp`）**：串联 **shadow**（池 → 维度 → prescreen），在 **`runMode === "mvp"`** 且 shortlist 条件满足时调用 **`AiSimulationV1Service.enqueue`**；返回 **envelope**（阶段摘要、`simulationQueueHint`、`simulationQueueActual`、`deeplink`、`finalMatchConsumptionHint` 等）。**默认仍为 enqueue-only**（不在服务端同步 `runJob`）。

### 静态层的目标

* **不是**直接输出「最终 AI winner」给主产品结论；**而是**把进入 LLM 模拟的候选人 **压到 shortlist 2～3 人**，并保证 **不静默回退到全池 prescreen hint**（实现注释与回归锚点明确）。

### 主链已有行为 vs 仅为 sidecar 准备

* **主链已有**：用户匹配队列 / worker 产出 **`MatchResult`**（含 `finalScore` 等）、Final Match 通过 **`userId`** 拉取 **最新 `MatchResult`** 作为主展示数据源之一。
* **sidecar 相关准备**：预览池 **shortlistContract**、orchestrator 对 **AI job 入队** 的 gating、返回 **`simulationJobId` / deeplink / consumption hint`**；这些 **增强** Round 2 内部闭环，**不改变**既有 worker 写 `MatchResult` 的路径。

---

## 4. shortlist 的角色

* **为什么存在**：在 **池规模可大于 2～3** 的前提下，把 **LLM 成本与延迟** 收敛到可控的小集合，并与 **预览池产品语义**（锁定槽位 / 契约）对齐。
* **为什么 AI 只在 2～3 人里决胜**：入队校验要求 **`shortlistBinding.shortlistCandidateUserIds` 长度 2 或 3** 且与 **`hintSnapshot` 解析队列一一对应**；侧车 builders 亦按短名单规模实现。**无**全池 6 人 hint 的静默扩展（MVP 解析失败则 skip enqueue，见 orchestrator `resolveShortlistSimulationForMvp`）。
* **`shortlistFingerprint` 的意义**：对 **有序** shortlist id 列表的稳定哈希式指纹，用于 **binding 与各侧车 JSON** 绑定同一短名单版本，防止错配或部分篡改后仍被误读为一致。
* **`binding` 为什么重要**：它是 **入队时刻的契约快照**（`previewPoolId`、`shortlistSchemaVersion`、`shortlistCandidateUserIds`、`shortlistFingerprint`）；**全 job 的 LLM 队列与侧车计算**均以此为边界，而非以运行时池内其它候选人为准。
* **对 AI 输入边界的约束**：`hintSnapshot` 长度与顺序 **必须等于** binding 中的 id；**items** 仅覆盖这些人；侧车 ranked 集合与 binding 候选人集合 **多重集一致**（详见文档 2）。

---

## 5. AI 模拟层职责

* **AI job 负责什么**：为 binding 内每位候选人创建 **item**，拉取双方问卷画像，按 **runSpec** 调用 LLM，写入 **`transcriptLite` / `evaluator`**（或失败码）；`runJob` 结束后在 **`rankConsistent`** 等条件下写入 **三层侧车 JSON**。
* **三层侧车各自责任**（摘要；细则见文档 2）：
  * **`shortlistScenariosV0`**：**10×N** 场景级 **证据与解释字段**（固定 `SHORTLIST_SCENE_KEYS_V0` 矩阵）。
  * **`shortlistFourDimV0`**：由场景 **数值分 + succeeded 门控** 聚合四维与 **`comparison.rankedCandidateUserIds`**。
  * **`shortlistDecisionV0`**：由 **item evaluator 分** 独立得到 **`rankedCandidateUserIds`** 与 **`chosenCandidateUserId`**（恒为 `[0]`）。
* **为什么是 sidecar**：三者落 **`AiSimulationV1Job` 的 JSON 列**，Prisma 注释明确 **不写 `MatchResult`**；与 **batch 匹配 worker** 主链路 **解耦**。
* **决胜结果如何只读存在**：DB 仅存 JSON；**无**将 `chosenCandidateUserId` 写回 **`MatchResult`** 或 **worker 状态机** 的实现路径。

---

## 6. sidecar 与主链边界

必须同时成立（当前实现）：

* **不改 worker 主公式**：匹配 worker / 主评分逻辑 **不读取** AI simulation job 侧车。
* **不改 `MatchResult.finalScore`**：AI simulation 模块与 orchestrator **不更新** `MatchResult` 行。
* **不新增第二套「主链」匹配 API**：侧车消费走 **既有 admin AI job 查询** + Final Match 内部 UI；**不**把侧车提升为 `GET /matching/result` 的替代数据源。
* **Final Match 当前只是只读消费 sidecar**：`getAdminAiSimulationV1Job(aiSimJobId)` 仅用于 **内部区块**；**`sidecarReady`** 与主卡片 **`finalScore`** **相互独立**。
* **哪些结果不给主链写回**：`shortlistScenariosV0` / `shortlistFourDimV0` / `shortlistDecisionV0` / 以及 item 级 **`evaluator` 用于侧车聚合的部分** — **均不**回写 `MatchResult`。
* **为何当前不能把 AI 决胜直接当主链最终结果**：（1）**无**持久化与权限模型将 AI winner 与 **`MatchResult.candidateUserId`** 绑定；（2）**Chat** 等仍取 **最新 `MatchResult`**；（3）侧车依赖 **LLM 可用性 / rank 一致性门槛**，与 **确定性 worker 主结论** 产品语义未对齐。

---

## 7. Final Match 当前消费方式

* **读取 `aiSimJobId` / job**：URL query **`aiSimJobId`**；在 **`getMatchingResult(userId)`** 已有 **`result.candidateUserId`** 后触发 **`getAdminAiSimulationV1Job(aiSimJobId)`**（admin 能力前提与既有页面门控一致）。
* **只读消费 scenarios / fourDim / decision**：`parseShortlistDecisionV0` → `parseShortlistFourDimV0` → `parseShortlistScenariosV0` 链式解析；UI 以 **`details` 折叠块** 展示 **schemaVersion、fingerprint、ranked、一致性布尔量** 等。
* **缺失或不一致时**：列为 null → **`unavailable`**；字段非法 → **`invalid`** + 固定文案；指纹或 ranked 与对端不一致时可在 **`state === "ok"`** 下仍显示 **琥珀色低权重警示**（不阻塞主结果阅读）。
* **为何是低权重内部侧车**：文案与布局定位为 **内部可观测性**；**`finalMatchConsumptionHint`**（sessionStorage）为 **编排摘要**，与 **`sidecarReady`** **并行**，**互不替代**（acceptance 已写明）。

---

## 8. 升格为主链的前提条件（清单，非承诺）

若未来要将 AI 短名单决胜 **升格为** 用户可见的 **主匹配结论** 之一，至少需要（**不表示已排期或已批准**）：

* **Schema 稳定**：`shortlistBinding`、三层侧车、`hintSnapshot` 等 **版本化契约**长期兼容或可迁移。
* **排名一致性长期稳定**：`fourDim.rankedCandidateUserIds` 与 `decision.rankedCandidateUserIds` **同构**策略经线上数据验证；异常时有明确 **产品语义**（而非仅 `DbNull`）。
* **场景口径稳定**：`SHORTLIST_SCENE_KEYS_V0` 与 **10×N** 矩阵规则变更可控、可公告。
* **回归体系稳定**：orchestrator、侧车 builders、Final Match 解析 **均有自动化锚点**，CI 可阻断回归。
* **产品决策明确**：主卡片是否展示 AI winner、与 **`MatchResult`** 冲突时谁优先、失败降级策略。
* **用户可见策略明确**：非 admin 是否可读侧车、隐私与 **解释文案** 合规边界。

---

## 9. 与文档 / 代码 / 测试锚点

### 文档（Truth）

* **文档 1（场景与四维输入）**：[`P6-shortlist-scenarios-v0-rules-master.md`](./P6-shortlist-scenarios-v0-rules-master.md)
* **文档 2（侧车字段 / fingerprint / rankConsistent / Final Match 解析）**：[`P6-shortlist-sidecars-output-rules-master.md`](./P6-shortlist-sidecars-output-rules-master.md)
* **编排消费 hint（Final Match 校验协议）**：[`P6-final-match-consumption-hint-v0.md`](./P6-final-match-consumption-hint-v0.md)（只读校验与静默降级，**不**替代 job 查询）

### Acceptance

* **`docs/P6/acceptance/P6-round2-orchestrator-a1-a2-acceptance.md`**
  * **Phase C v0**：shortlist-only hint（2 人）、`shortlistFingerprint` 与 `computeShortlistFingerprint` 一致、**不依赖**全池 6 人；`shortlist_size_lt_2` 等 e2e 行为。
  * **Phase C v1.0**：**10 场景冻结锚点** — 侧车链、解释篡改不改 fourDim/decision、**`fourDim.rankedCandidateUserIds === decision.rankedCandidateUserIds`**、同输入确定性、**`shortlist_four_dim_formula_v6`**（矩阵为 **10×N**；见 acceptance **「Phase C v1.0 回归锚点」** 小节）。
  * **Final Match 最小消费**：`aiSimJobId`、`getAdminAiSimulationV1Job`、`sidecarReady` 定义、**不参与 `finalScore`**。
  * **说明**：当前该 acceptance **未单独设立「Phase D」章节**；若后续增补，应与本总表及文档 1/2 **交叉引用**同一组实现文件与测试。

### 关键实现文件

* **编排入口**：`apps/api/src/modules/post-pool-deep-screen/post-pool-deep-screen-orchestrator.service.ts`（`runShadow`、`runOrchestrationMvp`、`resolveShortlistSimulationForMvp`）
* **预览池 shortlist 契约**：`apps/api/src/modules/preview-pool/preview-pool.service.ts`（`buildShortlistContractV0ForPool` 等）
* **AI 入队与 runJob**：`apps/api/src/modules/ai-simulation-v1/ai-simulation-v1.service.ts`
* **Admin 路由**：`apps/api/src/modules/admin/admin.controller.ts`（`post-pool-deep-screen/run-orchestration-mvp`、`ai-simulation/v1/...`）
* **Final Match**：`apps/web/src/pages/FinalMatchPage.jsx`

### 关键测试文件

* `apps/api/test/post-pool-deep-screen-orchestrator.spec.ts`（含 Phase C v0 shortlist-only enqueue 主锚点）
* `apps/api/test/run-orchestration-mvp.e2e-spec.ts`（`shortlist_size_lt_2` 等）
* `apps/api/test/shortlist-scenarios-v0.spec.ts`、`apps/api/test/shortlist-four-dim-v0.spec.ts`（**Phase C v1.0** 冻结用例名）

---

## 10. 变更纪律

| 变更类型 | 建议同步 |
|----------|----------|
| **改静态 shortlist 规则**（契约 schema、池→shortlist 人数、与 deep-screen / prescreen 的 gating） | `preview-pool` 相关实现与常量；`post-pool-deep-screen-orchestrator.service.ts`；`post-pool-deep-screen-orchestrator.spec.ts` / e2e；acceptance **Phase C v0** 段落；**本文 §3–§4、分层总表** |
| **改 AI sidecar 规则**（场景键、四维公式、decision 排序、`rankConsistent`、落库 null 策略） | **文档 1、文档 2**；`shortlist-*.ts`、`ai-simulation-v1.service.ts`；`shortlist-*.spec.ts`；acceptance **Phase C v1.0**；**本文 §5–§6** |
| **改 Final Match sidecar 消费**（解析条件、`sidecarReady`、展示字段、consumption hint） | `FinalMatchPage.jsx`；若有协议变更则 **`P6-final-match-consumption-hint-v0.md`**；acceptance **Final Match** 小节；**本文 §7**；必要时的 **E2E / 前端手测清单** |

---

## 附录：分层职责总表

| layer | owns | reads_from | writes_to | must_not |
|-------|------|------------|-----------|----------|
| **静态层**（预览池 + post-pool deep-screen + prescreen + orchestrator MVP） | 池候选解析、维度批、prescreen 结果、MVP envelope（含 hint / deeplink / consumption hint）；**决议是否调用 enqueue** | `PreviewPool`/`PreviewPoolItem`、`UserProfile`、`PrescreenV0` 输入、orchestrator DTO | **`AiSimulationV1Job` 初始行**（仅 MVP 且 shortlist ok 时，经 `AiSimulationV1Service.enqueue`）；**HTTP 响应 JSON**；前端可另写 **sessionStorage consumption hint**（由调用方页面完成，非 API 写 DB） | 写 **`MatchResult`**；改 **worker 主公式**；**静默**把 AI hint 扩为全池规模 |
| **shortlist 层**（契约 + binding） | 有序 2～3 人、`shortlistFingerprint`、与 `hintSnapshot` **对齐的** `shortlistBinding` | 预览池 shortlist 契约、orchestrator shadow **passed** 集合、shortlist 上 prescreen **rows** | **随 enqueue** 写入 job 的 **`shortlistBinding`**（及与之一致的 **`hintSnapshot`**） | binding 与 hint **长度/顺序漂移**；shortlist 成员 **不在** passed 集合仍强行 enqueue |
| **AI 模拟层**（`AiSimulationV1Job` / items + 侧车） | Per-item LLM 产物、job 状态、**条件满足时** 三层 JSON 侧车 | `hintSnapshot`、`shortlistBinding`、`AiSimulationV1Item` 行 | **`AiSimulationV1Item`** 字段、**`AiSimulationV1Job`**（`jobStatus`、`shortlistScenariosV0` / `shortlistFourDimV0` / `shortlistDecisionV0` 等） | 写 **`MatchResult.finalScore`**；以侧车 **反向驱动** worker |
| **Final Match 只读消费层** | URL `aiSimJobId`、job 拉取、三 parse、内部 UI 警示 | `userId`、`getMatchingResult`、`getAdminAiSimulationV1Job`、`sessionStorage` consumption hint | **无**服务端主链写回（仅用户浏览态） | 用侧车 **替换** 主匹配结论数据源；在无权限时 **伪造** admin job 访问 |

---

*本文路径：`docs/P6/truth/P6-matching-static-vs-ai-sidecar-rules-master.md`*
