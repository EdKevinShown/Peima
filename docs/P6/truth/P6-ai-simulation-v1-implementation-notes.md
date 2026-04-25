# 真正 AI 模拟 v1 — implementation notes（可开工定义）

> **主链口径（唯一真源）**：整体顺序与阶段边界以 [`P6-current-matching-chain-single-source-of-truth.md`](./P6-current-matching-chain-single-source-of-truth.md) 为准：**Preview Pool → 维度匹配 → Prescreen v0 → 真正 AI 模拟 v1（本稿）**；**Prescreen 不接回 Preview Pool**。  
> **本文性质**：v1 **编码前**必须遵守的 **队列形态、输入输出 schema、闸门与禁区**；**不含代码**。  
> **上游**：`simulationQueueHint[]` 由 **`PostPoolDeepScreenOrchestratorService.runShadow`**（或与其 **字节级等价** 的冻结快照）产出；本 v1 **不**重新定义 Prescreen 规则。  
> **规划背景**：长文 [`AI-MATCHING-SIMULATION-PLAN.md`](../archive/historical/AI-MATCHING-SIMULATION-PLAN.md) 仅作历史与算法讨论；**字段级与主链衔接以本文为准**。

---

## 1. 最小队列 / service 形态

### 1.1 职责拆分（写死）

| 组件 | 职责 |
|------|------|
| **`AiSimulationV1Queue`（或 `*EnqueueService`）** | 校验闸门、解析 `hintSnapshot`、**预算截断**、落库 **`queued`**、返回 **`simulationJobId`**。 |
| **`AiSimulationV1Runner`（或 `*RunService`）** | 按 `simulationJobId` 拉 job、组 prompt、**单次 LLM** 请求、**JSON 校验**、写 **`succeeded` / `failed`**、持久化 **`transcript_lite` + `evaluator`**。 |

允许合并为一个 Nest `AiSimulationV1Module`，但 **对外或对内接口** 必须 **enqueue / run 分离**，便于异步 worker 与单测。

### 1.2 `enqueue` 输入（最小字段集）

| 字段 | 必填 | 说明 |
|------|------|------|
| `schemaVersion` | 是 | 固定 **`ai_simulation_v1`**。 |
| `viewerUserId` | 是 | 与 JWT / 业务 viewer 一致。 |
| `hintSource` | 是 | 首版固定 **`post_pool_deep_screen_shadow_v0`**（仅认这一种来源）。 |
| `poolId` | 是 | `PreviewPool.id`，审计与幂等组件。 |
| `hintSnapshot` | 是 | **enqueue 时刻** 的 **`simulationQueueHint[]` 完整 JSON**（与编排输出一致，**防篡改**）。 |
| `runSpecVersion` | 是 | 固定 **`ai_simulation_run_v1`**（prompt / 合并 schema 变更时 bump）。 |

**不在 enqueue 体**：由客户端自由指定的 `candidateUserIds[]`。**候选列表必须由服务端**根据 `hintSnapshot` + §2 规则 **唯一解析**。

### 1.3 `run` 输入（最小字段集）

| 字段 | 必填 | 说明 |
|------|------|------|
| `simulationJobId` | 是 | enqueue 返回的主键。 |

Runner **禁止**接受未持久化的 prompt 覆盖（v1 无 override）。

### 1.4 结果 **保存 / 返回**（写死）

| 形态 | 约定 |
|------|------|
| **持久化** | 一 job 多行子结果或单 JSONB：`candidateUserId`、`status`（`queued|running|succeeded|failed`）、`transcript_lite`、`evaluator`、`errorCode?`、`attemptCount`、时间戳。 |
| **同步 HTTP** | **202** + `{ simulationJobId, acceptedCandidateCount }`；**不**同步返回 LLM 全文。 |
| **轮询 GET** | `{ jobStatus, results[] }`；失败项 **`failed` + `errorCode`**。 |

**不写 `MatchResult`**；**不**把 `evaluator.simulationRankScore` 写入 worker 使用的最终分数字段。

---

## 2. `simulationQueueHint` 如何进入真正模拟

### 2.1 解析与过滤（服务端写死）

