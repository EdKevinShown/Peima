# 当前匹配主链 — 唯一真源（Single Source of Truth）

> **文档性质**：仓库内 **匹配链产品顺序与代码落点** 的 **统一口径**；**不替代**各专文的接口与算法细节，但 **冲突时以本文为准**。  
> **更新策略**：主链阶段变化时 **先改本文**，再在专文顶部保留指向本文的索引句。  
> **工程原则（当前）**：**不删代码**、**不改业务逻辑**；旧实现与预埋能力 **保留**，直至下游接线或技术债专项再动。

---

## 1. 当前主链顺序（钉死）

产品侧 **从曝光到高成本模拟** 的顺序定义为：

1. **Preview Pool（预览池）** — 先产生 **小池 6 槽** 与落库产物。  
2. **维度匹配** — 在 pool 之后，对候选与 viewer 的 **结构化兼容/画像标量** 等做批处理（当前实现含 **worker 批配** 与编排层 **G1-R profile 标量分** 等；见 §3）。  
3. **Prescreen v0** — 在维度匹配之后、**真正 AI 模拟之前** 的 **低成本规则分桶**（`promote` / `neutral` / `demote`）。  
4. **真正 AI 模拟 v1（未来）** — transcript-lite + evaluator 等（**尚未**在仓库主路径默认 enqueue）。

**明确不包含的顺序**：**不把 Prescreen 接回 Preview Pool** 内排序或 gate 前插队；预览池那条 **gating / layered / visual stub** 线 **阶段性收口**，新能力从 **pool 之后** 接线。

---

## 2. 每一层解决什么问题

| 阶段 | 解决的问题 |
|------|------------|
| **Preview Pool** | 在 **偏好硬门槛** 后，从较大候选集合中选出 **6 人分层入池**，供前端展示与后续 worker 取 `PreviewPoolItem`（含 `baseScore` 等）。 |
| **维度匹配** | 在 **已通过池** 的语境下，对 **viewer × candidate** 给出 **可解释的兼容/画像维度信号**；worker 路径上整合 **偏好、风格、画像标量** 等进入 **`computeFinalScoreV1`**；编排层另有 **pool 后 G1-R 标量门** 供深筛 shadow。 |
| **Prescreen v0** | **不替代**维度分；在已有 **问卷画像 + 静态摘要 + P6.y 规则层（无新 LLM）** 上输出 **bucket / prescreenScore / reasonCodes**，用于 **模拟前收缩与排序建议**。 |
| **AI 模拟 v1（未来）** | 在 **`simulationQueueHint`** 等上游约束下，对 **少量候选** 做 **高成本 LLM** 结构化输出（详见已定稿的 v1 implementation notes，**编码另文**）。 |

---

## 3. 每一层对应哪些模块 / 文件（索引）

### 3.1 Preview Pool（主链已消费）

| 区域 | 路径（代表性） |
|------|----------------|
| API | `apps/api/src/modules/preview-pool/preview-pool.service.ts`、`preview-pool.controller.ts` |
| 分层与偏好排序 | `apps/api/src/modules/preview-pool/preview-pool-layered-selection.ts` |
| Visual stub（开关） | `apps/api/src/modules/preview-pool/visual-signal-enhance-stub.ts` |
| 共享偏好门槛 / 分 | `packages/shared/matching/preference-hard-gate.ts`、`preference-score.ts` |
| 前端 | `apps/web/src/api/previewPool.ts` 及调用预览池的页面 |

### 3.2 维度匹配（主链已消费 + 与 worker 一体）

| 区域 | 路径（代表性） |
|------|----------------|
| Worker 终局分与批配 | `apps/worker/src/jobs/batch-match.processor.ts`、`apps/worker/src/jobs/matching-score.ts`（**`computeFinalScoreV1`**、`computeProfileScore` 等） |
| 用户进队 / 查结果 | `apps/api/src/modules/matching/matching.service.ts`（**`MatchResult`** 读取等） |
| 赛后读数（依赖 `MatchResult`，属 **池+批配之后** 的 C 端能力） | `apps/api/src/modules/match-review-ai/*`、`interaction-simulation-lite/*`、`match-readout-fusion/*`；`apps/web/src/pages/FinalMatchPage.jsx` |

### 3.3 Prescreen v0（shadow / 预埋；规则被主链 B 间接复用）

| 区域 | 路径（代表性） |
|------|----------------|
| 批初筛服务 | `apps/api/src/modules/prescreen-v0/*` |
| 静态摘要 / P6.y 规则（**与终局页、Prescreen 共用**） | `apps/api/src/modules/match-review-ai/match-review-static-summary.ts`、`interaction-simulation-lite/interaction-simulation-lite-rule.ts`、`interaction-simulation-lite-coherence.ts` |

### 3.4 Pool 后深筛编排（shadow；不接模拟队列）

| 区域 | 路径（代表性） |
|------|----------------|
| 编排 | `apps/api/src/modules/post-pool-deep-screen/*`（含 **`PostPoolDeepScreenOrchestratorService`**、`post-pool-dimension-g1r.ts`） |

