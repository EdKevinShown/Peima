# P6 — Shortlist 场景模拟规则总表（`shortlistScenariosV0` / `SHORTLIST_SCENE_KEYS_V0`）

## 声明（必读）

- **仅描述当前 `main` 已实现行为**（以 `apps/api/src/modules/ai-simulation-v1/shortlist-scenarios-v0.ts`、`shortlist-four-dim-v0.ts`、`ai-simulation-v1.constants.ts` 为准）。
- **不代表未来产品或技术路线**；后续若改实现，应同步更新本文与回归测试。
- **若与旧文档、口头约定或设想冲突，以当前实现与回归锚点为准**（见文末「与代码 / 测试锚点」）。

## 1. 范围

- **在范围**：`tryBuildShortlistScenariosV0` 产出的 `ShortlistScenariosV0`、固定 **10** 场景（Phase C v1.0 冻结锚点；含 `future_planning_tradeoff`）、`score` / `status` / 四类解释字段的生成规则；以及各场景 **`score` 被 `tryBuildShortlistFourDimV0` 如何消费**（仅 `score` + `status` 门闩；解释字段不进入四维计算）。
- **不在范围**：`shortlistDecisionV0` 详细规则、`rankConsistent` 落库策略、Final Match UI、worker / `MatchResult.finalScore`（见将另行编写的侧车总表 / 匹配总表）。

## 2. 固定场景清单（权威顺序）

共 **10** 个场景；**顺序以 `SHORTLIST_SCENE_KEYS_V0` 数组为准**（`tryBuildShortlistScenariosV0` 按该顺序 × 每位短名单候选人依次 `push` 行）。

| # | `sceneKey` |
|---|------------|
| 1 | `first_message_opening` |
| 2 | `pace_negotiation` |
| 3 | `boundary_conflict_response` |
| 4 | `misunderstanding_repair` |
| 5 | `long_term_lifestyle_alignment` |
| 6 | `values_commitment_conflict` |
| 7 | `re_engagement_after_lull` |
| 8 | `emotional_support_under_stress` |
| 9 | `friends_family_integration_boundary` |
| 10 | `future_planning_tradeoff` |

每位短名单候选人：**恰好 10 行**（若该候选人 item 非 `SUCCEEDED` 或 evaluator 不可解析，则 10 行均为 `status=failed`、`score=0`，解释字段仍按失败规则填充）。

**Evaluator 输入（`readEvaluator` 成功时）**：`simulationRankScore`（有限数）、`risk_tags`（数组）、`continue_recommendation` ∈ {`explore_more`,`hold`,`slow_down`}。  
**派生量**：`base = clamp01(simulationRankScore)`，`risk = clamp01(len(risk_tags)/6)`。  
**舍入**：`clamp01` 将结果限制在 \[0,1\] 并 **四舍五入到小数点后 4 位**（与实现一致）。

---

## 3. 逐场景规则主表

列说明：**`score` 公式** 使用上述 `base`、`risk`；**`reason` / `riskPoint`** 为 `status==="failed"` 时的固定值见「解释字段规则」节。