1. 反序列化 `hintSnapshot` 为数组 `H`。  
2. **防御性过滤**：仅保留 `bucket ∈ { promote, neutral }`（与编排侧一致；**若出现 `demote` 则丢弃该项**）。  
3. **按 `rankHint` 升序** 得到有序列表 `L`。  

### 2.2 预算（写死一种，少分支）

- **全局每 job 最多模拟候选数**：**`SIMULATION_V1_MAX_CANDIDATES_PER_JOB = 8`**（常量表 + 单测锁定）。  
- **截断规则**：**`L' = L 的前 8 条`**（**不**再单独为 neutral 设比例或第二套 Top-K；**neutral 若排在第 9 及以后则自然截断**）。  
- **依赖编排侧**：若需 **promote 优先**，必须由 **上游 `simulationQueueHint` 生成规则**（与当前 Prescreen 输出序）保证 **promote 排在 `rankHint` 前列**。

### 2.3 闸门 Flag（写死）

- **`AI_SIMULATION_V1_ENABLED`**（或 `PEIMA_AI_SIMULATION_V1`，实现 PR 二选一命名并写死）：  
  - **`0` / unset**：enqueue **拒绝**（HTTP **501** 或 **403**，实现 PR 选一种并文档化）。  
  - **`1`**：允许创建 job 并后续 run。

---

## 3. `transcript-lite` 的最小 schema

### 3.1 固定轮数

- **`rounds.length === 4`**（少于此或多于此 → **schema 校验失败**）。

### 3.2 每轮对象（写死字段）

| 字段 | 类型 | 约束 |
|------|------|------|
| `round` | `integer` | **1–4**，与数组顺序一致。 |
| `speaker` | `string` | 枚举 **`viewer` \| `candidate` \| `narrator`**。 |
| `intent_tag` | `string` | **snake_case**，最大 **32** 字符。 |
| `text` | `string` | **≤ 120 字符**（实现可加 UTF-8 字节上限双保险）。 |

### 3.3 顶层包装

```json
{
  "schemaVersion": "transcript_lite_v1",
  "rounds": [ /* 长度 4 */ ]
}
```

### 3.4 可解析、可控

- LLM **仅输出 JSON**（无 markdown 围栏）。  
- 服务端 **parse + schema 校验**；失败 → **`failed` + `errorCode: invalid_transcript_lite`**（见 §6）。

### 3.5 `narrator`（写死约束）

- **全 job 最多 1 轮** `speaker === "narrator"`；**建议固定轮次为 2 或 3**（实现 PR 写死一个整数）。

---

## 4. `evaluator` 的最小 schema（写死字段集，无扩展必填）

**v1 默认：与 `transcript_lite` 同一 LLM 响应根对象内返回**（**单请求**；不默认链式第二次调用）。

| 字段 | 类型 | 约束 |
|------|------|------|
| `continue_recommendation` | `string` | **`explore_more` \| `hold` \| `slow_down`** |
| `risk_tags` | `string[]` | **0–6** 项；每项 snake_case，**≤32** 字符 |
| `mitigation_hints` | `string[]` | **0–3** 项；每项 **≤80** 字符 |
| `simulationRankScore` | `number` | **[0, 1]**，保留 **4 位小数** |
| `confidence` | `string` | **`high` \| `medium` \| `low`** |

### 4.1 LLM 根对象形状（逻辑）

```json
{
  "schemaVersion": "ai_simulation_llm_payload_v1",
  "transcript_lite": { "schemaVersion": "transcript_lite_v1", "rounds": [ ... ] },
  "evaluator": {
    "continue_recommendation": "hold",
    "risk_tags": [],
    "mitigation_hints": [],
    "simulationRankScore": 0.5,
    "confidence": "medium"
  }
}
```

---

## 5. `shadow` / `hint` / `actual` 队列的关系（v1 写死）

