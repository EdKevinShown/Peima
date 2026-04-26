# P6 shortlist 三层侧车与 binding 输出规则（main 真值）

> **本文性质（必读）**
>
> * **仅描述当前 `main` 已实现行为**（API 侧车写入、Prisma 列、Final Match 只读解析与展示）。
> * **不代表未来路线或产品承诺**；若与路线图或口头设计不一致，以本文记录的实现为准。
> * **若与代码或自动化测试冲突，以当前实现与回归锚点为准**；本文应随实现修正，而非反过来要求代码迁就过时描述。

---

## 1. 范围与读者

* **在范围内**：`AiSimulationV1Job` 上 **Phase C shortlist contract binding**（`shortlistBinding`）与 **三层 JSON 侧车**（`shortlistScenariosV0`、`shortlistFourDimV0`、`shortlistDecisionV0`）的字段含义、产出链、**fingerprint / ranked / chosen** 规则、**一致性门槛与降级**、Final Match **只读消费**行为，以及与 Prisma / 关键源码 / 测试 / acceptance 的**锚点对照**。
* **不在范围内**：worker 主链、`MatchResult.finalScore`、主结论公式、orchestrator 全量 envelope、LLM prompt 细节、非 shortlist 的 AI simulation 主流程。

**读者**：需要核对「侧车落库长什么样、何时为 null、UI 如何警示」的后端 / 前端 / 测试维护者。

---

## 2. 对象总览

### shortlistBinding（契约锚，非「侧车产出」但与侧车强相关）

* **语义**：入队时随 job 写入的 **shortlist 契约快照**：预览池 id、短名单 schema 版本、**有序**候选人 id 列表、由列表导出的 **shortlistFingerprint**。
* **与 hint 的关系**：必须与同一 job 的 `hintSnapshot` 解析队列 **长度与顺序**一致（入队校验）；侧车计算中的「期望短名单成员」与 fingerprint 校验均以此为准。
* **持久化**：`AiSimulationV1Job.shortlistBinding`（JSON）；job 完成时 **不在** `runJob` 的 `finally` 中被清空（与三层侧车不同）。

### shortlistScenariosV0

* **语义**：将每个 shortlist 候选人的 **`SHORTLIST_SCENE_KEYS_V0` 固定 10 个 sceneKey** 各映射为一行「场景分 + 状态 + 固定文案型解释字段」的 **证据侧车**（`shortlist_scenarios_v0`）。
* **持久化**：`AiSimulationV1Job.shortlistScenariosV0`（JSON）。

### shortlistFourDimV0

* **语义**：在 **全量场景行成功** 且矩阵完整的前提下，仅从场景的 **数值 `score` + `status` 门控** 聚合出每人 **四维** 与 **全短名单排序** `comparison.rankedCandidateUserIds`（`shortlist_four_dim_v0` + 固定 `rankingFormulaVersion`）。
* **持久化**：`AiSimulationV1Job.shortlistFourDimV0`（JSON）。

### shortlistDecisionV0

* **语义**：仅从 **binding + 各 item 的 evaluator（`simulationRankScore`）** 得到短名单内 **全成功** 时的 **决胜排序** `rankedCandidateUserIds` 与 **`chosenCandidateUserId = rankedCandidateUserIds[0]`**；可附带胜者 `confidenceTier`（可选）。
* **持久化**：`AiSimulationV1Job.shortlistDecisionV0`（JSON）。

**依赖关系（实现顺序）**：`tryBuildShortlistScenariosV0` →（若 scenarios 非 null）`tryBuildShortlistFourDimV0(scenarios)`；`tryBuildShortlistDecisionV0` **并行地**仅从 binding+items 构建。**三者能否同时落库**由下文 `rankConsistent` 门槛决定。

---

## 3. 三层侧车字段总表