| # | `sceneKey` | 目的（1 句） | 输出行字段 | `score`（`status==="succeeded"`） | `reason`（成功；按 `score` 分档） | `riskPoint`（成功） | `evidenceSnippet` | `reviewStatus` | 主要影响 `fourDim` | 单一 / 组合 |
|---|------------|--------------|------------|-----------------------------------|-----------------------------------|----------------------|-------------------|----------------|---------------------|-------------|
| 1 | `first_message_opening` | 首条消息 / 开场是否顺滑 | 7 字段 | `clamp01(base)` | ≥0.75 `opening_flow_good`；≥0.45 `opening_flow_moderate`；否则 `opening_flow_weak` | ≥0.45 `opening_risk_low`；否则 `opening_cold_start_risk` | 通用模板 | 通用规则 | **openingSmoothness**（直接等于该场景 `score`） | 单一 |
| 2 | `pace_negotiation` | 节奏协商与推进意愿 | 7 字段 | `pace`=`explore_more`→1，`hold`→0.6，`slow_down`→0.2；`clamp01((base+pace)/2)` | ≥0.75 `pace_alignment_good`；≥0.45 `pace_alignment_moderate`；否则 `pace_alignment_weak` | ≥0.45 `pace_risk_low`；否则 `pace_mismatch_risk` | 通用模板 | 通用规则 | **continuation**（与 repair、re_engagement 均分）；**longTermStability**（与 lifestyle、values、emotional、friends、future_planning 六均分） | 组合 |
| 3 | `boundary_conflict_response` | 边界 / 冲突情境下的应对 | 7 字段 | `clamp01(1 - risk)`（落入 `scoreForScene` 默认分支） | ≥0.75 `boundary_handling_stable`；≥0.45 `boundary_handling_mixed`；否则 `boundary_handling_fragile` | ≥0.45 `boundary_risk_low`；否则 `boundary_escalation_risk` | 通用模板 | 通用规则 | **conflictRisk**（与 repair、values 三分量平均的反比）；**不**进入 `longTermStability` 六场景分子 | 组合（仅作用于 conflict 维公式） |
| 4 | `misunderstanding_repair` | 误解后的修复能力 | 7 字段 | `recover`=`slow_down`→0.35 否则 0.8；`clamp01((1-risk+recover)/2)` | ≥0.75 `repair_capacity_good`；≥0.45 `repair_capacity_moderate`；否则 `repair_capacity_weak` | ≥0.45 `repair_risk_low`；否则 `misunderstanding_accumulation_risk` | 通用模板 | 通用规则 | **continuation**；**conflictRisk** | 组合 |
| 5 | `long_term_lifestyle_alignment` | 长期生活方式与节奏稳定感 | 7 字段 | `steady`=`explore_more`→0.85，`hold`→0.6，`slow_down`→0.35；`clamp01((base+steady+(1-risk))/3)` | ≥0.75 `lifestyle_alignment_good`；≥0.45 `lifestyle_alignment_moderate`；否则 `lifestyle_alignment_weak`（`sceneKey` 显式分支） | ≥0.45 `lifestyle_risk_low`；否则 `long_term_lifestyle_gap_risk` | 通用模板 | 通用规则 | **longTermStability**（六场景分子之一） | 组合（仅 longTerm 分子） |
| 6 | `values_commitment_conflict` | 价值观 / 承诺张力下的取向 | 7 字段 | `valueFit`=`explore_more`→0.8，`hold`→0.55，`slow_down`→0.3；`clamp01((valueFit+(1-risk))/2)` | ≥0.75 `values_commitment_alignment_good`；≥0.45 `values_commitment_alignment_moderate`；否则 `values_commitment_alignment_weak` | ≥0.45 `values_commitment_risk_low`；否则 `values_commitment_conflict_risk` | 通用模板 | 通用规则 | **conflictRisk**；**longTermStability**（六场景分子之一） | 组合 |
| 7 | `re_engagement_after_lull` | 冷场后再互动 / 再投入 | 7 字段 | `reEngage`=`explore_more`→0.9，`hold`→0.65，`slow_down`→0.35；`clamp01((base+reEngage+(1-risk))/3)` | ≥0.75 `re_engagement_quality_good`；≥0.45 `re_engagement_quality_moderate`；否则 `re_engagement_quality_weak` | ≥0.45 `re_engagement_risk_low`；否则 `re_engagement_dropoff_risk` | 通用模板 | 通用规则 | **continuation**（与 pace、repair 均分）；**不**进入 `longTermStability` 六场景分子 | 组合（仅 continuation） |
| 8 | `emotional_support_under_stress` | 压力 / 低谷下的情绪支持能力 | 7 字段 | `support`=`explore_more`→0.88，`hold`→0.62，`slow_down`→0.38；`clamp01((base+support+(1-risk))/3)` | ≥0.75 `stress_support_capacity_good`；≥0.45 `stress_support_capacity_moderate`；否则 `stress_support_capacity_weak` | ≥0.45 `stress_support_risk_low`；否则 `stress_support_absence_risk` | 通用模板 | 通用规则 | **longTermStability**（六场景分子之一） | 组合（仅 longTerm 分子） |
| 9 | `friends_family_integration_boundary` | 朋友 / 家庭 / 社交圈融入与边界 | 7 字段 | `integration`=`explore_more`→0.86，`hold`→0.6，`slow_down`→0.36；`clamp01((base+integration+(1-risk))/3)` | ≥0.75 `friends_family_boundary_good`；≥0.45 `friends_family_boundary_moderate`；否则 `friends_family_boundary_weak` | ≥0.45 `friends_family_boundary_risk_low`；否则 `friends_family_boundary_strain_risk` | 通用模板 | 通用规则 | **longTermStability**（六场景分子之一）；**不**进入 `conflictRisk` 三分量 | 组合（仅 longTerm 分子） |
| 10 | `future_planning_tradeoff` | 未来规划取舍下的协商、优先级与约束 | 7 字段 | `negotiate`=`explore_more`→0.87，`hold`→0.61，`slow_down`→0.37；`clamp01((base+negotiate+(1-risk))/3)` | ≥0.75 `future_planning_tradeoff_alignment_good`；≥0.45 `future_planning_tradeoff_alignment_moderate`；否则 `future_planning_tradeoff_alignment_weak` | ≥0.45 `future_planning_tradeoff_risk_low`；否则 `future_planning_tradeoff_gap_risk` | 通用模板 | 通用规则 | **longTermStability**（六场景分子之一）；**不**进入 `continuation` / `conflictRisk` | 组合（仅 longTerm 分子） |

