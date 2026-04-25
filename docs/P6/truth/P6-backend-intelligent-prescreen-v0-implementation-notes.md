# 后台智能初筛 v0 — 实现前约定（implementation notes）

> **当前主链定义（唯一真源）**：以 [`P6-current-matching-chain-single-source-of-truth.md`](./P6-current-matching-chain-single-source-of-truth.md) 为准；本文若与其冲突，以真源文档为准。

> **阶段定义见**：[`P6-backend-intelligent-prescreen-v0.md`](../specs/P6-backend-intelligent-prescreen-v0.md)。  
> **本文性质**：开工前必须钉死的 **接口形状、信号边界、bucket/score 关系、衔接与禁区**；**不含代码**。  
> **硬约束（v0 首版）**：**不新增任何真实 LLM HTTP 调用**；**规则层必须能独立产出 `bucket` + `prescreenScore`**；**主语义为 `bucket`，`prescreenScore` 仅作同桶内排序辅助**。

---

## 1. 最小接口形态

### 1.1 批量 POST vs 内部 Service — 首版推荐

| 维度 | **首版推荐** |
|------|----------------|
| **主形态** | **`PrescreenV0Service`（Nest `@Injectable`）内聚 `prescreenBatch(dto)`** — 便于单元测试、被预览池 / Admin / 未来 cron **直接注入调用**，无需先暴露公网面。 |
| **HTTP** | **可选第二 PR**：`POST /prescreen/v0/batch`（或 `POST /internal/prescreen/v0/batch`）— **JWT** + **`token.sub === dto.viewerUserId`**（与 preview-pool 一致）；**Admin-only** 另议。首版 **可不暴露 HTTP**，仅以 Service 契约冻结。 |

**结论**：**先钉死 Service 契约**；HTTP 为 **薄控制器包装同一 DTO**，字段与下文一致。

### 1.2 输入字段最小集（DTO）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `schemaVersion` | `string` | 是 | 如 **`prescreen_v0`**，便于演进。 |
| `viewerUserId` | `string` | 是 | 与 JWT / 调用方一致。 |
| `candidateUserIds` | `string[]` | 是 | **去重**；长度 **1..200**（与预览池 `G_all` 上界同量级，可调常量）。 |
| `purpose` | `enum` | 否 | **`shadow`**（默认）\| **`preview_pool_hint`** \| **`batch_order_hint`** — 仅影响 **日志 tag / 可选下游行为开关**，**不改变**单对打分公式。 |

**不在 v0 请求体**：`MatchResultId`（见 §2：无结果行时 **不接 P6.z fusion**）、图像 URL 列表、聊天记录、prompt 覆盖参数。

### 1.3 输出 JSON 形状（响应 DTO）

顶层：

```json
{
  "schemaVersion": "prescreen_v0",
  "viewerUserId": "<string>",
  "purpose": "shadow",
  "results": [
    {
      "candidateUserId": "<string>",
      "bucket": "promote | neutral | demote",
      "prescreenScore": 0.0,
      "reasonCodes": ["static_compat_band", "lite_verdict_pause"]
    }
  ],
  "debug": {
    "ruleVersion": "prescreen_rule_v0",
    "droppedCandidates": []
  }
}
```

| 字段 | 说明 |
|------|------|
| **`results`** | 与输入 **同序** 或 **按 `prescreenScore` 降序** —— 须在实现里 **二选一写死**；建议 **输出按 `prescreenScore` 降序、`bucket` 主序（promote→neutral→demote）稳定排序** 便于消费方截断。 |
| **`reasonCodes`** | **短枚举数组**，上限如 **4**；供日志与排障，**非用户可见长文**。 |
| **`debug.droppedCandidates`** | 画像缺失 / 自检失败等 **未出分的 candidateUserId** 及 **dropReason**（实现细化）。 |

---

## 2. v0 首版最小输入信号

### 2.1 来自静态摘要（与 P6.x 同源）

| 信号 | 来源 | 用途 |
|------|------|------|
| **`reviewStaticScore`** | `buildMatchReviewStaticSummary(viewerProfile, candidateProfile).reviewStaticScore`（0–100） | **bucket 划档**主依据之一；**reasonCodes** 如 `static_score_tier_low` / `high`。 |
| **`staticSummary` 子集** | 同一函数返回的 `staticSummary` 中 **已存在** 的 **计数/档位**（如 major fits / risks 数量，若类型已有） | **reasonCodes** 与 **细粒度 tie-break**；**禁止**把整段自然语言摘要写入响应。 |

### 2.2 来自 P6.y **规则层**压缩（不调 LLM）