| artifact | schemaVersion（常量值） | storage（`AiSimulationV1Job` 字段） | producer | consumer | core_fields | responsibility |
|----------|-------------------------|-------------------------------------|----------|----------|---------------|----------------|
| shortlistBinding（契约 JSON，侧车链输入） | `shortlistSchemaVersion` 字段（如 `preview_pool_shortlist_contract_v0`） | `shortlistBinding` | 入队路径：`AiSimulationV1Service.enqueue`（写入）；`computeShortlistFingerprint` 用于校验 | `runJob` finally 中 `tryBuildShortlistScenariosV0` / `tryBuildShortlistDecisionV0`；API `formatJobResponse`；Final Match `parseShortlistDecisionV0`（比对 fingerprint） | `previewPoolId`、`shortlistSchemaVersion`、`shortlistCandidateUserIds[]`、`shortlistFingerprint` | 锚定「谁是 shortlist」与 fingerprint；**不**由 worker 侧车函数回写 |
| shortlistScenariosV0 | `shortlist_scenarios_v0` | `shortlistScenariosV0` | `tryBuildShortlistScenariosV0`（`shortlist-scenarios-v0.ts`），由 `runJob` finally 调用 | API 响应；Final Match `parseShortlistScenariosV0` | `schemaVersion`、`shortlistFingerprint`、`scenes[]`（每行含 `sceneKey`、`candidateUserId`、`score`、`status` 及解释型字段等） | **10×N** 场景证据与审计文案载体（`SHORTLIST_SCENE_KEYS_V0`）；**四维与决胜排序不读取解释字段** |
| shortlistFourDimV0 | `shortlist_four_dim_v0` | `shortlistFourDimV0` | `tryBuildShortlistFourDimV0`（`shortlist-four-dim-v0.ts`），输入为 scenarios | API 响应；Final Match `parseShortlistFourDimV0` | `shortlistFingerprint`、`rankingFormulaVersion`、`candidateDimensions[]`、`comparison.rankedCandidateUserIds` | 固定公式下的短名单排序与四维分解（只读侧车） |
| shortlistDecisionV0 | `shortlist_decision_v0` | `shortlistDecisionV0` | `tryBuildShortlistDecisionV0`（`shortlist-decision-v0.ts`），输入为 binding+items | API 响应；Final Match `parseShortlistDecisionV0` | `chosenCandidateUserId`、`rankedCandidateUserIds`、`shortlistFingerprint`、可选 `confidenceTier` | 基于 evaluator 分的短名单决胜排序（只读侧车） |

---

## 4. fingerprint 与 ranking 规则

### shortlistFingerprint 的角色

* **定义**：对 **有序** `shortlistCandidateUserIds`（或与之同多重集的排序结果）调用 `computeShortlistFingerprint`（`shortlist-contract-binding.ts`）得到的字符串；**同一顺序唯一**；用于把 binding 与各侧车 JSON **绑在同一短名单版本**上。
* **写入侧**：`shortlistBinding.shortlistFingerprint` 在入队时必须等于 `computeShortlistFingerprint(shortlistCandidateUserIds)`；各侧车对象上的 `shortlistFingerprint` 在构建时 **拷贝自 scenarios 或 binding**，保证与当次计算所用短名单一致。

### shortlistBinding 与三层 sidecar 的 fingerprint 一致性

* **落库前（API）**：`tryBuildShortlistDecisionV0` 内若 binding 自带 fingerprint 与重算 fingerprint 不一致则 **返回 null**；scenarios / fourDim 链同样依赖合法 binding 与一致 fingerprint。
* **Final Match（只读）**：`parseShortlistDecisionV0` 将侧车 fingerprint 与 `job.shortlistBinding.shortlistFingerprint` 比较，得到 `fingerprintConsistent`；**若 binding 上无 fingerprint 字符串则视为不比较**（`fingerprintConsistent` 可为 true）。`parseShortlistFourDimV0` / `parseShortlistScenariosV0` 对 fingerprint 与 decision / fourDim 的交叉一致采用 **「对端缺失则不判不一致」** 的宽松比较（见 §6）。

