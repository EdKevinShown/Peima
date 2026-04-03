# 配吗（peima）P1 阶段完成状态总结

## 1. P1 阶段结论

P1 阶段已交付：**在保持 P0 主链路稳定、不破坏既有 API 与数据契约的前提下**，完成「结构化占位版」能力建设——匹配结果可携带结构化洞察、最终匹配页可展示洞察卡片、聊天提供独立只读摘要占位接口、预览池条目可带轻量元数据、worker 批处理在行为等价前提下做工程优化，并将多处置顶文案统一收口到共享常量。

**重要界定**：上述洞察、摘要与元数据正文均由 **规则 / 模板 / 占位逻辑** 生成；**真实大模型推理、AI Agent 或多 Agent 编排尚未在本项目中正式接入**。P1 的价值在于 **数据结构、接口形态、前端落点与工程可维护性** 已为后续替换真实能力做好准备。

---

## 2. 当前项目总体状态

| 层级 | 状态 |
|------|------|
| **P0** | 注册登录、问卷与画像、六人预览池、匹配入队、worker 批次匹配、最终匹配结果查询、单会话聊天等主链路 **保持稳定** |
| **P1** | 在 P0 之上增加 **JSON 字段扩展**、**只读摘要路由**、**前端条件展示**、**worker 查询与日志优化**、**共享占位文案常量**；不改变匹配打分公式与核心写库语义 |

**技术栈**（monorepo）：`apps/web`（React + Vite）、`apps/api`（NestJS）、`apps/worker`（Node.js + TypeScript + cron）、`packages/database`（Prisma + PostgreSQL）、`packages/shared`（类型与 **运行时常量**，含 P1-6 编译后的 constants 产物）。

---

## 3. P1 各竖切完成情况

| 竖切 | 交付摘要 | 主要落点 |
|------|----------|----------|
| **P1-1** | `MatchResult.matchInsights`（JSON，可选）落库；worker 在 batch 成功写入时填充 **占位结构**；`GET /matching/result/:userId` **向下兼容** 返回该字段 | `packages/database`、`apps/worker`（batch-match + match-insights-placeholder）、`apps/api` matching |
| **P1-2** | `FinalMatchPage` 在校验通过时展示洞察卡片；**无或非法 `matchInsights` 时隐藏洞察区**，其余与 P0 一致 | `apps/web` |
| **P1-3** | `GET /chat/conversations/:conversationId/summary` **只读、不落库**；`ChatPage` 进入页拉取；**失败则隐藏摘要区**；**不改** `POST /chat/messages` 与会话详情响应 | `apps/api` chat、`apps/web` |
| **P1-4** | `PreviewPoolItem.itemMeta`（JSON，可选）落库；generate 时写入 **占位**；`PreviewPoolPage` 轻展示；**无效则隐藏** | `packages/database`、`apps/api` preview-pool、`apps/web` |
| **P1-5** | batch-match：**候选侧批量加载** user / profile / image；**结构化日志**；**不改** 评分与结果契约 | `apps/worker` |
| **P1-6** | 预览池 / 匹配洞察 / 聊天摘要相关 **占位语气与免责声明** 收敛至 `@peima/shared/constants`；**不改字段名与主链路** | `packages/shared`、`apps/worker`、`apps/api`（preview-pool、chat） |

---

## 4. P1 完成后的系统形态

**已形成闭环（在「规则 / 占位」含义下；不含真实 AI 推理）**

- 匹配结果可携带 **固定结构的 `matchInsights`**，并在最终匹配页按需展示。
- 会话可提供 **独立只读 summary**，聊天页可展示 **占位** 摘要与阶段提示。
- 预览池条目可带 **`itemMeta`**，列表页可展示槽位说明类 **占位** 文案。
- Worker 批处理在等价语义下 **减少批内重复查询**，日志字段更易排查。

**仍为占位 / 规则版（非 AI 完成态）**

- `matchInsights`、`itemMeta`、chat summary 的正文均为 **代码内规则或模板生成**，**不是**真实 AI 生成的解释或仿真结论。
- 聊天 summary **每次 GET 现算**，未作为 P1 的持久化 AI 产物落地。

---

## 5. 当前边界与未改动部分

- **未正式接入**：真实 AI Agent、多 Agent 编排、完整 simulation pipeline（若与未来产品定义一致，均在 P1 范围外）。
- **未改动或明确约束**：P0 主业务流程顺序与核心业务语义；`computeFinalScoreV1` 权重与公式；`POST /chat/messages` 语义；matching / preview-pool / questionnaire / auth 主路径契约；不引入 Redis、新队列、重架构。
- **数据库**：除 P1-1 / P1-4 已交付列外，P1 未再引入新的 schema 变更（P1-5 无 migration）。

---

## 6. 下一阶段建议

- 若产品需要 **真实解释 / 摘要 / 仿真**：在 **保持现有 JSON 字段与路由** 的前提下，将占位生成逐步替换为模型调用或策略服务，并增加 **来源 / 版本** 字段以便审计与灰度。
- 若需要 **摘要可复现、可审计**：可单独立项为会话或批次维度 **持久化**（与 P1-3「不落库」设计解耦）。
- **监控告警** 可基于 P1-5 结构化日志对接统一日志平台，与业务功能竖切分开排期。

---

*本文档反映截至 **P1-6 完成** 的共识状态；具体路径与字段以仓库内实现为准。*
