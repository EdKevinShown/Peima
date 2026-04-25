# P6 Round 1 当前状态总览

> **性质**：P6 Round 1 **阶段收口页**——浓缩当前仓库已交付事实与边界，**不**替代 [`truth/`](../truth/) 主链契约、各切片 **specs** 与 **acceptance** 专文。  
> **日期口径**：与根目录 `README.md`「当前项目状态」及 [`P6.8-P6.10-phase-closure-handoff.md`](./P6.8-P6.10-phase-closure-handoff.md) 对齐；细节以链出文档为准。

---

## 1. 当前已经完成的能力

以下均为 **已合入仓库、可本地联调验证** 的 P6 相关能力（并列存在，互不自动扩展对方范围）：

| 条线 | 已完成（Round 1 口径） |
|------|------------------------|
| **Copilot（P6.1～P6.4）** | 在既有只读 Copilot 接口上接入 **真实 LLM**，失败回退规则层；运行手册、首轮验收（P6.3）、稳定性收口（P6.4）已文档化。 |
| **结果层切片（P6.5～P6.7）** | **Summary AI**、**Match Explanation AI**、**Final Match Primary Conclusion**：独立路由、独立 env 前缀、独立 `sourceType` / `sourceVersion` 与日志；不阻断原只读主链路。 |
| **P6.x / P6.y（Final Match 页）** | **AI Match Review（MVP）** 与 **Interaction Simulation Lite**：基于问卷同源摘要；**不落库**、**不改 worker 主打分**；模型不可用时规则层可填满 UI。见 [`specs/P6-current-stage-capabilities-P6x-P6y.md`](../specs/P6-current-stage-capabilities-P6x-P6y.md)。 |
| **P6.8 / P6.9 / P6.10** | **聊天驱动画像补全建议**：独立 POST → pending suggestion → 既有 mine / accept / dismiss；**P6.9** 对该 POST 做消息条数、pending、冷却等治理；**P6.10** 仅在 **ChatPage** 做事前禁用与事后固定中文提示。 |
| **会话与联调体验** | **`/chat`**、**`/copilot`**、**`/chat/timeline`**：在仅有 **`userId`**、缺 **`conversationId`** 时可 **`createConversation` + `replace`** 补全 URL；三页互跳保持会话参数。 |
| **Final match 主链（当前形态）** | **preview-pool → enqueue → batch-match → 结果页** 在本地可跑通；**洞察与 worker 侧仍为规则 / 占位实现**，与「最终 AI 模拟匹配商业形态」刻意区分。 |
| **匹配前链路与 AI 模拟（契约层）** | **Preview Pool 闸门 / 分层 / 偏好**、**Prescreen v0**、**真正 AI 模拟 v1** 等字段级与顺序约束，以 [`truth/`](../truth/) 下主链与 implementation notes 为真源；首轮实机/侧车验收见 acceptance 中 AI 模拟相关文档。 |

**P6 文档入口（P6 Docs Index）**：本目录 [`README.md`](../README.md) → `truth/` / `specs/` / `acceptance/` / `archive/`。（**非**仓库根目录 `README.md`。）

---

## 2. 当前 internal-only 边界

- **身份与环境**：联调依赖 **JWT**、本地 **`.env`**、**DB 迁移与 schema 对齐**；Admin / test 子进程触发 **batch-match** 等路径以根 `README`「本地联调注意」为准，**不**承诺对外部租户的自助化 runbook。  
- **P6.8 生成白名单**：`proposedPatch` 仅允许专文所列维度；**不**以单次聊天强改主标签为产品目标。  
- **P6.9 作用域**：**仅** P6.8 的 **唯一 POST**；**不**扩到 Copilot、admin 时间线、suggestion center 等统一治理。  
- **P6.10 作用域**：**仅 ChatPage**；**无**新 REST 接口、**不**改后端治理语义。  
- **演进规划 ≠ 已交付**：[`archive/historical/P6-ai-production-evolution-plan.md`](../archive/historical/P6-ai-production-evolution-plan.md) 描述的中远期 Worker / 多 Agent / simulation **全量生产链**，与当前已落地切片 **显式区分**。

---

## 3. 当前最顺的 internal workflow

