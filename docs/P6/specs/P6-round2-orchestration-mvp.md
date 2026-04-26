# P6 Round 2 编排 MVP 定义页

> **一句话目标**：将现有 `preview pool`、`post-pool deep screen`、`prescreen v0`、`AI 模拟 v1`、`Final Match` 与 `chat 后链` 串成一条**可运行、少手工**的匹配编排链。  
> **文档性质**：本页是 **specs（实施定义）**，用于 Round 2 评审与实现对齐；**不是 truth**，主链顺序冲突时以 `truth/` 为准。  
> **边界限定**：此处「一条链」指 **internal/admin 可跑通编排**；**不**读作对全体 C 端主路径的产品承诺，语义以 **「边界收口：主链、内部编排与 sidecar/hint（文档锁）」** 小节为准。

---

## 边界收口：主链、内部编排与 sidecar/hint（文档锁）

本节为 **2026-04 边界陈述**：锁死「主链 vs 内部编排 vs Final Match 侧车/hint」的产品与技术语义，**不引入新实现承诺**；与 `acceptance/P6-round2-orchestrator-a1-a2-acceptance.md`、`truth/P6-final-match-consumption-hint-v0.md` 互补，冲突时以 **truth** 与 **验收文** 的实现描述为准。

### 主链当前承诺什么

- 主链继续承担 **既有匹配结果与结论**：以既有 worker 产出与 `MatchResult` 为准用户可见的 **主分与主结论**；Round 2 文档与已收口代码 **不** 把「必须先跑通 preview pool 编排」写进主链前置条件。
- 主链 **不** 承诺向全体用户提供 **一键 Round 2 编排**、**自动 enqueue AI 模拟** 或 **跨会话可重建的 hint 服务**；这些能力 **未** 作为 C 端正式产品能力收口。

### internal / admin 编排链是什么性质

- **性质**：研发/运营验证与排障用的 **内部编排面**；典型入口为 **admin API**（如 `POST /admin/post-pool-deep-screen/run-orchestration-mvp`）、**预览池页内 admin 能力**、以及 **匹配等待页上仅 admin 可见区块内的深链**（见 acceptance 文）。**不** 等同于主链对用户的产品承诺。
- **语义**：编排链串起 pool → deep-screen → prescreen →（`mvp` 下）AI 模拟 **enqueue** 等；可选前端串联 `runJob`、consumption hint 经 `sessionStorage` 转交等，均属 **内部路径约定**，可随开关与 admin 门控调整，**不** 升格为「全体用户主路径行为」。

### sidecar / hint 不改变主分与主结论

- Final Match 上的 **侧车**（如 URL `aiSimJobId` + job 查询）与 **consumption hint v0**（含 `sessionStorage` 转交）仅用于 **只读展示与编排上下文摘要**，**不参与** worker 主公式重算，**不** 写入或覆盖 **`MatchResult.finalScore`**，**不** 替代主链对用户的 **主结论** 口径。

### 当前明确未做的事

- **普通用户主路径上的编排入口**：**不做**；**不** 新增面向非 admin 的、承载「正式编排产品」语义的 **用户可见主路径**。
- **服务端同步整链 run**：orchestrator 侧 **不** 内嵌「enqueue 后必同步跑完」；run 仍按 acceptance 所述为 **admin run API / 前端可选串联** 等内部手段。
- **hint 落库与 hint 只读 API**：consumption hint **不落库**、**无** 新只读 API（本边界陈述 **不** 新增 API 规格）。
- **worker 主公式与 `MatchResult.finalScore`**：**不改**；本边界收口 **仅文档**，不涉及 worker 与计分字段变更。

---

## 1) Round 2 最合理的链路顺序

按当前仓库状态，Round 2 编排 MVP 的推荐顺序为：

本顺序为 **编排层技术栈的推荐拼装顺序**；**不**表示 C 端用户主链必经。**主链是否必须先跑通编排**以 **「边界收口：主链、内部编排与 sidecar/hint（文档锁）」** 为准。

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

## 3) 哪些继续 internal-only，哪些在 Final Match 只读消费

### 继续 internal-only

- deep-screen 的原始 debug 对账信息
- AI 模拟原始 transcript / failure 诊断细节
- 编排阈值细节与策略参数（用于内部调参）
- admin / shadow 调试入口的操作细节

### 在 Final Match 页只读消费的信号（Round 2）

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

## 6) main 收口后的链路状态与仍存在的缺口

> **说明（与 main 对齐）**：本节取代原「三条断裂」表述。**admin / 内部**与 **主链 / C 端**分开写，避免误判。验收与实现细节以 [`acceptance/P6-round2-orchestrator-a1-a2-acceptance.md`](../acceptance/P6-round2-orchestrator-a1-a2-acceptance.md) 与 [`truth/P6-final-match-consumption-hint-v0.md`](../truth/P6-final-match-consumption-hint-v0.md) 为准。

### admin / 内部路径（已打通）

- **admin 侧单一编排 HTTP 入口**：`POST /admin/post-pool-deep-screen/run-orchestration-mvp`（`runMode=mvp`）串起 pool → deep-screen → prescreen → **AI 模拟 v1 enqueue**，返回 `deeplink`、`finalMatchConsumptionHint`、`simulationJobId` 等 envelope（**非** C 端唯一产品入口、**非** worker）。
- **Final Match 消费**：URL `aiSimJobId` + job 查询侧车；`finalMatchConsumptionHint` 按 truth v0 经 **预览池 admin 内部**写 `sessionStorage` 后由 Final Match 读取（失败静默降级）。
- **减少手点 run（可选）**：同一预览池内部链上，可按 Vite 开关在跳转前 **`POST /admin/ai-simulation/v1/jobs/:jobId/run`**（超时/失败仍跳转）；**orchestrator 服务端语义仍为 enqueue-only**，未内嵌同步 run。

### 仍存在的缺口（勿误判为已做）

1. **触发缺口**：**无**普通用户主路径上的编排入口；编排仍依赖 **admin + 预览池页内部**等内部操作。
2. **服务端自动化 run 缺口**：**无** orchestrator/worker 级「enqueue 后必跑」；run 依赖 **admin run API** + 前端可选串联，与主链无硬绑定。
3. **hint 持久化缺口**：consumption hint **不落库**、无只读 API；跨会话仅靠当前机制不可重建。

---

## 7) 实现优先级（与边界收口对齐）

- **文档策略**：普通用户主路径 **编排入口** 与 **新的用户可见主路径** 承载编排产品语义，**不在**当前周期作为 specs 内下一实现目标；边界以本文 **「边界收口：主链、内部编排与 sidecar/hint（文档锁）」** 为准。
- **admin 深链**：匹配等待页 → 预览池的 **admin-only** 深链以 **acceptance** 文为验收真源；**不** 在本文重复规定为「向 C 端扩展」的前置步骤。
- **后续代码单点**：下一实现优先级 **不在**本文锁定；若需 worker 异步消费 queued job、hint 落库等，须 **另开文档/项** 并继续满足本节与 **§8** 的非目标约束。

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
