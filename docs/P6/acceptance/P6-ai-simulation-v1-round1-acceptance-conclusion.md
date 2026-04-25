# AI 模拟 v1 — 首轮实机验收结论（Round 1）

> **性质**：首轮 **实机验证** 后的收口说明；**不替代** [`P6-ai-simulation-v1-implementation-notes.md`](../truth/P6-ai-simulation-v1-implementation-notes.md) 的契约定义。  
> **范围**：仅 **AI 模拟 v1 最小主链**（enqueue / run / get job、持久化、`transcript-lite` + `evaluator`）；**不含** preview pool / worker / `MatchResult` 变更。

---

## 1. 已验证成功的链路

| 环节 | 结论 |
|------|------|
| **迁移 + 表** | `ai_simulation_v1_jobs` / `ai_simulation_v1_items` 可用，enqueue 可落库。 |
| **Admin enqueue** | `POST /admin/ai-simulation/v1/enqueue` 返回 **202**；`simulationQueueActual` 与 **Top-8** 规则一致（`hintSnapshot` 嵌套 DTO 修复后，与 shadow `simulationQueueHint` 对齐）。 |
| **Admin run** | `POST /admin/ai-simulation/v1/jobs/:jobId/run` 可跑完全部 item；job **`jobStatus = completed`**。 |
| **Admin get job** | `GET /admin/ai-simulation/v1/jobs/:jobId` 可读到 **`transcriptLite` + `evaluator`**。 |
| **多 item 成功** | 多条 **`succeeded`**，结构化输出符合 v1 schema。 |
| **单 item 失败不拖垮 job** | 至少一条 **`failed` + `errorCode: schema_validation`**，其余 item 仍 **`succeeded`**，job 仍 **`completed`**（与 implementation notes 一致）。 |

---

## 2. 当前已知限制（首轮未要求、后续再议）

| 限制 | 说明 |
|------|------|
| **同步 run** | `run` 在 HTTP 内同步跑完；生产需异步队列、超时与取消。 |
| **仅 Admin 入口** | 无 C 端产品化；依赖 **JWT + admin allowlist**。 |
| **闸门** | `AI_SIMULATION_V1_ENABLED` 关则 **501**，无隐式调用。 |
| **可观测性** | 失败项仅 **`errorCode`**，**无**细分子段错误码（定位 schema 需人工看模型原始输出或后续加字段）。 |
| **幂等与重跑** | 重复 `run` 仅处理 **`queued`** item；全成功后再次 run 多为空跑 + 仍 `completed`。 |

---

## 3. 本轮失败样本情况（schema_validation）

**现象**：部分 item **`schema_validation`**，同 job 其它 item 成功，job **`completed`** —— **符合设计**（单条失败隔离、不重试 schema）。

**定位方法（不猜字段名）**：对失败 `candidateUserId`，从 **GET job** 响应或 DB 中取该 item 前一次 **LLM 原始 `content`**（若已落库仅结构化字段，则需 **API 日志** 或下一轮加 **`lastRawModelSnippet`** 才可不猜）。按 **§4 校验顺序** 自上而下对照第一条失败规则即可锁定字段。

**在未保存原始 JSON 的前提下**，根据实现代码（`parseAndValidateAiSimulationLlmPayloadV1`）**概率从高到低**的常见根因：

1. **`intent_tag` 或 `risk_tags` 某项** 不满足 **`^[a-z][a-z0-9_]*$`**（模型常给 **中文标签**、**首字母大写**、**连字符** `open-up`、**数字开头** 等）→ 归类为 **transcript-lite** 或 **evaluator** 的 **字符串格式** 不合法。  
2. **`simulationRankScore` 为 JSON 字符串**（如 `"0.62"`）→ `typeof srs !== "number"` → **evaluator** 段失败（实现未做 string→number 宽松解析）。  
3. **`text` 或 `mitigation_hints` 超长**（>120 / >80）或 **`round`/`speaker`/`narrator` 轮次规则** 违反 → **transcript-lite** 段失败。

### 3.1 失败样本复跑结果（收口后）

首轮曾出现 **`schema_validation`** 的两条候选，在 **收紧 `buildAiSimulationV1SystemPrompt`**（`intent_tag` / `risk_tags` 仅 ASCII snake、`simulationRankScore` 须为 JSON number 等）与 **`simulationRankScore` 单行级宽松解析**（可 trim 的有限数字字符串 → number）之后，**单独新开 job 复跑均已 `succeeded`**：

- `cmoc1gnil00006z64l9w2oa5t`
- `cmoc1gnkq004l6z64jdq89d4a`

Item 级 **`failureDetail`**（`path` + `reason`）已持久化并在 **`GET /admin/ai-simulation/v1/jobs/:jobId` → `results[]`** 透出，供后续同类失败**定点归因与迭代**（见 [`P6-ai-simulation-v1-implementation-notes.md`](../truth/P6-ai-simulation-v1-implementation-notes.md) **附录 A**）；**不**默认依赖全量 raw model content。

