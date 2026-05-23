# M5 Closure — RRM Top2 Final Display Decision Layer

## 1. 一句话结论

M5 已完成将 **RRM-Sim** 从 **只读 / shadow 观察层** 接到 **enabled display 读路径**：在开关与 eligible 规则下，**不覆盖** `MatchResult.candidateUserId`，**不修改** `finalScore`，而是通过 **M3.8 已有 display 层**（`resolveMatchResultDisplay`）影响 **`displayCandidateUserId` / `displaySourceType`**。M5.3 产品路线收敛为 **`20 维 / Static shortlist → Static Top2 → RRM Top2 bounded selector → Guardrails eligibility → resolveMatchResultDisplay → display*`** 的低成本主链；Pairwise finalize 在 RRM 未命中时仍可作为 **fallback**（与 [M5.3-B](./M5.3-B-rrm-top2-resolver-extension-design.md) 优先级表一致）。

## 2. M5 完成范围总览

| 里程碑 | 内容摘要 | 状态 |
|--------|----------|------|
| **M5.0-A** | RRM Context Adapter Spec：RRM Core、Adapter、`sourceVersion`、禁止混用 Pairwise RRM-lite 与 RRM-Sim。 | **Done** — [M5.0-rrm-context-adapter-spec.md](./M5.0-rrm-context-adapter-spec.md) |
| **M5.0-B** | Multi-source Matching Decision Plan：四源语义、侧车 contract 草案、M5.1～M5.3 拆分。 | **Done** — [M5.0-multi-source-matching-decision-plan.md](./M5.0-multi-source-matching-decision-plan.md) |
| **M5.1** | Readonly final decision sidecar（`multiSourceFinalDecision`）；GET **不重算**、**不接管** display。 | **Done**（与 M5.0-B §2 及实现路径一致；细节见各模块文档） |
| **M5.2-M0** | Shadow contract：`GET /matching/result` 上 `multiSourceFinalDecision` 形态与 `shadow` / `decisionTrace`；默认不计算可采纳的 proposed display。 | **Done** — 见 [M5.2-shadow-source-wiring-plan.md](./M5.2-shadow-source-wiring-plan.md) §2 |
| **M5.2-M1** | Shadow source wiring 规划：各 source 可用性、GET 红线、RRM 摘要 Option B。 | **Done** — 同上文档 |
| **M5.2-M2** | Viewer-safe `rrmSimReadonlySummary` writer（写入路径与解析器对齐）。 | **Done**（本轮收口按仓库已交付能力归类；契约见 M5.2-M1 §6） |
| **M5.2-M3** | Shadow proposal 纯计算（侧车内 `m5Proposed*` 等；**不改变**用户所见 display）。 | **Done** |
| **M5.2-M4** | Shadow run record / Admin audit CLI 与脱敏聚合口径。 | **Done**（工具与文档；不含「全量生产已跑通」断言） |
| **M5.2-M5** | Shadow audit **Round 1** run record：已记录 CLI 执行与阻塞原因。 | **Done**（文档与流程闭环） / **Partial**（**无有效 aggregate**：执行环境缺 `DATABASE_URL`，CLI 未进入查询阶段，**未粘贴、也未验证任何真实分布数字**）— [M5.2-shadow-audit-run-round1.md](./M5.2-shadow-audit-run-round1.md) |
| **M5.3-A** | RRM Top2 enabled display 计划：开关、eligible、Top2 来源冻结、GET 不重算。 | **Done** — [M5.3-rrm-top2-enabled-display-plan.md](./M5.3-rrm-top2-enabled-display-plan.md) |
| **M5.3-B** | Resolver 扩展设计：优先级、侧车表方案、env、`noOpReasonCode`。 | **Done** — [M5.3-B-rrm-top2-resolver-extension-design.md](./M5.3-B-rrm-top2-resolver-extension-design.md) |
| **M5.3-C1** | RRM Top2 display meta 基础（持久化 / parser / 与 Top2 绑定）。 | **Done** |
| **M5.3-C2** | Resolver default-off 集成（RRM 分支 + Pairwise fallback）。 | **Done** |
| **M5.3-C2.1** | Env parser hardening（`1` / `true` / `yes` 等）。 | **Done** |
| **M5.3-D** | Enabled display targeted regression run record。 | **Done** — [M5.3-enabled-display-regression-run-round1.md](./M5.3-enabled-display-regression-run-round1.md) |
| **M5.3-E** | Feedback `decisionContext` prep（M6.1 归因形状与红线；本轮无业务代码）。 | **Done** — [M5.3-feedback-decision-context-prep.md](./M5.3-feedback-decision-context-prep.md) |
| **M5.1 三层轨道** | `rrm-shared` + Observed / Assistant / Timeline Adapter + Eval Consumer（r1～r12）；**不**改 MatchResult 主链。 | **Done** — [M5.1-closeout.md](./M5.1-closeout.md) · [M5.1-rrm-three-layer-architecture.md](./M5.1-rrm-three-layer-architecture.md) |