一条 **「从池到结果再到聊天侧写建议」** 的推荐顺序（内部演示 / 回归最常用）：

1. **准备数据**：问卷与 **`user_profile`**、预览池候选与图片、有效 **JWT**；新库执行 **migrate deploy**（见根 `README`）。  
2. **跑通主链**：`/preview-pool` 确认池 → **`POST /matching/enqueue`** → 用 **admin/test + worker** 可验证方式跑 **一轮 batch-match** → **`GET /matching/result/:userId`** 打开 Final Match（规则 / 占位洞察 + P6.x / P6.y 只读块）。  
3. **聊天侧**：带 **`userId`** 进 **`/chat`**（或 copilot / timeline），必要时等待 **URL 自愈** 补全 **`conversationId`**。  
4. **画像建议**：在 **ChatPage** 触发 **profile-completion-suggestion** → **`GET /profile-suggestions/mine`** → **accept / dismiss**；对照 **P6.10** 事前禁用与 **400 / 409 / 429** 事后文案。

细则与 curl 风格仍见 **P2.5 联调清单** 与各 **acceptance** 回归记录，本页不展开。

---

## 4. 当前仍可接受的限制

- **统一 AI 编排**：仓库**仍无**端到端 multi-agent / simulation **产品化主链**；各切片 **独立配置、独立验收**。  
- **Final match 与 worker**：**非**商业终态 AI 匹配；**matchInsights** 等可仍为占位/规则口径。  
- **P6.8 / P6.10 覆盖面**：**未**在所有页面铺同款入口与完整 UX；内部以 Chat + mine 列表为主战场。  
- **会话自愈前提**：依赖 **`userId`** 与后端 **`createConversation`** 成功条件（如无 **`match_result`** 等仍会失败，属既有契约）。  
- **问卷 G1-R**：全仓 **30 题 canonical** 与 matching 消费 v3 画像等，**仍以 P4 文档与根 README 权威说明为准**；与本 P6 总览无重复展开。

---

## 5. 下一阶段两个最合理候选方向

以下两个方向 **与 Round 1 已交付内容衔接最顺**，且 **不要求**在本总览中选定其一——仅作立项前排序参考：

| 候选 | 理由（与当前状态的关系） |
|------|---------------------------|
| **A. 主链硬化：沿 `truth/` 推进「匹配全链」下一跳** | 主链顺序与 **Preview Pool → Prescreen → AI 模拟 v1** 等已在 truth 中钉死；当前 Final Match 仍为规则/占位，下一跳自然落在 **worker / 队列 / 观测与契约对齐** 或 **AI 模拟侧产品化收口**（仍应逐条对照 truth，避免与 archive 中长期愿景混谈）。 |
| **B. 内部运营与风险边界：观测、配置与「可演示」封装** | Copilot 与多条结果层、P6.8 链路的 **env、日志字段、原因码** 已在 P6.2 / P6.4 等文档收口；下一跳可侧重 **内部 runbook 一体化、回归模板复用、admin/排障路径**（仍保持 **internal-only** 前提，不自动扩展为多租户产品）。 |

**不建议**在未单独立项的情况下，把 **archive 中梯队 A/B/C 全量生产链** 直接当作 Round 2 的默认范围；见演进规划文档中的 **「规划 ≠ 已承诺」** 表述。

---

## 延伸阅读（按需点开，本页不摘要正文）

- 主链与契约：[`../truth/P6-current-matching-chain-single-source-of-truth.md`](../truth/P6-current-matching-chain-single-source-of-truth.md)  
- 能力快照（P6.x / P6.y）：[`../specs/P6-current-stage-capabilities-P6x-P6y.md`](../specs/P6-current-stage-capabilities-P6x-P6y.md)  
- 本阶段工程事实摘要：[`./P6.8-P6.10-phase-closure-handoff.md`](./P6.8-P6.10-phase-closure-handoff.md)  
- 演进背景（非当前承诺范围）：[`../archive/historical/P6-ai-production-evolution-plan.md`](../archive/historical/P6-ai-production-evolution-plan.md)

---

*本文路径：`docs/P6/acceptance/P6-round1-current-status-overview.md`*