### rankedCandidateUserIds 的约束

* **来源一（decision）**：仅当 binding 合法、短名单 2–3 人、**每人 item SUCCEEDED**、每人 `simulationRankScore` 有限、按分降序 + **同分按 candidateUserId 字典序** 打破平局、排序结果与 binding 候选人集合 **多重集一致**、且 fingerprint 与 binding 一致时，才得到非 null 的 `rankedCandidateUserIds`。
* **来源二（fourDim）**：仅当 scenarios 非 null 且 **10 场景每人全 succeeded**（`SHORTLIST_SCENE_KEYS_V0` 矩阵完整）等条件满足时，由四维聚合分排序得到 `comparison.rankedCandidateUserIds`（同分 **candidateUserId 字典序**）。**`rankingFormulaVersion`** 在 **Phase C v1.0 冻结**下为 **`shortlist_four_dim_formula_v6`**（`longTermStability` 含 6 个场景分均值）。
* **落库约束**：二者 **逐元素相等** 时 `rankConsistent` 为 true；否则 **三层侧车列全部写 `DbNull`**（见 §5）。

### chosenCandidateUserId 与 rankedCandidateUserIds[0]

* **构建时**：`chosenCandidateUserId` **恒等于** `rankedCandidateUserIds[0]`（`shortlist-decision-v0.ts`）。
* **Final Match**：若 JSON 中二者不等，`parseShortlistDecisionV0` 返回 **`invalid`**，理由为「chosen 与 ranked[0] 不一致」。

---

## 5. 一致性必须成立

### fourDim.rankedCandidateUserIds === decision.rankedCandidateUserIds

* **在 `AiSimulationV1Service.runJob` 的 `finally` 中**：令 `rankConsistent = fourDim != null && decision != null && 两数组同长且逐下标相等`。仅当 `rankConsistent` 为 true 时，才把 `shortlistScenariosV0`、`shortlistFourDimV0`、`shortlistDecisionV0` **同时**写入非 null JSON；否则 **三者全部设为 `Prisma.DbNull`**（不会只保留其中一层）。
* **测试锚点**：acceptance **「Phase C v1.0 回归锚点（10 场景…）」** 指向的 `shortlist-four-dim-v0.spec.ts` / `shortlist-scenarios-v0.spec.ts` 用例（见 §7）。

### 解释字段不参与 fourDim / decision 计算

* **fourDim**：`tryBuildShortlistFourDimV0` 明确 **只读** 每场景行的 **`score` 与 `status`（门控）**；**不读** `reason`、`riskPoint`、`evidenceSnippet`、`reviewStatus`（源码注释已冻结）。
* **decision**：仅读各候选人 item 的 **evaluator 数值分与 confidence**；**不读** scenarios 侧解释字段。
* **篡改解释不改排序**：回归用例「解释全量篡改后 fourDim / decision 不变」锁定该边界。

### 不一致时 sidecar 如何降级（服务端）

* **`rankConsistent` 为 false**：`shortlistScenariosV0`、`shortlistFourDimV0`、`shortlistDecisionV0` **全部不写对象**（列值为 SQL NULL / `DbNull`），即 **侧车整体缺席**，而非写「半套」数据。

### 缺失时如何表现为 null / 不可用 / 只读警示（客户端）

* **列为 null / 缺对象**：解析器返回 **`unavailable`**（Final Match 内部区不展示有效表格内容或等价降级文案）。
* **有对象但字段不合法**（类型错、缺关键字段、矩阵不满 **10×N**、维度行数与 ranked 不一致等）：**`invalid`** + 固定中文理由「数据异常/不可用」等。
* **fingerprint / ranked 与对端侧车不一致**：在 **已有可读 decision/fourDim** 前提下，仍可能 `state: "ok"`，但通过 **`fingerprintConsistent` / `fingerprintConsistentWithFourDim` / `rankingConsistentWithDecision`** 等布尔量展示 **只读警示**（低权重、琥珀色文案），**不**参与主结论。

