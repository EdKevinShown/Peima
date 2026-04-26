# P6 Current Status (v0)

> **截至当前 `main` 的已实现能力快照。** 规则细节见 `truth/`；验收与跑通记录见 `acceptance/`。本文不复制 truth 总表正文，不重写历史方案，不作为路线图。

## 阶段快照（A～F）

| 代号 | 状态（一句） |
|------|----------------|
| **A** | 主链与预览池等既有能力保持；以仓库当前实现为准。 |
| **B** | Post-pool deep-screen、prescreen 等与编排衔接的静态层已落地（见 orchestrator 与 truth）。 |
| **C** | **v1.0**：短名单侧车与 **固定 10 个标准化场景** 冻结版；`shortlistScenariosV0` / `shortlistFourDimV0` / `shortlistDecisionV0` 契约与实现对齐。 |
| **D** | **v6**：四维汇总与公式版本等与 Phase C v1.0 冻结版一致（以代码与 truth 为准）。 |
| **E** | **v1.0**：Final Match **用户可见**「互动参考（短名单对话模拟）」辅助卡；弱结论文案；门闩依赖合规 job + `jobAuditV0` 正向信号。 |
| **F** | **v0.5**：`jobAuditV0` 读时聚合；诊断详情页；分诊列表；legacy / current 分类语义。 |

## 标准化场景

- **已冻结为 10 个场景**（与 Phase C v1.0 一致）。**不**再使用旧版「九场景」等口径描述当前系统。

## 唯一正确路径（新 AI simulation job）

以下写死为 **当前唯一推荐、与实现一致的建 job 方式**：

1. **新 job 唯一路径**：`POST /admin/post-pool-deep-screen/run-orchestration-mvp`，请求体 **`runMode: "mvp"`**。短名单解析与 `shortlistBinding` + 与 binding 对齐的 `hintSnapshot` 均由该编排链生成后再入队。  
2. **旧入口已废弃**：`POST /admin/ai-simulation/v1/enqueue` **不再用于创建 job**（响应 **410 Gone**，正文含废弃说明并指向编排入口）。**不要**再按旧 JSON 体手工建 job。  
3. **Final Match 用户可见 AI 辅助解释卡**：**仅**在 URL 带 **`aiSimJobId`**、job **`completed`**、且 **`jobAuditV0`** 满足 **当前 shortlist 契约 + 三侧车齐全 + 排序一致 + `specClassification === current_shortlist_contract`** 等门闩时展示；否则 **整卡不出现**（不暴露内部诊断字段给用户）。

## Final Match：两层能力

| 层级 | 用途（一句） |
|------|----------------|
| **内部诊断区** | 折叠区块：侧车原始字段、`jobAuditV0`、深链工具等 — **内部 / 排障 / 验收**，非 C 端主叙事。 |
| **用户可见 AI 辅助解释卡** | Phase E v1.0：自然语言「互动参考」，**不替代**匹配指数与系统主结论。 |

## Triage / 诊断详情（边界）

- **分诊列表页 / job 诊断详情页**：**Admin / 内部** 使用；用于批量浏览 job 健康度与下钻字段。  
- **不是**用户主路径；**不**要求普通用户理解 `specClassification` / `buildabilityDetail` 等名词。

## Out of scope（本文与当前实现刻意不宣称）

- 不改 worker 主公式、不改 `MatchResult.finalScore`、不把 AI 模拟写回主链、不新增 API、不做 Final Match 全页重设计。  
- 统一 Agent / 全仓单一编排平台等仍 **未**作为产品化主链交付（演进背景见 `archive/historical/` 等，**不**在本文展开）。

## 延伸阅读（索引）

- **P6 文档书架**：[`README.md`](./README.md)  
- **最短操作步骤**：[`P6-operating-notes-v0.md`](./P6-operating-notes-v0.md)  
- **真源与规则**：[`truth/`](./truth/)  
- **验收与跑通记录**：[`acceptance/`](./acceptance/)