| 概念 | v1 约定 |
|------|---------|
| **`simulationQueueHint`** | **上游编排 shadow** 已产出；**enqueue 时冻结**为 `hintSnapshot`。 |
| **`shadow`（本 v1 模块内）** | **不作为默认双轨**：不在 v1 首 PR 引入「只打日志不入队」的并行模式；需要时 **后续** 用 `dryRun` 列或单独 job 类型扩展。 |
| **`hint`** | **不单独存在**一层队列名；hint 即 **编排输出**，由 enqueue **消费为 actual**。 |
| **`simulationQueueActual`** | **enqueue 成功后** 持久化为 **本 job 实际接受的候选 `candidateUserId` 有序列表**（与 §2 的 **`L'`** 一致，**最多 8 人**）。 |

**最稳理由**：单闸门（§2.3）+ **单 job 真源**（`hintSnapshot` + `simulationQueueActual`）降低对账成本；**不**回写 Preview Pool、**不**写 `MatchResult`。

---

## 6. 失败与重试策略（写死）

| 场景 | 行为 |
|------|------|
| **单候选 LLM 失败**（超时、5xx、非 JSON、`schema_validation`） | 该候选 **`failed`** + `errorCode`（`timeout` / `http_error` / `invalid_json` / `schema_validation` 等枚举）。 |
| **同 job 内其他候选** | **互不影响**，继续跑至全部 terminal。 |
| **重试** | **每候选最多 2 次 attempt**（1 初始 + **1** retry）。  
| **可 retry 的 errorCode** | 仅 **`timeout` / `http_error` / `invalid_json`**。  
| **不可 retry** | **`schema_validation`**（避免死循环）。 |
| **整 job** | **无「全 job 失败」硬中断**；job 以 **所有候选 `succeeded` 或 `failed`** 为结束条件。  
| **job 级 HTTP** | enqueue 仍 **202**；轮询展示 **部分失败** 为常态。 |

---

## 7. 本轮明确不做什么

- **不改** [`P6-current-matching-chain-single-source-of-truth.md`](./P6-current-matching-chain-single-source-of-truth.md) 所钉的 **Preview Pool** 行为（**本阶段不对 preview pool 代码与专文做修改**）。  
- **不改** worker **`computeFinalScoreV1`** 主公式。  
- **不写 `MatchResult`**；**不**用模拟分覆盖用户可见「最终匹配结论」。  
- **不做代聊脚本**（输出不可直接当作用户发送消息接入 IM）。  
- **不接 preview pool 排序回流**（不写 pool 顺序、不改分层选入输入）。  
- **不默认**完整长 transcript、**不默认** P6.z 作为模拟输入、**不默认**新图像多模态供应商。  
- **不做代码清理**（与 G1-R 重复实现等 **见真源 §8 技术债**，另开专项）。

---

## 8. 编码 PR 自检清单（摘要）

- [ ] `enqueue` **仅**从 `hintSnapshot` 解析 **`L'`**，**≤8** 人。  
- [ ] LLM 响应 **单 JSON**：`ai_simulation_llm_payload_v1`。  
- [ ] `transcript_lite.rounds.length === 4`；`evaluator` **五字段齐全**。  
- [ ] `simulationQueueActual` 落库 **等于** `L'`。  
- [ ] Flag 关时 **零** LLM 调用、**零** job 写入（或仅返回 501，与 §2.3 一致）。

---

## 附录 A：`schema_validation` 与 `failureDetail` 定点迭代（实现落地）

> **范围**：实现已在 Admin **`GET /admin/ai-simulation/v1/jobs/:jobId`** 的 **`results[]`** 上，对 **`errorCode === "schema_validation"`** 的 item 持久化 **`failureDetail`**（JSON：`path` + `reason`）。**不**默认落全量 model raw。  
> **用途**：下一轮按首个失败点改 **prompt** 或评估是否做 **极小单字段解析**，避免盲调。

### A.1 从 GET job 的 `results[].failureDetail` 读取 `path` / `reason`

1. 调用 **`GET /admin/ai-simulation/v1/jobs/:jobId`**（与 §1.4 轮询形态一致；Admin JWT + allowlist 不变）。  
2. 在响应 **`results`** 数组中定位目标 **`candidateUserId`**。  
3. 若 **`errorCode === "schema_validation"`**：读取 **`failureDetail`**（对象）。  
   - **`failureDetail.path`**：校验器**第一个**失败字段的位置（点号路径 + 数组下标 **`[i]`**）。  
   - **`failureDetail.reason`**：与该分支绑定的稳定短字符串，用于下表对照。  
