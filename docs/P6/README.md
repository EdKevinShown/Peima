# P6 Docs Index

本索引下：**`truth/`** = 当前真源与主链必须服从的实现说明；**`acceptance/`** = 验收、收口、回归与 freeze 记录；**`specs/`** = 规格、切片、能力地图与 runbook；**`archive/`** = 历史规划与草稿（`historical/`、`drafts/`）。

**Round 1 阶段收口页**（浓缩已交付能力与边界）：[P6 Round 1 当前状态总览](./acceptance/P6-round1-current-status-overview.md)。

推荐阅读顺序：① [主链真源](./truth/P6-current-matching-chain-single-source-of-truth.md) → ② [Round 1 总览](./acceptance/P6-round1-current-status-overview.md) → ③ 按需浏览 [`specs/`](./specs/)、[`acceptance/`](./acceptance/) 等。

## Current status & operations（当前状态与操作）

- **[P6 Current Status (v0)](./P6-current-status-v0.md)** — 截至 `main` 的 A～F 快照、**唯一正确建 job 路径**、废弃 enqueue、Final Match 双层与 triage 边界（不写路线图）。
- **[P6 Operating Notes (v0)](./P6-operating-notes-v0.md)** — **最短成功链**：orchestration MVP → `simulationJobId` → run job → GET job 门闩 → Final Match 深链 → 侧车与用户可见辅助卡。

## Truth（真源）

- [主链顺序与阶段边界](./truth/P6-current-matching-chain-single-source-of-truth.md)
- [AI 模拟 v1 契约](./truth/P6-ai-simulation-v1-implementation-notes.md)
- [Shortlist 固定 10 场景模拟规则总表（`shortlistScenariosV0`）](./truth/P6-shortlist-scenarios-v0-rules-master.md)
- [Prescreen v0 实现说明](./truth/P6-backend-intelligent-prescreen-v0-implementation-notes.md)
- [读数融合 v0 实现说明](./truth/P6.z-readout-fusion-v0-implementation-notes.md)
- [Preview Pool 闸门与分层 v0](./truth/P6-preview-pool-gating-and-layered-v0.md)
- [Preview Pool 分层选入 v0](./truth/P6-preview-pool-layered-selection-v0.md)
- [Preview Pool 偏好闸门 v0](./truth/P6-preview-pool-preference-gating-v0.md)

## Current capability map

- [当前阶段能力（P6.x / P6.y 等）](./specs/P6-current-stage-capabilities-P6x-P6y.md)

## Acceptance（验收与收口）

代表性入口：

- **[P6 Round 1 当前状态总览](./acceptance/P6-round1-current-status-overview.md)**（**阶段收口页**）
- [P6 Round 2 B1：视觉增强 stub/LLM 验收收口](./acceptance/P6-round2-b1-visual-enhance-acceptance.md)
- [P6 Round 2 Orchestrator A1/A2 验收收口](./acceptance/P6-round2-orchestrator-a1-a2-acceptance.md)
- Round 2 orchestrator 最小回归锚点（合并前手工 smoke）：`pnpm --filter @peima/api run test:e2e:orch-anchor`
- [P6.8–P6.10 阶段收口与 handoff](./acceptance/P6.8-P6.10-phase-closure-handoff.md)
- [AI 模拟 v1 首轮验收结论](./acceptance/P6-ai-simulation-v1-round1-acceptance-conclusion.md)
- [P6.3 Copilot 首轮验收](./acceptance/P6.3-acceptance-round1.md)
- [P6.z 读数融合 v0 验收清单](./acceptance/P6.z-readout-fusion-v0-acceptance-checklist.md)
- [P6.8–P6.10 回归跑批记录（示例日期）](./acceptance/P6.8-P6.10-regression-run-record-2026-04-21.md)

其余见 [`acceptance/`](./acceptance/) 目录。

## Specs（规格与切片）

代表性入口：

- [P6-MVP Copilot](./specs/P6-MVP-copilot.md)
- [P6.2 Copilot LLM runbook](./specs/P6.2-copilot-llm-runbook.md)
- [P6.x Match Review AI MVP](./specs/P6.x-match-review-ai-mvp.md)
- [Preview Pool 视觉信号增强 v0](./specs/P6-preview-pool-visual-signal-enhancement-v0.md)
- [P6 Round 2 编排 MVP 定义页](./specs/P6-round2-orchestration-mvp.md)
- [P6.8–P6.10 suggestion review 最小实现范围](./specs/P6.8-P6.10-suggestion-review-minimal-implementation-scope.md)

其余见 [`specs/`](./specs/) 目录。

## Archive（历史与草稿）

长文规划与早期草稿保留在 [`archive/historical/`](./archive/historical/) 与 [`archive/drafts/`](./archive/drafts/)，不作为当前默认真源。

## Reorganization

执行记录与检查项：[P6-docs-reorganization-round1-execution-checklist.md](./P6-docs-reorganization-round1-execution-checklist.md)
