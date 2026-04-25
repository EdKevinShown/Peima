# 后台智能初筛 / 模拟聊天筛选 v0 — 阶段定义（仅定义，不编码）

> **当前主链定义（唯一真源）**：以 [`P6-current-matching-chain-single-source-of-truth.md`](../truth/P6-current-matching-chain-single-source-of-truth.md) 为准；本文若与其冲突，以真源文档为准。

> **定位**：在 **系统内部** 回答「**谁更值得进入下一轮匹配曝光 / 预览池素材 / 批处理优先序**」，**不是**用户匹配成功后的代聊、**不是**客服陪聊产品。  
> **与「完整 transcript 模拟」的关系**：v0 **不做**多轮对话全文生成；仅使用 **问卷画像 + 静态兼容摘要 + 已有 P6.x / P6.y / P6.z 语义产物** 的 **压缩信号** 做 **轻量排序 / 分桶 / 过滤建议**。  
> **权威上游能力回顾**：[`P6-current-stage-capabilities-P6x-P6y.md`](./P6-current-stage-capabilities-P6x-P6y.md)（P6.x 复审、P6.y 互动预判）；P6.z 一眼读数 [`P6.z-readout-fusion-v0-implementation-notes.md`](../truth/P6.z-readout-fusion-v0-implementation-notes.md)。预览池链：[`P6-preview-pool-layered-selection-v0.md`](../truth/P6-preview-pool-layered-selection-v0.md) 等。

---

## 1. 这一步要解决什么问题

| 痛点 | v0 意图 |
|------|---------|
| **预览池与 worker 主链**仍以「规则分 + 小池 6 人」为主，**全局候选人空间**缺少统一的「相处/互动」先验排序。 | 在 **不入主决策公式** 的前提下，对 **一批候选人**（可大于 6）输出 **内部用的优先序或风险标签**，供 **预览池抽样、批匹配排序、运营实验** 消费。 |
| **P6.x / P6.y / P6.z** 已证明能在 **单对（viewer × 一条 MatchResult）** 上产出可读信号，但 **未复用为批量初筛**。 | 把同一套 **静态摘要 + 规则层 + 可选 LLM 摘要字段** 批量化到 **N 对候选人**，形成 **可缓存的轻量特征向量（标量或少量枚举）**，避免每次现场拼 prompt。 |
| **「模拟聊天」**若理解为产品，易与 **真聊天** 混淆。 | v0 将「模拟」限定为 **基于画像的互动倾向与沟通风险维度**（与 P6.y 精神一致），**不产出聊天 transcript**。 |

---

## 2. 为什么它是现在最合理的下一步

1. **预览池线已闭环**：gate → 分层 → 视觉 stub → 文档与回退清晰；继续在池内堆能力会出现 **边际收益递减** 与 **产品叙事分散**。  
2. **P6.x / P6.y / P6.z 已积累「单对可读信号」**：缺的是 **批量编排与内部消费契约**；在 **不重写 worker** 的前提下，**复用** 比新造一套「聊天模拟器」便宜。  
3. **大目标「更准地筛人」** 的下一杠杆在 **「池子之前或池子之外的排序」**，而不是再改 **6 槽内排序**  alone。  
4. **风险可控**：若坚持 **不落库 / 或仅落内部队列表**，可与 **matching 主结果** 解耦，先做 **shadow 排序** 或 **API-only 初筛分**。

---

## 3. 输入是什么（v0）

**最小输入集合**（均可从现网能力推导或已存在接口同源）：

| 输入 | 来源 / 说明 |
|------|----------------|
| **Viewer 侧** | `UserPreference`（与 gate 维度对齐部分）、**问卷画像**（`UserProfile` / `GET /questionnaire/profile` 同源聚合）。 |
| **候选人侧（批量）** | 每个候选人的 **问卷画像**、**静态兼容摘要**（与 P6.x 所用 `buildMatchReviewStaticSummary` 同源或子集）。 |
| **语义增强（可选）** | 若已存在 **MatchResult** 上下文：可复用 **P6.x 复审结构化片段**、**P6.y 四轴**、**P6.z 读数融合** 的 **规则层或已缓存模型输出**；v0 允许 **仅规则层** 跑通。 |
| **批次元数据** | `viewerUserId`、候选 `userId[]` 列表、可选 **`purpose`**（`preview_pool_feed` / `batch_match_order` / `experiment_shadow`）。 |

**不在 v0 输入内**：真实微信/站内聊天记录、多轮对话 state、完整 transcript。

---

## 4. 输出是什么（v0）

**最小输出**（建议全部可 JSON 序列化，默认 **不落库** 或落 **仅内部可删** 的审计表 —— 实现阶段再定）：