---

## 4. 场景 × `fourDim` 影响矩阵（仅 `score` 路径）

说明：**「消费」** 表示该场景的 **`score` 进入该维度的显式公式**；`tryBuildShortlistFourDimV0` **不读**解释字段。

| `sceneKey` | openingSmoothness | continuation | conflictRisk | longTermStability |
|------------|-------------------|--------------|--------------|-------------------|
| `first_message_opening` | 直接等于该场景 score | — | — | — |
| `pace_negotiation` | — | 均分分子之一 | — | 六均分分子之一 |
| `boundary_conflict_response` | — | — | 三分量平均（与 repair、values） | — |
| `misunderstanding_repair` | — | 均分分子之一 | 三分量平均之一 | — |
| `long_term_lifestyle_alignment` | — | — | — | 六均分分子之一 |
| `values_commitment_conflict` | — | — | 三分量平均之一 | 六均分分子之一 |
| `re_engagement_after_lull` | — | 均分分子之一 | — | — |
| `emotional_support_under_stress` | — | — | — | 六均分分子之一 |
| `friends_family_integration_boundary` | — | — | **不消费** | 六均分分子之一 |
| `future_planning_tradeoff` | — | — | **不消费** | 六均分分子之一 |

**四维公式摘要（与实现一致）**

- `openingSmoothness` = `first_message_opening.score`
- `continuation` = `clamp01((pace + repair + re_engagement_after_lull) / 3)`
- `conflictRisk` = `clamp01(1 - (boundary + repair + values_commitment_conflict) / 3)`
- `longTermStability` = `clamp01((lifestyle + values_commitment_conflict + pace + emotional_support_under_stress + friends_family_integration_boundary + future_planning_tradeoff) / 6)`；`shortlistFourDimV0.rankingFormulaVersion` 为 **`shortlist_four_dim_formula_v6`**（与 v0 五均值公式区分）
- 候选人 **聚合排名**另用四维加权（见 `shortlist-four-dim-v0.ts`），本文不展开。

---

