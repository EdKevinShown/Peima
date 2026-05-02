# M4 — AI Matching Phase One Closure

## 1. 一句话结论

**M4 第一阶段已完成。** 系统已具备 **RRM 只读排序提案**、**Static / Pairwise / RRM 四源对照**、**批量质量评估（batch regression）**、**Final Match 解释产品化**、以及 **Admin / developer 只读观测 CLI**。当前仍 **不让 RRM 单独覆盖 `MatchResult`**，也 **不改 `finalScore`**；多源信号用于对照、质量评估、用户叙事与观测，**不接管** worker 主排序与最终持久化对象。

---

## 2. 阶段范围

**M4** 定位为 **只读评估 + 解释产品化 + 基础观测** 阶段，不是「多源决策正式接管 MatchResult」阶段。

**M5** 才考虑 **Multi-source Final Decision Layer**（多源与护栏共同参与最终展示决策的设计与实现），须在独立方案评审后推进。

---

## 3. M4.0 — Readonly RRM Ranking Proposal

- **接口**：`GET /matching/rrm-ranking-proposal/:poolId`（JWT + 池归属）。
- **能力**：在不重跑 LLM、不写库的前提下，**只读**生成 RRM 排序「假设」提案。
- **契约语义**（与 [M4.0 文档](./M4.0-readonly-rrm-ranking-proposal.md) 一致）：
  - `appliedToFinalScore === false`
  - `appliedToWorkerRanking === false`
  - **无**「`appliedToMatchResult`」写回路径；**不**通过本 API 改写 `displayCandidateUserId`（可理解为 **`appliedToDisplayCandidate` 语义上为 false**；展示对象仍由既有规则与 `GET /matching/result` 决定）。
- **不变量**：不改 `MatchResult` / `finalScore` / 展示对象语义；真实 DB 验收见 run-record。
- **文档**：
  - [M4.0-readonly-rrm-ranking-proposal.md](./M4.0-readonly-rrm-ranking-proposal.md)
  - [M4.0-readonly-rrm-ranking-proposal-run-record.md](./M4.0-readonly-rrm-ranking-proposal-run-record.md)

---

## 4. M4.1 — Decision Comparison（四源对照）

- **接口**：`GET /matching/decision-comparison/:poolId`（只读）。
- **四源分栏**：`staticShortlist`、`matchResultOriginal`、`pairwiseFrozen`、`rrmReadonly`。
- **能力**：`comparisonSummary` 可呈现 **一致 / 分歧** 等摘要，便于审阅与 batch 脚本复用（不重复实现四源规则）。
- **不变量**：不写库、不改 `GET /matching/result`；真实 DB 验收见 run-record。
- **文档**：
  - [M4.1-three-source-decision-comparison.md](./M4.1-three-source-decision-comparison.md)
  - [M4.1-three-source-decision-comparison-run-record.md](./M4.1-three-source-decision-comparison-run-record.md)

---

## 5. M4.2 — Batch Regression & Quality Metrics

- **脚本**：`packages/database/scripts/m4-2-batch-regression-report.mjs`（只读；复用 M4.1 `getComparison`）。
- **样本**：`sampleCount` 已从 **1 扩容到 5**（与 M4.2 计划/收口一致）。
- **脱敏**：脱敏 run record 已维护；**不提交**含真实 ID 的原始 JSON / local 全量报告。
- **schema_validation**：F1 审计、F2 hardening、F3 回归与 replay 路径已文档化；F3 抽样 replay 结论为 **5/5 succeeded**，**schema_validation remaining = 0**（见 F3 与 closure 文档）。
- **文档**：
  - [M4.2-batch-regression-and-quality-metrics.md](./M4.2-batch-regression-and-quality-metrics.md)
  - [M4.2-batch-regression-sanitized-run-record.md](./M4.2-batch-regression-sanitized-run-record.md)
  - [M4.2-batch-regression-closure.md](./M4.2-batch-regression-closure.md)
  - [M4.2-f1-pairwise-schema-validation-audit.md](./M4.2-f1-pairwise-schema-validation-audit.md)
  - [M4.2-f2-pairwise-schema-validation-hardening.md](./M4.2-f2-pairwise-schema-validation-hardening.md)
  - [M4.2-f3-pairwise-schema-validation-regression.md](./M4.2-f3-pairwise-schema-validation-regression.md)

---

## 6. M4.3 — Final Match Explanation Productization