### 3.5 Admin / 内部验证入口

| 区域 | 路径（代表性） |
|------|----------------|
| Admin | `apps/api/src/modules/admin/admin.controller.ts`（`prescreen/v0/batch-debug`、`post-pool-deep-screen/run-shadow`、`batch-match/run-once`）、`admin.service.ts`、相关 `dto/*` |

---

## 4. 哪些属于「主链已消费」

**定义**：已被 **C 端常规路径** 或 **worker 批配写 `MatchResult`** 等 **正式依赖**。

- **Preview Pool 全链路**（生成、查最新、删池；gating / layered / stub 分支）。  
- **`packages/shared` 中与 preview pool 一致的偏好 gate / preference 分**。  
- **Worker `batch-match` + `matching-score`（含对 `PreviewPool` 的读取）**。  
- **`MatchingModule` 进队与结果查询**。  
- **终局页相关 API**：Match Review AI、Interaction Simulation Lite、Match Readout Fusion + **FinalMatchPage**。  
- **Admin `batch-match/run-once`**：触发 worker（运维子链，仍属主链能力）。

---

## 5. 哪些属于「shadow / debug / 预埋能力」

**定义**：**已实现**、**可调用**，但 **未**进入「用户每次走 pool 必跑」或 **未**进入「默认 AI 模拟 enqueue」。

- **`PrescreenV0Service.prescreenBatch`**：默认由 **Admin `prescreen/v0/batch-debug`** 或 **post-pool 编排** 调用；**未**写 `MatchResult`、**未**改 worker 公式。  
- **`PostPoolDeepScreenOrchestratorService.runShadow`**：仅 **Admin `post-pool-deep-screen/run-shadow`**；产出 **`simulationQueueHint`**，**`simulationQueueActual` 为空**、**不入队**真正模拟。  
- **编排内 `purpose: shadow`** 的 Prescreen 调用与 **G1-R 维度硬失败过滤**：仅供 **内部验证与对账**。  
- **相关单元测试**（`apps/api/test/prescreen-v0.*`、`post-pool-deep-screen-orchestrator.spec.ts` 等）。

---

## 6. 哪些属于「未来阶段」

- **真正 AI 模拟 v1**：字段级契约见 **[`P6-ai-simulation-v1-implementation-notes.md`](./P6-ai-simulation-v1-implementation-notes.md)**（enqueue / run、**transcript-lite + evaluator**、**`simulationQueueActual`**、预算 **Top-8**、失败重试、禁区）；**本文仅保留阶段位次**。  
- **Prescreen 与维度结果的进一步融合**（例如把维度档位并入 `reasonCodes` / DTO）：**可选 v0.1+**。  
- **将 G1-R profile 分与 worker 完全单源化**（见 §8）：**技术债**，非功能阻塞。

---

## 7. 当前明确不做什么

- **不把 Prescreen 接回 Preview Pool**（不重排 `G_all`、不改池内 gate 语义）。  
- **不改 worker `computeFinalScoreV1` 主公式**（除非独立专项）。  
- **不把 Prescreen / 编排 shadow 结果默认写入 `MatchResult`**。  
- **不做代聊、不默认开启未评审的新 LLM 路径**。  
- **不为「对齐文档」而删代码** — 预埋与历史分支 **保留**。

---

## 8. 技术债：以后再处理，现在不要动

| 项 | 说明 | 建议时机 |
|----|------|----------|
| **G1-R profile 标量分双实现** | `apps/api/.../post-pool-dimension-g1r.ts` 与 `apps/worker/.../matching-score.ts` 中 **`computeProfileScore` 同构** | 抽 **`@peima/shared`** 或共享模块后 **删一处重复** |
| **旧文档中「Prescreen 可选接预览池」等叙述** | 与 **本文 §1** 顺序冲突处以 **本文为准**；专文逐步加索引句即可 | **文档修订 PR**，不动代码 |
| **`ReviewMatchDto` 字段命名与注释** | `candidateUserId` 与注释「最终匹配对象 id」易混 | **小 refactor** 与 API 文档同步 |

---

## 9. 相关专文（细节仍以此为准）

- 预览池：[`P6-preview-pool-gating-and-layered-v0.md`](./P6-preview-pool-gating-and-layered-v0.md) 及其中索引的 preference / layered / visual 专文。  
- Prescreen：`P6-backend-intelligent-prescreen-v0.md` 与 `P6-backend-intelligent-prescreen-v0-implementation-notes.md`（**接口与禁区**）。  
- P6.x / P6.y / P6.z：`P6-current-stage-capabilities-P6x-P6y.md` 及各 MVP / fusion notes。  
- AI 模拟规划：`../archive/historical/AI-MATCHING-SIMULATION-PLAN.md`（**规划篇幅**；与 v1 定稿冲突时 **以 [`P6-ai-simulation-v1-implementation-notes.md`](./P6-ai-simulation-v1-implementation-notes.md) + 本文顺序** 协调）。

---

*本文路径：`docs/P6/truth/P6-current-matching-chain-single-source-of-truth.md`*
