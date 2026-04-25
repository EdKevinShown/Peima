# P6 Round 2 Orchestrator A1/A2 验收收口

> **性质**：仅记录 Round 2 orchestrator 在 **A1 / A2** 阶段的实现落点与实机验收结果；不替代 `truth/` 与 `specs/` 文档。

---

## A1 实现到达层级

- 已从入口壳子升级为真实链路：**pool 读取 → deep-screen → prescreen v0**。
- `run-orchestration-mvp` 返回真实 envelope（含阶段状态与 `simulationQueueHint`）。
- A1 中 `aiSimulation` 明确为 `skipped`。

## A2 实现到达层级

- 在 A1 基础上，`runMode = "mvp"` 时可真实调用 **AI simulation enqueue**。
- orchestrator 返回 AI simulation 产物：
  - `simulationJobId`
  - `acceptedCandidateCount`
  - `simulationQueueActual`
- 同时返回：
  - `deeplink`
  - `finalMatchConsumptionHint`（最小真实摘要）

## 实机验收通过点

- `previewPool / deepScreen / prescreen` 在 orchestrator 路径下真实跑通。
- `simulationQueueHint` 为真实值。
- `runMode = "mvp"` 下可真实 enqueue AI simulation。
- 返回体包含 `simulationJobId`、`acceptedCandidateCount`、`simulationQueueActual`。
- 返回体包含 `deeplink` 与 `finalMatchConsumptionHint`。
- 现有 AI simulation job 查询接口可查到真实 job 产物。

## Final Match 最小消费层接入（very small）

- Final Match 页面已完成最小 sidecar 消费接入，形成与 orchestrator A2 deeplink 对齐的当前闭环。
- 当前消费来源：
  - URL query 中的 `aiSimJobId`
  - `getAdminAiSimulationV1Job(aiSimJobId)` 查询结果
- 页面新增低权重内部状态块：`AI 模拟侧车状态（内部）`。
- 最小展示字段：
  - `aiSimJobId`
  - `jobStatus`
  - `candidateInJob`
  - `sidecarReady`
- `sidecarReady` 判定条件：
  - `hasJobId`
  - `hasReadableJob`
  - `candidateInJob`
- 明确边界：仅 sidecar / hint 消费，不参与 `finalScore`，不替代主结论。

## 当前明确未做

- 不改 worker 主公式。
- 不写 `MatchResult.finalScore`。
- 不做前端大规模改版（仅最小内部状态块接入）。
- 不在本收口内扩展 B 线细项。

---

*本文路径：`docs/P6/acceptance/P6-round2-orchestrator-a1-a2-acceptance.md`*