- **前端**：`FinalMatchPage` 展示产品化完成（Hero + 分段叙事 + 技术折叠 + `?debug=1` 开发者区）。
- **用户主路径**：**最终结论** → **为什么匹配** → **相处节奏** → **需要留意** → **聊天开场**（在 `matchInsights` 合法时；降级路径见 smoke 记录）。
- **验证**：浏览器 / API smoke 已记录；**不改** `displayCandidateUserId` 逻辑、`finalScore`、`GET /matching/result` 语义。
- **文档**：
  - [M4.3-final-match-explanation-productization.md](./M4.3-final-match-explanation-productization.md)
  - [M4.3-final-match-explanation-smoke-run-record.md](./M4.3-final-match-explanation-smoke-run-record.md)

---

## 7. M4.4 — Admin Observability（第一阶段）

- **脚本**：`packages/database/scripts/m4-4-admin-observability-summary.mjs`（CLI 只读聚合）。
- **状态**：脱敏 run record 已落库；**未做** Admin HTTP API、Admin UI、自动 retry / repair。
- **文档**：
  - [M4.4-admin-observability-plan.md](./M4.4-admin-observability-plan.md)
  - [M4.4-admin-observability-summary-run-record.md](./M4.4-admin-observability-summary-run-record.md)
  - [M4.4-admin-observability-closure.md](./M4.4-admin-observability-closure.md)

---

## 8. 已守住的安全边界

- **不写** `MatchResult`；**不改** `MatchResult.candidateUserId`。
- **不改** `finalScore`。
- **不改** `displayCandidateUserId` **核心语义**（含服务端计算与 `GET /matching/result` 契约）。
- **不改** `GET /matching/result` **核心语义**。
- **不改** worker **batch-match** 主排序。
- **不改** pairwise finalize **业务语义**。
- **不改** RRM **公式 / evaluator / extractDPre**。
- **不暴露** raw prompt、raw LLM body、transcript；观测与脱敏文档 **不提交**真实 ID 明细 / 未脱敏 local run records。

---

## 9. 当前能力结论

**AI 匹配模块第一阶段**已交付，具备：

- **20 维 static** 基线（短名单 / 问卷静态侧车语境；与现有 worker / 预览池链协同，**非** M5 多源接管）。
- **Pairwise** AI 决策（独立 job；finalize 侧车不写死 `MatchResult.candidateUserId`）。
- **RRM 只读提案**（M4.0）。
- **四源对照**（M4.1）。
- **批量质量评估**（M4.2 + schema_validation 闭环）。
- **用户端 Final Match 解释产品化**（M4.3）。
- **基础观测 CLI**（M4.4-M1）。

---

## 10. 后续建议

下一阶段进入 **M5 — Multi-source Final Decision Layer**。

**M5 目标**不是让 RRM **单独**接管，而是让 **Static（问卷/短名单基线）**、**Pairwise**、**RRM**、**Guardrails** 等 **共同参与**最终展示与决策边界设计（须与产品/风控一致）。

建议先做 **M5.0-M0 方案扫描**（范围、不变量、与 M4 冻结项的 diff），**不直接写代码**。

---

## 文档索引（M4 子文档）

| 子阶段 | 主说明 | 收口 / 记录 |
|--------|--------|----------------|
| M4.0 | [M4.0-readonly-rrm-ranking-proposal.md](./M4.0-readonly-rrm-ranking-proposal.md) | [run-record](./M4.0-readonly-rrm-ranking-proposal-run-record.md) |
| M4.1 | [M4.1-three-source-decision-comparison.md](./M4.1-three-source-decision-comparison.md) | [run-record](./M4.1-three-source-decision-comparison-run-record.md) |
| M4.2 | [M4.2-batch-regression-and-quality-metrics.md](./M4.2-batch-regression-and-quality-metrics.md) | [sanitized](./M4.2-batch-regression-sanitized-run-record.md) · [closure](./M4.2-batch-regression-closure.md) · F1/F2/F3 |
| M4.3 | [M4.3-final-match-explanation-productization.md](./M4.3-final-match-explanation-productization.md) | [smoke](./M4.3-final-match-explanation-smoke-run-record.md) |
| M4.4 | [M4.4-admin-observability-plan.md](./M4.4-admin-observability-plan.md) | [run-record](./M4.4-admin-observability-summary-run-record.md) · [closure](./M4.4-admin-observability-closure.md) |

---

*阶段标记：M4 — AI Matching Phase One 正式收口*