| 输出 | 说明 |
|------|------|
| **对每个 `(viewer, candidate)`** | **`prescreenScore` ∈ [0,1]** 或 **有序 rank**；**`bucket` ∈ { promote, neutral, demote }**（三档即可）。 |
| **可选 `reasonCodes[]`** | 短枚举，如 `static_compat_low` / `interaction_risk_high` / `readout_conflict` —— 便于日志与调试，**不给用户长文** v0。 |
| **可选 `debug`** | `fallbackUsed`、`sourceType` 与 P6 切片对齐，便于与现有 Final Match 调试习惯一致。 |

**不输出**：匹配最终决定、聊天话术、完整模拟对话、对用户的承诺性文案。

---

## 5. 最小规则怎么定（v0）

**原则**：**可解释 > 复杂**；**规则层默认能跑通**；**LLM 可选且失败不拖垮批次**。

1. **主键**：以 **静态兼容摘要** 已有标量（如静态分、关键维度 pass/fail）为 **baseline 排序**。  
2. **融合**：若存在 **P6.y 规则层四轴**（或仅其中 2 轴：冷场风险、继续了解信号），以 **固定权重** 压成 **0..1 加分或减分**，**权重和可查表**。  
3. **P6.z**：若已能 cheap 拉取 **读数融合** 的 **单一综合标量**，作为 **tie-break** 或 **±ε 修正**；拉不到则跳过。  
4. **P6.x**：v0 **不强制**调用 LLM；若调用，须 **单对超时 + 单候选失败跳过**，与预览池视觉 stub 的 **单候选回退** 哲学一致。  
5. **硬门槛（可选开关）**：仅当产品明确要求时，**`demote` 桶** 可映射为「**不进预览池素材池**」；默认 v0 建议 **只做排序建议，不做硬删人**。

---

## 6. 如何与当前预览池 / matching 主链衔接

| 衔接点 | 建议关系 |
|--------|-----------|
| **预览池 `collectGatedCandidates` 之后** | **可选**：对 **bounded `G_all`**（如最多 200）算初筛分，再 **在现有 gate + 分层逻辑之前或之后** 用 **初筛 rank 作为 `createdAt` 并列时的 tie-break**（**不改 gate 维度**）。 |
| **预览池之前** | **可选**：从更大候选集合先 **粗筛进「可进入 gate 的候选池」** —— 需谨慎，避免与 **Preference Gating** 语义冲突；v0 更稳妥的是 **「gate 后、分层前」只读排序键**。 |
| **`POST /matching/enqueue` / worker** | **默认不衔接**：初筛结果 **不写 `MatchResult`**、**不改 `computeFinalScoreV1`**；仅允许 **side-channel**（日志、内部 dashboard、或 **实验 flag** 下的 batch 顺序）。 |
| **P6.x / P6.y / P6.z 现接口** | **复用实现代码路径**（共享 `buildMatchReviewStaticSummary` 等），但 **新阶段对外可以是单独 `POST`/`GET`**，避免 Final Match 页承担批量流量。 |

**一句话**：初筛 v0 是 **「批量化、内部化」的 P6 信号编排层**；预览池与 worker **默认行为不变**，仅 **可选消费** `prescreenScore` / `bucket`。

---

## 7. 本轮明确不做什么

- **不**做 **完整 transcript**、多 Agent 角色扮演、或产品化「模拟聊天室」。  
- **不**接 **新图像供应商**（与预览池第三步真实 LLM 升级 **分列**）。  
- **不**改 **worker `computeFinalScoreV1`**、**不改问卷 canonical 计分**、**不改 Preference Gating 维度**。  
- **不**把初筛结果 **默认写入** 用户可见的 **`MatchResult`** 或 **强制影响** 法律责任文案。  
- **不**承诺 **实时**（v0 可 **异步批处理** 或 **限流 API**）。  
- **不**替代 **P6.x / P6.y / P6.z** 单对接口；初筛是 **批量编排层**，不是重写切片。

---

## 8. 与路线图总览的关系

- **预览池链**：[`P6-preview-pool-gating-and-layered-v0.md`](../truth/P6-preview-pool-gating-and-layered-v0.md) — 已阶段性收口。  
- **本阶段**：从「池内增强」转向「**池外 / 批量的更准筛人**」；下一实现 PR 应 **新开专文/模块边界**，勿与预览池第三步真实供应商混 PR。

---

*实现前约定（接口、bucket/score、信号边界、测试项）：**[`P6-backend-intelligent-prescreen-v0-implementation-notes.md`](../truth/P6-backend-intelligent-prescreen-v0-implementation-notes.md)**。*