---

## 6. 降级与缺失规则

| 情况 | 服务端（`runJob` finally） | Final Match（只读） |
|------|---------------------------|---------------------|
| **场景不全**（任一候选人缺场景、非法 sceneKey、非 **10** 个 key、存在 failed 行等） | `tryBuildShortlistFourDimV0` → null；通常 scenarios 仍可能非 null，但若 fourDim/decision 与 `rankConsistent` 失败则 **三层一并 `DbNull`** | 若列 null → `unavailable`；若历史脏数据 → `invalid` |
| **fingerprint 不一致**（相对 binding） | builder 可能直接 **null**；若仍产出但 ranked 不一致则 **`DbNull` 三连** | decision：`fingerprintConsistent` false → **琥珀警示**；scenarios：与 fourDim/decision 指纹交叉比较，缺失对端则不判不一致 |
| **ranked 不一致**（fourDim vs decision） | **`rankConsistent` false → 三层侧车全部 `DbNull`** | 列 null 则 `unavailable`；若竟同时存在（异常数据）则解析器对 ranked 关系给 **`rankingConsistentWithDecision === false`** 警示 |
| **数据异常**（chosen ≠ ranked[0]、维度重复 id、非数字维等） | 正常路径不应写出；若 DB 手改脏数据 | **`invalid`** 或仅警示，依解析分支 |
| **Final Match 只读消费** | 无写回 | 仅 `details` 内展示；**不改变** `finalScore`；`sidecarReady` 等仍按既有 job 可读规则 |

---

## 7. 与代码 / DB / 测试锚点

### Prisma 字段

* 模型 **`AiSimulationV1Job`**（`packages/database/prisma/schema.prisma`）：`shortlistBinding`、`shortlistDecisionV0`、`shortlistFourDimV0`、`shortlistScenariosV0`（均为 `Json?`）；另有 `hintSnapshot`、`jobStatus` 等主链字段。

### 关键实现文件

* **入队与侧车落库**：`apps/api/src/modules/ai-simulation-v1/ai-simulation-v1.service.ts`（`enqueue` 校验 binding；`runJob` finally 中 `rankConsistent` 与 `Prisma.DbNull` 写入）。
* **类型与常量**：`apps/api/src/modules/ai-simulation-v1/ai-simulation-v1.types.ts`、`ai-simulation-v1.constants.ts`。
* **builders**：`shortlist-scenarios-v0.ts`、`shortlist-four-dim-v0.ts`、`shortlist-decision-v0.ts`、`shortlist-contract-binding.ts`（`computeShortlistFingerprint`）。
* **API 出站形状**：`formatJobResponse`（同文件内暴露上述 JSON 字段，缺省为 `null`）；**Phase F v0.1** 起另含读时派生 **`jobAuditV0`**（`buildJobAuditV0`，见 `ai-simulation-v1-job-audit-v0.ts`；**不落库**）。
* **Final Match**：`apps/web/src/pages/FinalMatchPage.jsx`（`parseShortlistDecisionV0` / `parseShortlistFourDimV0` / `parseShortlistScenariosV0` 与内部只读 UI）。

### 关键测试文件 / 用例类型

* `apps/api/test/shortlist-scenarios-v0.spec.ts`：**10×N** 矩阵、与 fourDim/decision 一致性、确定性等。
* `apps/api/test/shortlist-four-dim-v0.spec.ts`：fourDim vs decision ranked、解释仅篡改不变、链式确定性等。
* `apps/api/test/ai-simulation-v1-job-audit-v0.spec.ts`：**Phase F v0.1** `jobAuditV0` 枚举与 `rank_mismatch` / `persisted_sidecars_*` 等。

### acceptance 中的锚点位置

