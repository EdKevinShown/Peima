# P6 Round 2 编排 MVP 定义页

> **一句话目标**：将现有 `preview pool`、`post-pool deep screen`、`prescreen v0`、`AI 模拟 v1`、`Final Match` 与 `chat 后链` 串成一条**可运行、少手工**的匹配编排链。  
> **文档性质**：本页是 **specs（实施定义）**，用于 Round 2 评审与实现对齐；**不是 truth**，主链顺序冲突时以 `truth/` 为准。

---

## 1) Round 2 最合理的链路顺序

按当前仓库状态，Round 2 编排 MVP 的推荐顺序为：

1. **Preview Pool**（生成可消费的小池）
2. **Post-pool Deep Screen**（产出 `simulationQueueHint`）
3. **Prescreen v0**（低成本规则分桶与排序辅助）
4. **AI 模拟 v1**（预算内高成本模拟）
5. **Final Match 消费层**（读取 sidecar/hint，不改主分）
6. **Chat 后链**（P6.8/P6.9/P6.10，维持独立闭环）

---

## 2) 每一层输入 / 输出 / 触发条件

| 层 | 输入 | 输出 | 触发条件 |
|---|---|---|---|
| Preview Pool | viewer、候选集合、偏好/分层规则 | 6 槽 pool（可供后续链路消费） | 用户进入匹配链或后端触发 pool 刷新 |
| Post-pool Deep Screen | pool 后候选、viewer/candidate 画像信号 | `simulationQueueHint`（有序候选 hint） | pool 产出后进入深筛编排 |
| Prescreen v0 | 静态摘要 + P6.y 规则层压缩信号（无新增 LLM） | `bucket`、`prescreenScore`、`reasonCodes` | 编排阶段调用，用于模拟前收缩/排序建议 |
| AI 模拟 v1 | 冻结 `hintSnapshot`、viewer、poolId、runSpecVersion | job + `transcript_lite` / `evaluator` / status | 满足闸门且预算允许时 enqueue/run |
| Final Match 消费层 | 既有 MatchResult + sidecar/hint | 可解释增强展示（不改 finalScore） | 查询 Final Match 结果 |
| Chat 后链 | conversation、mine suggestions、治理状态 | 画像建议闭环（生成→mine→accept/dismiss） | 用户在 chat 主动触发 |

---

## 3) 哪些继续 internal-only，哪些进入主链消费

### 继续 internal-only

- deep-screen 的原始 debug 对账信息
- AI 模拟原始 transcript / failure 诊断细节
- 编排阈值细节与策略参数（用于内部调参）
- admin / shadow 调试入口的操作细节

### 进入主链消费（Round 2）

- Prescreen 的压缩结果（`bucket` 等）
- AI 模拟的压缩结果（风险标签、继续建议、置信等级等 sidecar/hint）
- 上述结果以 **read-only hint** 方式进入 Final Match 消费，不进入 worker 主公式

---

## 4) Final Match 页在链中的角色

Final Match 页在 Round 2 中应定位为：

- **编排结果的消费汇聚层（read-only）**
- 主体仍展示既有 `MatchResult` 与主链结果
- 增量展示 prescreen / AI 模拟 sidecar 信号，提升解释与审阅效率
- 不承担主公式重算，不作为自动改分入口

---

## 5) AI 模拟结果在 Round 2 的最合理消费方式

Round 2 推荐口径：

1. **只做 sidecar**
2. **作为内部排序参考**
3. **进入主链 hint（压缩后消费）**
4. **不直接改 `finalScore`**

即：AI 模拟作为高成本证据层，服务解释与内部决策辅助；不覆盖主匹配分。

---

## 6) 当前整条链最断裂的 3 个点

1. **编排断裂**：`simulationQueueHint` 到 AI 模拟 enqueue/run 仍偏 shadow，未成为默认可运行链路。
2. **消费断裂**：prescreen / AI 模拟结果尚未形成统一的 Final Match 消费协议（字段与优先级未完全收敛）。
3. **触发断裂**：从 pool → deep-screen → prescreen → simulation 缺少单次可执行的统一编排入口。

---

## 7) Round 2 若只做一个最关键编排改造，最该做什么

**做“单一编排入口 + 冻结快照驱动”的链路打通。**

核心要求：

- pool 后由一个 orchestrator 统一触发
- 产出并冻结 hint snapshot
- 在预算与闸门下推进 prescreen + AI simulation
- 输出压缩 sidecar 结果供 Final Match 消费

这一步优先解决“能跑但不成链”的问题。

---

## 8) 本轮明确不做什么

- 不直接把 AI 模拟写进 worker 主公式
- 不直接写 `MatchResult.finalScore`
- 不做 C 端全量产品化铺开
- 不把 prescreen 回流为 preview pool 前置重排主链
- 不引入新的多 Agent / 复杂 simulation 产品化范围

---

## 9) 最小手工验收建议

1. **单次触发可跑通**：可从 pool 后触发一轮编排，得到 prescreen + simulation（或明确 skip）。
2. **预算生效**：AI 模拟候选按预算截断，`acceptedCandidateCount` 与实际结果一致。
3. **部分失败可收敛**：个别候选失败不阻断整 job，其他候选照常完成。
4. **Final Match 可消费**：页面可见 sidecar/hint，且 `finalScore` 不变。
5. **chat 后链不冲突**：P6.8/P6.9/P6.10 现有闭环可正常运行。

---

*本文路径：`docs/P6/specs/P6-round2-orchestration-mvp.md`*
