# Final Match — `finalMatchConsumptionHint` 消费协议 v0（固定合同）

> **本文性质**：`PostPoolOrchestrationMvpEnvelopeDto.finalMatchConsumptionHint` 的 **very small 消费协议**；与 orchestrator A2 返回体对齐，**作为下一轮「调用方转交 hint（A）」的实现依据**。  
> **非目标**：不定义新 API、不扩展 B1、不涉及 worker 主公式、不涉及 `MatchResult.finalScore`。  
> **类型真源**：字段形状以 `apps/api/src/modules/post-pool-deep-screen/post-pool-deep-screen.types.ts` 中 `PostPoolOrchestrationMvpEnvelopeDto` 为准；**语义以本文为准**（尤其 `ready` 与降级）。

---

## 1. 信封绑定

- `finalMatchConsumptionHint` **仅**在与 **`schemaVersion === "post_pool_orchestration_mvp_v0"`** 的 orchestration MVP **同一响应 payload** 内具有本协议含义。  
- 跨页面 / 跨会话转交时，调用方须同时绑定该 **`schemaVersion`**（或等价显式字段），否则按 **§4 schema 不兼容** 丢弃整段 hint。

---

## 2. 最小消费字段子集

消费方（例如 Final Match 内部区）若只做 **very small** 展示与对齐验收，**至少**约定下列字段；其余字段可忽略或仅用于日志。

| 字段 | 用途 |
|------|------|
| **`source`** | 必须为字面量 **`"orchestrator_a2"`**；否则整段 hint **不消费**（§4）。 |
| **`poolId`** | 本次编排对应的 `PreviewPool.id`；排障与「本次 run 对应池子」对齐。 |
| **`runMode`** | `shadow` \| `hint_only` \| `mvp`；解释 enqueue 与否，与 `aiSimulation.enqueued` 一致阅读。 |
| **`ready`** | 见 **§3**；**不得**与 `sidecarReady` 混用。 |
| **`prescreen.candidateCount`** | prescreen 结果条数。 |
| **`prescreen.bucketCounts`** | `promote` / `neutral` / `demote` 计数；内部摘要。 |
| **`aiSimulation.enqueued`** | 是否与「已发生 enqueue」语义一致（与 `simulationJobId` 是否为空配合读）。 |
| **`aiSimulation.simulationJobId`** | 应与 deeplink query 中 **`aiSimJobId`** 一致（**同一次**响应内）；与 URL 对照。 |
| **`aiSimulation.acceptedCandidateCount`** | 可选；enqueue 规模摘要。 |
| **`notes`** | 可选；实现方短句，**不得**作为唯一真相；缺失不影响本协议。 |

**扩展字段**：若未来在同名对象上出现未在本 v0 列出的字段，消费方 **默认忽略**，直至协议版本 bump。

---

## 3. `hint.ready`、`deeplink.ready`、`sidecarReady` 的关系

**定义（与当前 orchestrator 实现对齐）**

| 符号 | 含义 |
|------|------|
| **`hint.ready`** | `finalMatchConsumptionHint.ready`；当前实现为 **`simulationQueueHint.length > 0`**（经编排产生的模拟队列 hint 非空）。表示编排侧「存在可用于模拟排序的 prescreen 输出」，**不**等价于「已 enqueue」或「URL 必有 job」。 |
| **`deeplink.ready`** | 同信封内 `deeplink.ready`；当前实现为 **`Boolean(simulationJobId)`**，即 deeplink query 是否带有 **`aiSimJobId`**。 |
| **`sidecarReady`** | Final Match 页面约定：**`hasJobId` ∧ `hasReadableJob` ∧ `candidateInJob`**（来自 URL 的 job id + **job 只读查询**的运行态）。 |

**合同**

1. **`hint.ready` 不蕴含 `sidecarReady`**。  
2. **`deeplink.ready === true` 不蕴含 `sidecarReady`**（仍可能 job 未就绪、不可读或候选不在 job 内）。  
3. **`sidecarReady === true` 时**：通常应有 **`aiSimulation.simulationJobId`** 与 URL 一致且 **`aiSimulation.enqueued === true`**；**不要求** `hint.ready` 必为真；若与 job 冲突，**以 job 为准**（§4 stale）。  
4. **展示**：「侧车就绪」**只**应使用 **`sidecarReady`**（或上述三条件等价表述）；**禁止**用 `hint.ready` 代替侧车就绪文案。

---

## 4. 降级策略

| 场景 | 行为 |
|------|------|
| **无 hint**（未转交、存储为空、键不存在） | 不展示任何**仅依赖 hint** 的字段；Final Match **仅**依赖 **URL query**（`userId`、`aiSimJobId`）+ **job 只读查询**。主流程与主结论不变。 |
| **stale**（例如 `simulationJobId` 与 URL 中 `aiSimJobId` 不一致、或与当前导航上下文无法对齐） | **整段 hint 不消费**；仍以 **URL + job** 为侧车唯一依据。可选：内部一行说明 hint 已忽略。 |
| **`schemaVersion` 不兼容**（转交绑定的 orchestration 版本 ≠ **`post_pool_orchestration_mvp_v0`**） | **整段丢弃**，等同无 hint。 |
| **`source !== "orchestrator_a2"`** | **整段丢弃**，等同无 hint。 |

**原则**：任何降级 **不得** 因 hint 失败而阻断页面或修改主结论。

---

## 5. 为什么 hint 不能替代 job，也不能替代主结论

- **不能替代 job**：hint 仅为 **一次 orchestrator 响应中的摘要**，不包含 job **运行态**（排队、进行中、失败、item 级失败等）。**`sidecarReady`** 必须依赖 **job 只读查询**（或与其等价的既有通道）与真实执行对齐。  
- **不能替代主结论**：hint / 侧车均为编排与模拟的 **旁路信息**，**不参与** worker 主公式与 **`MatchResult.finalScore`**；消费方 **不得** 用 `bucketCounts`、`ready`、`notes` 等推断或覆盖最终匹配结论。

---

## 6. 后续落地 A：调用方转交 hint（推荐方式，无代码）

本节约定 **实现 A 时**的推荐做法；**不**新增后端 API。

1. **时机**：调用方拿到 **完整 orchestration MVP 响应**之后，在导航至 **`deeplink.finalMatchUrl`** 之前或同时完成转交。  
2. **载荷**：转交 **§2 最小子集** 的 JSON，或整段 `finalMatchConsumptionHint`，并显式附带 **`orchestrationSchemaVersion: "post_pool_orchestration_mvp_v0"`**（或与 §1 等价的绑定信息），保证与本次响应同源、`simulationJobId` 一致。  
3. **载体**：优先 **同域 `sessionStorage`**（键名建议 **版本化**，例如包含 `v0` 与 `poolId` 或 `jobId` 之一），写入后再打开 deeplink；Final Match **同域读取**。  
4. **避免**：将整段 hint 放入 URL query（长度、编码、日志与泄露风险）；除非将来单独定义长度与安全上限。  
5. **一致性**：进入 Final Match 后执行 **§4 stale** 规则：比对 hint 内 `aiSimulation.simulationJobId` 与 URL `aiSimJobId`，不一致则丢弃 hint。  
6. **与 B1 无关**：转交通道不经过预览池视觉增强链路。

---

## 7. 版本

- **v0**：与 Round 2 orchestrator A2、`post_pool_orchestration_mvp_v0` 对齐；字段或语义变更时 bump 版本并另起文档或在本文追加修订段。