4. **`invalid_json` / `timeout` 等**：当前 **不** 持久化 `failureDetail`（可能为 `null`）；不按本附录解读。  
5. **`errorCode === "schema_validation"` 且 `failureDetail` 为 `null`**：可能非 LLM JSON schema 路径（例如实现侧其它失败误标）；先区分来源，勿按本表盲改 prompt。

### A.2 `reason` → 最小修复动作对照表

约定三列动作：**改 prompt** / **放宽单字段解析** / **保持不动**（契约边，优先 prompt 收敛）。

| `reason` | 含义（首个失败点） | 建议动作 |
|----------|-------------------|----------|
| `expected_object` | 根或 `transcript_lite`、`evaluator`、或某轮 `rounds[i]` 非 object | **改 prompt**（单根 JSON、各段为对象）；**保持不动** |
| `expected_literal` | `schemaVersion` 或 `transcript_lite.schemaVersion` 与常量不一致 | **改 prompt**（写死字面量）；**保持不动** |
| `expected_array_length_4` | `transcript_lite.rounds` 长度不是 4 | **改 prompt**；**保持不动** |
| `expected_integer` | 某轮 `round` 非整数 | **改 prompt**；**保持不动** |
| `expected_round_index` | `round` 与数组下标不一致 | **改 prompt**；**保持不动** |
| `expected_enum` | `speaker`、`continue_recommendation` 或 `confidence` 不在枚举内 | **改 prompt**（列出允许值）；**保持不动** |
| `expected_snake_case` | `intent_tag` 或 `risk_tags[j]` 非 `^[a-z][a-z0-9_]*$` 或超长 | **改 prompt**（ASCII snake、禁中文/连字符/大写）；**保持不动**（除非产品明确接受映射字典，属契约变更） |
| `expected_nonempty_max_120` | 某轮 `text` 为空或 >120 | **改 prompt**；默认 **保持不动**（服务端截断属契约/产品决策） |
| `narrator_at_most_once` | 多于一轮 `narrator` | **改 prompt**；**保持不动** |
| `narrator_wrong_round` | `narrator` 未落在实现写死的固定轮次 | **改 prompt**（与实现常量一致）；**保持不动** |
| `expected_array_max_6` | `risk_tags` 超过 6 项 | **改 prompt**；**保持不动** |
| `expected_array_max_3` | `mitigation_hints` 超过 3 条 | **改 prompt**；**保持不动** |
| `expected_nonempty_max_80` | `mitigation_hints[j]` 为空或 >80 | **改 prompt**；默认 **保持不动** |
| `expected_finite_number_in_0_1` | `simulationRankScore` 无法解析为有限数（实现已接受常见「数字字符串」形态；仍失败时再判） | **改 prompt**（JSON number、闭区间）；仅当出现**新的、可安全归一化**的陋习时评估 **放宽单字段解析**；否则 **保持不动** |
| `out_of_range_0_1` | 有限数但超出 **[0, 1]** | **改 prompt**；一般 **保持不动**（不建议默默 clip，除非产品书面接受） |

读法：**用 `path` 锁定字段与段（transcript vs evaluator），用 `reason` 在上表选动作**。

### A.3 复跑失败样本的最短步骤

1. **已 `failed` 的 item 不会在同 job 上再次被 `run` 拉起**（runner 只处理 **`queued`**）。  
2. 用与当时一致的 **`viewerUserId`、`poolId`、`hintSnapshot`**（及关心的 **`candidateUserId`** 仍落在解析后的队列内）再 **`POST .../enqueue`** → 得到新 **`simulationJobId`**。  
3. **`POST .../jobs/:jobId/run`**。  
4. **`GET .../jobs/:jobId`**，在同一 **`candidateUserId`** 上看 **`status` / `errorCode` / `failureDetail`** 是否改善。

---

*本文路径：`docs/P6/truth/P6-ai-simulation-v1-implementation-notes.md`*