## 5. 解释字段规则（审计 / UI；不参与四维）

### 5.1 通用

| 字段 | 规则 |
|------|------|
| `evidenceSnippet` | `scene=<sceneKey>;cand=<candidateUserId 前 16 字符>;status=succeeded\|failed;score=<四位小数>`；总长 **≤ 88** 否则截断。 |
| `reviewStatus` | `reason`、`riskPoint`、`evidenceSnippet` 均非空（`trim` 后）→ `reviewable`，否则 `unreviewable`。 |
| `status==="failed"` | `score=0`；`reason=scene_input_unavailable`；`riskPoint=insufficient_scene_evidence`；`evidenceSnippet` 仍按模板生成。 |

### 5.2 `reason` / `riskPoint`（成功）

见 **§3 主表** 各场景列；均为 **小写蛇形** 固定枚举串（便于回归与审计）。

---

## 6. 与代码 / 测试锚点

| 类别 | 路径 / 标识 |
|------|-------------|
| 场景 key 常量 | `apps/api/src/modules/ai-simulation-v1/ai-simulation-v1.constants.ts` → `SHORTLIST_SCENE_KEYS_V0`、`SHORTLIST_SCENARIOS_V0_SCHEMA` |
| 场景构建 | `apps/api/src/modules/ai-simulation-v1/shortlist-scenarios-v0.ts` → `tryBuildShortlistScenariosV0`、`scoreForScene`、`toShortReason`、`toRiskPoint`、`toEvidenceSnippet`、`toReviewStatus` |
| 四维消费场景 `score` | `apps/api/src/modules/ai-simulation-v1/shortlist-four-dim-v0.ts` → `tryBuildShortlistFourDimV0` |
| 类型 | `apps/api/src/modules/ai-simulation-v1/ai-simulation-v1.types.ts` → `ShortlistScenarioRowV0`、`ShortlistScenariosV0` |
| 回归（10×N 矩阵等） | `apps/api/test/shortlist-scenarios-v0.spec.ts`（如 **`Phase C v1.0: locks full 10×N matrix (...)`**） |
| 回归（解释篡改 / 四维） | `apps/api/test/shortlist-four-dim-v0.spec.ts`（如 **`Phase C v1.0: explanation-only mutation does not change fourDim or decision (10-scene matrix)`**） |
| 验收索引 | `docs/P6/acceptance/P6-round2-orchestrator-a1-a2-acceptance.md` → **「Phase C v1.0 回归锚点（10 场景…）」** |

---

## 7. 变更纪律（与实现对齐）

1. **增 / 删 / 改 `SHORTLIST_SCENE_KEYS_V0` 的顺序或数量**：必须同步 **`shortlist-scenarios-v0.ts`**（`scoreForScene` / `toShortReason` / `toRiskPoint`）、**`shortlist-four-dim-v0.ts`**（聚合与 null 校验）、**`apps/web/src/pages/FinalMatchPage.jsx`** 中同名常量列表、**`shortlist-scenarios-v0.spec.ts` / `shortlist-four-dim-v0.spec.ts`** 全矩阵与篡改用例，以及 **`docs/P6/acceptance/P6-round2-orchestrator-a1-a2-acceptance.md`** 中 **「Phase C v1.0 回归锚点」** 的用例名索引。
2. **改 `score` 公式**：必须更新 **§3 主表**、**§4 矩阵**、**fixture `toEqual`** 与任何依赖排序的用例。
3. **改解释模板**：须更新 **§3 / §5** 与对应 **单测期望值**；四维与 decision **不得**依赖解释字段，但若误改消费逻辑须用 **解释篡改用例** 捕获。
4. **本文档**：任何上述变更应 **同一 PR / 同一批次** 更新本文件「声明」日期可在 commit message 中体现（本文不强制维护「最后更新」元数据）。

---

*本文路径：`docs/P6/truth/P6-shortlist-scenarios-v0-rules-master.md`*