| 信号 | 来源 | 用途 |
|------|------|------|
| **`overall.verdict`** | 与 **`buildInteractionSimulationLiteRulePayload`**（或等价：`computeRawBandsV1` → `applyCoherencePass` → `verdictFromAxes`）**同源规则路径**，输入仅为 **`reviewStaticScore` + `staticSummary`** | **bucket 主判决**（与静态交叉）；取值限定 **`worth_exploring` / `cautious` / `pause`**。 |
| **四轴 band（压缩）** | 规则层 **`InteractionLiteRawBands`**：`pickup` / `cold` / `mis` / `cont` 的 **`high|medium|low`** | **reasonCodes**（如 `cold_high`）；**可选**映射为 **小整数 0–2** 参与 **`prescreenScore` 细排**，**不**外露四轴全文。 |

**实现要求**：**直接调用或抽取现有 `apps/api/src/modules/interaction-simulation-lite/*-rule.ts` 内纯函数**；**禁止** v0 首版默认走 `interaction-simulation-lite` 的模型 HTTP。

### 2.3 来自 P6.z — **v0 首版不接**

| 原因 | 说明 |
|------|------|
| **依赖 `MatchResult`** | P6.z fusion 需要 **`finalScore` + matchResultId`** 等系统读数；初筛批次 **常无** 对每一候选的 `MatchResult`。 |
| **避免隐式 LLM** | 保持「**无新增 LLM**」红线。 |

**后续 v0.1**：在 **已存在** `matchResultId` 的 **重筛 / 复盘** 场景下，可 **可选**并入 **P6.z 规则层三源档位**（仍不调新 LLM），**另文**扩展 DTO。

### 2.4 本轮明确不接的其他信号

- **P6.x 模型路径**（`POST /match-review-ai/review` 的 LLM JSON）。  
- **P6.y 模型路径**（`GET ...` 内模型补全）。  
- **真实聊天 transcript**、站内消息全文、站外 IM。  
- **预览池第三步真实图像 LLM**（与初筛 **正交**）。  
- **Worker 内部中间分**（非 `MatchResult.finalScore` 且未在初筛 DTO 声明的字段）。

---

## 3. `prescreenScore` 与 `bucket` 的关系

### 3.1 主语义：**`bucket`**

| `bucket` | 含义（内部） |
|----------|----------------|
| **`promote`** | 静态 + P6.y 规则层一致指向 **「更值得优先曝光 / 进池素材优先」**。 |
| **`neutral`** | 可进大盘；**不优先也不抑制**。 |
| **`demote`** | **建议后排 / 降采样**；**默认不**等价于「违规踢除」（见 §3.4）。 |

### 3.2 划档规则（v0 建议钉死 — 可调常量、单测锁定）

**先算两源档位**（内部枚举，可不外露）：

1. **静态档 `S_tier`**：`reviewStaticScore >= 58` → `up`；`40–57` → `mid`；`< 40` → `down`（阈值与 P6.x 规则层习惯对齐，**实现常量单点配置**）。  
2. **P6.y 规则 `verdict`**：`worth_exploring` → `up`；`cautious` → `mid`；`pause` → `down`（与现有 `verdictFromAxes` 语义一致）。

**合成 `bucket`（主表）**：

| `S_tier` \ `verdict` | `up` | `mid` | `down` |
|----------------------|------|-------|--------|
| **`up`** | **promote** | **neutral** | **neutral** |
| **`mid`** | **neutral** | **neutral** | **demote** |
| **`down`** | **neutral** | **demote** | **demote** |

**设计意图**：**任一 `down` 静态** 或 **`pause` verdict** 倾向 **不 promote**；**双 `up`** 才 **promote**（保守、可解释）。

**冷场 / 误解 `high`**：若规则层 **`verdictFromAxes` 已输出 `pause`**，则已被 `down` verdict 吸收；若未来出现 **verdict 非 pause 但 `cold===high`** 的扩展，**v0.1** 再开补丁行，**首版不增表复杂度**。

### 3.3 `prescreenScore`（0–1，**排序辅助**）

在 **`bucket` 已确定** 后，用于 **同桶内排序** 与 **全局稳定全序**（可选）：

\[
\texttt{prescreenScore} = w_s \cdot \frac{\texttt{reviewStaticScore}}{100} + w_v \cdot V + w_b \cdot B
\]

- **`V`**：`verdict` 序数，`worth_exploring=1`、`cautious=0.5`、`pause=0`（示例）。  
- **`B`**：四轴 band 压缩为 **0–1** 小整数再归一（如 `cont` high=1、medium=0.5、low=0；**权重低于 `V`**）。  
- **`w_s + w_v + w_b = 1`**（常量表实现时写死）。

**同 `bucket` 内**：按 **`prescreenScore` 降序**；并列按 **`candidateUserId` lex asc** 打破平局（稳定、可测）。

### 3.4 默认只做建议，不做硬删除

- **默认**：`demote` **仅**影响 **shadow 排序 / 采样概率 / tie-break**，**不**从 DB 删除用户、**不**改写 **`passesPreferenceHardGate`**。  
- **若** 产品要强约束「`demote` 不进预览池素材」：必须 **单独 feature flag** + **专文变更**，**不在 v0 首版默认开启**。

---

## 4. 与当前预览池 / matching 的衔接方式

### 4.1 默认：**shadow / 只读**

| 衔接 | v0 行为 |
|------|---------|
| **matching / worker** | **不读** `prescreen` 结果；**不改** `computeFinalScoreV1`；**不写** `MatchResult`。 |
| **对外** | 默认 **仅日志或内部 dashboard** 消费；或 **Admin 调 Service / 调可选 HTTP** 看 JSON。 |
| **预览池** | **可选**：`collectGatedCandidates` 之后、`assignLayeredSixUserIds` 之前，若 **`purpose === preview_pool_hint` 且 flag 开启**，用 **全序（bucket 优先 + score）** 作为 **`G_all` 稳定排序的前置重排**（**仍过 gate**，**不**替代 gate）。 |

### 4.2 不改 worker 主公式的前提下「怎么接」

- **只读侧车**：初筛结果是 **平行数组**；worker 仍只读 **`PreviewPoolItem` + 原 user 字段**。  
- **若** 预览池消费：仅改变 **写入 6 槽前的候选人顺序来源**（**素材池有序列表**），**不**把 `prescreenScore` 写入 `PreviewPoolItem` v0（避免 schema 迁移）；需要时 **仅 `itemMeta` 调试块** 可讨论，**默认不写**。  
- **batch 顺序**：若未来 worker 支持 **queue 优先级**，可由 **独立字段** 注入队列元数据 —— **非 v0 首版范围**。

---

## 5. 本轮明确不做什么

- **不**生成 **transcript**、多轮对话、角色扮演。  
- **不**接 **新图像 / 多模态供应商**（与预览池视觉真实 LLM **分列**）。  
- **不**返回 **用户可见长文**（响应仅 **bucket + score + reasonCodes**）。  
- **不**把初筛结果 **写入 `MatchResult`** 或 **覆盖** `finalScore` / `reasonSummary`。  
- **不**新增 **真实 LLM** 调用路径（含 P6.x / P6.y / 其它模型的默认-on）。  
- **不**在 v0 首版默认依赖 **P6.z**（见 §2.3）。

---

## 6. 最小测试建议（只列项，不编码）

1. **纯规则**：固定两份 `UserProfile` fixture，`reviewStaticScore` + `verdict` 组合覆盖 **9 格 bucket 表**，断言 **`bucket` 与表一致**。  
2. **同桶 score 序**：同一 `bucket` 内两条候选，`prescreenScore` 高者 **排在前面**（若实现全局排序）。  
3. **无 LLM**：mock / 网络隔离下 **零** 对外 LLM URL 调用计数为 **0**。  
4. **画像缺失**：候选无 `UserProfile` → **`droppedCandidates`** 或跳过行，**不 throw** 整批（或整批 **400** 策略二选一 **写死**）。  
5. **上限**：`candidateUserIds.length > 200` → **400** 或截断策略 **写死**。  
6. **预览池衔接（若实现）**：`ENABLED` 关 → 与未接初筛前 **同序**；开 → 仅 **promote 桶相对前移** 可观测。  
7. **worker 回归**：跑现有 **batch-match** 单测或 smoke：**行为不变**（初筛 shadow 默认关）。

---

## 7. 与阶段定义文档的交叉索引

- **产品边界与动机**：[`P6-backend-intelligent-prescreen-v0.md`](../specs/P6-backend-intelligent-prescreen-v0.md) §1–§2。  
- **P6.y 规则实现细节**：[`P6.y-interaction-simulation-lite.md`](../specs/P6.y-interaction-simulation-lite.md) 与 `interaction-simulation-lite-rule.ts`。  
- **静态摘要**：`match-review-static-summary.ts` 与 [`P6.x-match-review-ai-mvp.md`](../specs/P6.x-match-review-ai-mvp.md)。

---

*开工编码前：将 §1.3 排序约定、§3.2 阈值、§4.1 预览池 flag 名 **与 PR 模板对齐**，并在 PR 描述中引用本文 commit 锚点。*