* `docs/P6/acceptance/P6-round2-orchestrator-a1-a2-acceptance.md`：**「Phase C v0 回归锚点」**（shortlist-only hint 与 fingerprint）、**「Phase C v1.0 回归锚点」**（**10×N** 全矩阵、解释篡改、**`fourDim.ranked === decision.ranked`**、同输入确定性、**`shortlist_four_dim_formula_v6`**）；**「Final Match 最小消费层接入」**（只读 sidecar、不参与 `finalScore`）。

---

## 8. 变更纪律

修改以下任一项时，应 **同步** 更新实现与回归，避免「文档 / 单测 / UI」与落库行为漂移：

| 变更类型 | 建议同步范围 |
|----------|----------------|
| **改 sidecar JSON 字段**（增删改键、改变 `scenes` 行形状） | `ai-simulation-v1.types.ts`；对应 `tryBuild*`；`formatJobResponse`；Final Match 解析与表格；`shortlist-*.spec.ts` |
| **改 schemaVersion 字符串** | `ai-simulation-v1.constants.ts`；所有 builder 与解析处的版本校验；相关 spec |
| **改 fingerprint 规则**（`computeShortlistFingerprint` 或 binding 校验） | `shortlist-contract-binding.ts`；`enqueue` 校验；所有 tryBuild 分支；orchestrator / post-pool 相关测试（含 `post-pool-deep-screen-orchestrator.spec.ts` 主锚点） |
| **改 ranked / chosen 规则**（排序键、平局、与 binding 集合关系） | `shortlist-decision-v0.ts`、`shortlist-four-dim-v0.ts`、`runJob` 中 `rankConsistent`；Final Match chosen vs `[0]` 校验；`shortlist-four-dim-v0.spec.ts` / `shortlist-scenarios-v0.spec.ts`；acceptance **Phase C v1.0** 段落 |

### Phase F v0.1：`jobAuditV0`（读时派生，非持久化）

* **出现位置**：`GET .../admin/ai-simulation/v1/jobs/:jobId`（及 `getJobForViewer`）响应中的 **`jobAuditV0`**。
* **字段**：`schemaVersion`（`job_audit_v0`）、`jobStatus`、`shortlistBindingPresent`、`sidecarTrioPresent`（三 JSON 列是否皆非 null）、`itemCounts`（`queued` / `running` / `succeeded` / `failed` / `total`）、`rankConsistent`（**completed** 外为 `null`）、`sidecarSuppressedReason`（**固定枚举**，无自由文本）。
* **枚举**（`JOB_AUDIT_V0_SUPPRESSED_REASON`）：`none` | `job_in_progress` | `scenarios_not_buildable` | `four_dim_not_buildable` | `decision_not_buildable` | `rank_mismatch` | `persisted_sidecars_stale` | `persisted_sidecars_inconsistent` | `unknown`。
* **逻辑**：与 `runJob` finally 同源调用 `tryBuildShortlistScenariosV0` → `tryBuildShortlistFourDimV0` / `tryBuildShortlistDecisionV0` 并比较 ranked；**不**写库。

---

## 附录：解释字段边界（小表）

以下字段 **不参与** `tryBuildShortlistFourDimV0` / `tryBuildShortlistDecisionV0` 的排序与数值聚合（rank 仅由场景 `score`+`status` 门控、以及 item `evaluator.simulationRankScore` 等决定）；持久化后供 **审计与只读 UI**。Final Match 当前表格对 `scenes` 仅展示部分列，完整键仍可从 API JSON 读取。

| field | used_in_fourDim | used_in_decision | used_in_ui（只读） |
|-------|-----------------|------------------|---------------------|
| `reason` | 否 | 否 | 是 |
| `riskPoint` | 否 | 否 | 是 |
| `evidenceSnippet` | 否 | 否 | 是 |
| `reviewStatus` | 否 | 否 | 是 |
| `confidenceTier`（`ShortlistDecisionV0`） | 否 | 否（决胜序已定后，仅取自胜者 `evaluator.confidence`） | 是 |

---

*本文路径：`docs/P6/truth/P6-shortlist-sidecars-output-rules-master.md`*