**说明**：上表 **不**声称 M5.2-M5 已在真实 DB 上产出统计上可信的 shadow aggregate；该子项的 **数据面** 仍为 **Partial / Blocked**，直至在具备合法 `DATABASE_URL` 的环境重跑并单独修订 run record（见 M5.2-M5 文档 §4～§8）。

## 3. 当前最终架构（数据流）

```text
20维 / Static / shortlist
  → Static Top2（冻结快照 / fingerprint；非 GET 重算）
  → RRM Top2 bounded selector（RRM-Sim 在 Top2 内二选一；结果进入 viewer-safe 摘要 + 展示侧车）
  → Guardrails eligibility（resolver 内 eligible 规则；非完整产品 guardrail 引擎替代）
  → resolveMatchResultDisplay
  → displayCandidateUserId / displaySourceType
```

**并列与回退**（读路径语义，非独立流水线）：

- **`multiSourceFinalDecision`**（M5.1 / M5.2）仍为 **只读侧车**，**不参与** display 解析（见 [M5.3-rrm-top2-enabled-display-plan.md](./M5.3-rrm-top2-enabled-display-plan.md) §3、§8）。
- **RRM 未命中**（env off、meta 缺失、ineligible 等）时，**仍**可走 **Pairwise finalize** 或 **`match_result_original`**（见 M5.3-B 优先级表）。

## 4. 关键文档索引

| 文档 | 用途 |
|------|------|
| [M5.0-rrm-context-adapter-spec.md](./M5.0-rrm-context-adapter-spec.md) | RRM 唯一公式入口与 Adapter 红线。 |
| [M5.0-multi-source-matching-decision-plan.md](./M5.0-multi-source-matching-decision-plan.md) | M5 总计划与 M6.0/M6.1 衔接表。 |
| [M5.2-shadow-source-wiring-plan.md](./M5.2-shadow-source-wiring-plan.md) | M5.2-M0～M3 源接入与 GET 约束。 |
| [M5.2-shadow-audit-run-round1.md](./M5.2-shadow-audit-run-round1.md) | M5.2-M5 audit **Round 1**；aggregate **blocked** 记录。 |
| [M5.3-rrm-top2-enabled-display-plan.md](./M5.3-rrm-top2-enabled-display-plan.md) | Enabled display 产品步骤与风险。 |
| [M5.3-B-rrm-top2-resolver-extension-design.md](./M5.3-B-rrm-top2-resolver-extension-design.md) | Resolver 优先级与侧车读取契约。 |
| [M5.3-enabled-display-regression-run-round1.md](./M5.3-enabled-display-regression-run-round1.md) | M5.3-D 自动化回归验收记录。 |
| [M5.3-feedback-decision-context-prep.md](./M5.3-feedback-decision-context-prep.md) | M6.1 `decisionContext` 形状与 Feedback 红线。 |
| [M5.1-closeout.md](./M5.1-closeout.md) | 三层架构 r1～r12 交付矩阵 · HTTP · 验收。 |
| [M5.1-rrm-three-layer-architecture.md](./M5.1-rrm-three-layer-architecture.md) | Core / Adapter / Consumer canonical。 |

## 5. 架构不变量（M5 收口重申）

- **`MatchResult.candidateUserId`**：M5 **不**将其作为 RRM「覆盖写入」目标；baseline 语义保持不变。
- **`finalScore`**：行上分数 **不因** display 或 RRM 展示分支改写。
- **`GET /matching/result`**：**不**在现场重跑 RRM evaluator；**不**为 display 重算 Top2（与 M5.3-A §10、M5.3-D 回归结论一致）。
- **`multiSourceFinalDecision`**：**不**接管 `displayCandidateUserId` / `displaySourceType`。
- **Shadow**：M5.2 侧车提议 **默认**不改变用户所见；M5.3 enabled 由 **独立 env + meta + eligible** 门控。
- **Feedback**：不自动回写匹配、画像或 RRM meta（见 M5.3-E）。

## 6. 已知缺口与后续（非 M5 范围）

| 主题 | 说明 |
|------|------|
| **M5.2-M5 aggregate** | 需在配置 `DATABASE_URL` 的环境重跑 audit CLI，另开 **Round 2** 文档或修订 M5.2-M5；**禁止**用占位数字冒充已通过。 |
| **M6.1** | 实现 `decisionContext` 写入 `user_feedbacks` 的 **新 `sourceVersion` + 校验分支**（与 P6.12 结构化负载分支并存）；见 M5.3-E。 |
| **M9** | 基于归因桶聚合反馈与满意度；见 M5.3-E §7。 |
| **真实 DB enabled 审计** | M5.3-D 为 **targeted Jest + tsc**；全量生产形态审计仍属后续 runbook / M5.3-D2 类工作。 |

## 7. 修订记录

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-05-02 | M5.3-F：M5 总收口文档首版；引用所列 M5 文档；M5.2-M5 aggregate 标 Partial/Blocked。 |