### 3.2 语义纠偏验证结果（transcript-lite 语境）

在 **`buildAiSimulationV1SystemPrompt`** 增加关系场景锚定、禁用招聘/面试类语境、并对 **`candidate`/`viewer` 角色消歧** 之后，对 **prompt 部署后新跑出的 job** 做抽样核对：**`transcript_lite`** 已不再稳定滑向 **面试 / 招聘 / 绩效 / HR** 等职场评估口吻；内容更接近 **匹配后的首次私聊文字**——**轻量寒暄、自然接话、共同兴趣或偏好类试探**，与「关系产品里第一次打开聊天」一致。

**旧 job / 已落库 item**：仍保留当时模型写下的 **`transcriptLite` 快照**，**不会**因 prompt 更新而回溯改写——属 **落库快照** 预期；要比对新语义请 **新开 job** 或只看 **新 run** 产生的 item。

**剩余观察（非场景错误）**：当前偶发仍有 **模板感偏强、轮次之间多样性一般** 的感受，属于 **文风与采样空间** 层面，可在后续轮次用 **轻量 prompt 或解码侧策略** 再优化，**不**改变本轮「场景纠偏已到位」的结论。

---

## 4. 校验顺序速查（用于对照单条失败样本）

**根 `schemaVersion`** → **`transcript_lite`** 存在且 **`schemaVersion === transcript_lite_v1`** → **`rounds.length === 4`** → 每轮 **`validateRound`**（`round` 与下标一致、`speaker` 枚举、`intent_tag` snake、`text` 长度）→ **`narrator` 至多 1 次且 `round === 3`** → **`evaluator`** 各字段及 **`risk_tags`/`mitigation_hints`** 的 snake 与长度 → **`simulationRankScore` [0,1] 且为 number** → **`confidence` 枚举**。

---

## 5. 对外 / 对内如何表述「这一步完成度」

| 对象 | 建议表述 |
|------|-----------|
| **对内 / 技术** | 「**AI 模拟 v1 最小主链已在 Admin 路径实机跑通**：enqueue→run→get job；持久化与 Top-8、单条失败隔离已验证；**同步 run、仅 Admin、无 MatchResult 写入**。」 |
| **对外 / 产品** | 「**实验性内部能力**：在固定 schema 下对池后候选做 **结构化互动模拟摘要**，用于 **排序与风险提示**；**未**接入用户主流程、**不**改变最终匹配结果。」 |
| **边界** | 明确 **非生产 SLA**、**非全量成功率承诺**；schema 失败样本预期存在，通过 **提示词 / 轻量解析** 迭代降低比例即可。 |

---

## 6. `schema_validation` 失败 — 最小修复建议（不改 preview pool / worker / MatchResult）

**原则**：优先 **提示词收紧** 与 **单行宽松解析**；不大改流水线。

| 若根因是 | 最小修复（择一） |
|----------|------------------|
| **`intent_tag` / `risk_tags` 非 ASCII snake** | 在 **`buildAiSimulationV1SystemPrompt`** 中增加一行英文硬性示例：`intent_tag` / `risk_tags` **仅** `^[a-z][a-z0-9_]*$`，**禁止中文与连字符**。 |
| **`simulationRankScore` 为字符串** | 在 **`parseAndValidateAiSimulationLlmPayloadV1`** 中对 `srs` 增加 **`typeof srs === "string" ? Number(srs) : srs`** 且在有限次内校验 finite（**单行级** 宽松，不改变其它逻辑）。 |
| **`text` / `mitigation_hints` 超长** | 仅调 **prompt** 强调硬上限；或 **服务端截断**（若产品接受「截断即合法」需单开 PR 说明，首轮可不动代码）。 |

**不建议首轮做的**：返回细粒度 `schemaViolationPath`、自动重试 schema、改 transcript 轮数等 —— 均属扩功能。

---

## 7. 修完后如何再验收（针对 schema 样本）

1. 保留一条曾失败的 **candidate** 与 **viewer/pool/hint** 组合。  
2. 仅改 **prompt 或单行 `simulationRankScore` 解析** 后重新 **enqueue + run**（或新 job）。  
3. 对比同一候选：**`errorCode` 由 `schema_validation` → `succeeded`**，且 **`transcriptLite`/`evaluator` 仍满足 §4**。

---

## 8. 相关文档索引

- 契约：[`P6-ai-simulation-v1-implementation-notes.md`](../truth/P6-ai-simulation-v1-implementation-notes.md)  
- 主链位次：[`P6-current-matching-chain-single-source-of-truth.md`](../truth/P6-current-matching-chain-single-source-of-truth.md)  
- 手工验收清单：此前对话中的 checklist（可选后续落盘为 `P6-ai-simulation-v1-acceptance-checklist.md`）。

---

*本文路径：`docs/P6/acceptance/P6-ai-simulation-v1-round1-acceptance-conclusion.md`*
