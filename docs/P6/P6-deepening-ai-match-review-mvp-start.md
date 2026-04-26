# P6 深化阶段起点：AI Match Review MVP（Start）

> **文档定位**：在 P6 基础闭环已完成后，定义 AI Match Review MVP 的深化起点与边界。  
> **适用范围**：仅限 Final Match 只读增强层；不改 worker 主公式，不改 `MatchResult.finalScore`。

---

## 1) 当前 main 已完成事实（起点前提）

- Round 2 orchestrator（A1/A2）已在 main 收口。
- Final Match sidecar / hint 最小消费链路已收口。
- PreviewPool internal orchestration chain 与 optional `runJob` 已收口。
- MatchingWaitingPage admin deep link 已收口。
- Round 2 对应 truth / acceptance / specs 已完成对齐。
- 最小 e2e 回归锚点已存在并可执行：`pnpm --filter @peima/api run test:e2e:orch-anchor`。

以上能力构成“P6 基础闭环收官”的已完成前提；本文件不再回到 Round 2 断裂问题复盘。

---

## 2) 问卷 20 维作为 AI Match Review 输入基础

- 问卷答案已在后端稳定映射为 20 维 G1-R 结果，并落在 `user_profile`。
- 当前主链与相关读数能力已可稳定读取 viewer / candidate 的画像维度数据。
- AI Match Review MVP 的输入基础应继续复用该结构化 20 维画像与现有匹配结果上下文，不新造并行画像真源。

结论：20 维画像是本阶段可直接复用的“稳定输入底座”。

---

## 3) 主真源与不可变约束

- `MatchResult` 仍是匹配主真源。
- `MatchResult.finalScore` 在本阶段为不可改字段。
- AI Match Review 产出不得回写或覆盖 worker 主链结论。

结论：本阶段所有新增能力都必须是“读主链、做解释”，不是“改主链、改分数”。

---

## 4) AI Match Review 的产品形态边界

- AI Match Review 只能作为 Final Match 页的只读增强层。
- 展示层可补充解释、风险提示、阅读辅助与结构化结论摘要。
- 不替代 Final Match 主结论，不重定义匹配结果口径。

---

## 5) 本阶段明确不做

- 不做 L1/L2/L3 多轮模拟。
- 不把 admin/internal orchestrator 产品化为普通用户主路径。
- 不新增 hint 专用 API。
- 不改 worker 主公式。
- 不改 `MatchResult.finalScore`。

---

## 6) 推荐接入文件（最小落点）

### API 侧

- `apps/api/src/modules/match-review-ai/match-review-ai.service.ts`
- `apps/api/src/modules/match-readout-fusion/match-readout-fusion.service.ts`

### Web 侧

- `apps/web/src/pages/FinalMatchPage.jsx`
- `apps/web/src/components/review/AiSimulationSidecarV0.jsx`（仅作为可选只读上下文位）

说明：以上落点均位于“后置只读增强层”，可与当前边界保持一致。

---

## 7) 风险与降级边界

### 主要风险

- sidecar / hint 读取存在可用性差异（内部链路可用性高于普通路径）。
- hint 当前为会话级临时转交，不是持久真源。
- AI 模拟可能出现 enqueue 与 run 时序差，导致侧车状态不稳定。
- 历史数据缺画像或画像不完整时，解释层稳定性会下降。

### 降级边界

- 任一增强层失败时，必须回退到 `MatchResult` 主结果展示。
- 不因 AI Match Review 失败阻断 Final Match 主链可读性。
- 不引入“失败即改分/隐藏主结果”的行为。

---

## 8) 最小验收标准（MVP 起点）

1. Final Match 主链结果在任何情况下可稳定展示（主结论不受增强层影响）。  
2. AI Match Review 作为只读块可独立加载与失败降级。  
3. 不产生对 worker 主公式或 `MatchResult.finalScore` 的任何写入路径。  
4. 不新增普通用户复杂主路径依赖；admin/internal 编排链维持现有边界。  
5. 现有最小回归锚点与 smoke 命令可继续通过。  

---

*本文路径：`docs/P6/P6-deepening-ai-match-review-mvp-start.md`*
