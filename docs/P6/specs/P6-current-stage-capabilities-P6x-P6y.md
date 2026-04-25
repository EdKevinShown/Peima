# P6 当前阶段能力总结（P6.x + P6.y）

> **当前主链定义（唯一真源）**：以 [`P6-current-matching-chain-single-source-of-truth.md`](../truth/P6-current-matching-chain-single-source-of-truth.md) 为准；本文若与其冲突，以真源文档为准。

> **用途**：开新阶段前快速回顾「现在仓库里 P6 这两条切片已经交付到什么粒度」。**权威细节仍以专文为准**：[`P6.x-match-review-ai-mvp.md`](./P6.x-match-review-ai-mvp.md)、[`P6.y-interaction-simulation-lite.md`](./P6.y-interaction-simulation-lite.md)。

---

## P6.x 做了什么（AI Match Review MVP）

- **对象**：当前登录用户 × **其最新一条** `MatchResult` 的候选人（请求里带 `candidateUserId`，且须与该结果一致）。
- **输入**：双方问卷画像（与 **`GET /questionnaire/profile`** 同源）；先算 **静态摘要**（含 `reviewStaticScore` 等），再可选走 **大模型** 产出结构化复审 JSON。
- **接口**：**`POST /match-review-ai/review`**，JWT；**不落库**；不改变 worker 侧 **`computeFinalScoreV1`** 等打分公式。
- **失败与归因**：未开模型或未配 Key → **规则层**，`fallbackUsed === false`（未尝试模型）；模型失败 / JSON 无效 → 规则填充，`fallbackUsed === true`，`sourceType` 等见专文。
- **上游配合**：预览池与 batch-match 已约束「有图 + 有 `user_profiles`」，避免最终匹配指向无画像候选人导致复审 **404**；历史脏数据需按 P6.x 文档重新池化与跑批。

---

## P6.y 做了什么（Interaction Simulation Lite）

- **对象**：当前用户 × **某一条** `MatchResult`（按 **`matchResultId`** 拉取，JWT 且须为该行的 `userId`）。
- **输入**：与 P6.x **同源**的静态分 + `buildMatchReviewStaticSummary` 结构化摘要；输出 **四轴**（接话顺畅度、冷场风险、误解风险、继续了解信号）+ **总评**（`verdict` + `summary`）。
- **接口**：**`GET /interaction-simulation-lite/match-results/:matchResultId`**；**不落库**；不改 matching、不绑 worker。
- **规则层**：**v2**（raw 决策表 → coherence → verdict → summary；`labelFitSummary` 仅作总评末段 trailer）。
- **模型路径**：`INTERACTION_SIMULATION_LITE_*` 与 P6.x 的 `MATCH_REVIEW_AI_*` **相互独立**；本地已 DeepSeek 冒烟通过（`interaction_simulation_lite_model_deepseek`，`fallbackUsed: false`）。
- **验证状态（本轮）**：**模型成功路径**与**模型失败 fallback 路径**均已本地验证；fallback 时 **`debug.meta.reason` 含 `network`**（错误 `BASE_URL` / fetch 层失败等），与 `timeout` / `http_error` / `invalid_json` 等同表可查专文。

---

## 当前用户在 Final Match 页能体验到什么

| 区块 | 行为概要 |
|------|----------|
| **AI 匹配复审（MVP）** | 用户点击 **获取相处参考** → **`POST /match-review-ai/review`**；展示复审分、推荐档位、优劣势列表、解释、对话/长期潜力等；折叠 **debug** 里可看静态分、`finalScore`、`sourceType`、`fallbackUsed`、`meta.reason` 等。 |
| **初次聊天互动预判** | 进入页或刷新时按当前 **`MatchResult.id`** 拉取 **`GET /interaction-simulation-lite/match-results/:id`**；展示四轴 band + 一句说明 + 总评；debug 归因字段与 P6.y 专文一致。 |

两条能力**并列、独立配置**；是否走真实 LLM 取决于各自 env，失败时用户仍能看到**规则填充**的同一 UI 形状（文案来源可能不同）。

---

## 已知边界（共性 +分条）

**共性**

- **只读 AI 结果层**：不在此链路里写业务表、不替代 matching 主决策、不是多 Agent / 全链路 simulation 产品形态。
- **问卷与画像依赖**：无画像或鉴权不匹配会得到 **403 / 404**；与 P6.x 文档中的准入说明一致。
- **`fallbackUsed === false`** 不能单独证明「一定走了模型」；须结合 **`sourceType`**（P6.x / P6.y 各自约定见专文）。

**P6.x 特有条目**

- 复审针对 **最新** `MatchResult` + 请求体候选人校验；不修改问卷打分算法。
- 历史无画像的 `MatchResult` 需数据侧修复，非本接口自动修复。

**P6.y 特有条目**

- **非聊天模拟器**：不生成多轮对话、不预测具体话术；基于**静态画像**的互动倾向文案。
- 规则 v2 与模型输出的文风可不一致；对比实验以 `debug.sourceType` 为准。

---

## 文档与代码入口（回顾用）

| 切片 | 专文 | API 模块（概念） |
|------|------|------------------|
| P6.x | `docs/P6/specs/P6.x-match-review-ai-mvp.md` | `apps/api/src/modules/match-review-ai/` |
| P6.y | `docs/P6/specs/P6.y-interaction-simulation-lite.md` | `apps/api/src/modules/interaction-simulation-lite/` |
| 前端 | 同上专文「前端」节 | `FinalMatchPage.jsx` 及相关 `apps/web/src/api/*` |

---

*本文件仅作阶段快照总结；接口字段与验收步骤以专文与 OpenAPI/实现为准。*
