# M3 RRM-Sim Real Chain Closure

> **文档性质**：M3 阶段 — **RRM-Sim 真实链路**阶段性收口记录（closure）。  
> **范围**：记录已验证能力、真实 job 快照、排障脉络、异步化结论、分数分布判断与 **不进入 M4** 的理由。  
> **非目标**：不写 M4 排序融合方案、不改代码、不重跑 LLM。

---

## 1. 一句话结论

M3 已完成 **RRM-Sim 从真实 AI simulation v2（七场景、rrm-ready）到多候选只读诊断** 的最小真实链路验证：**RRM-Sim 仍是只读解释 / 诊断层**，**不参与** `finalScore`、**不参与** worker 主排序、**不参与** `MatchResult.finalScore`。

---

## 2. 本阶段目标

M3 的目标 **不是** M4 式排序融合，而是验证：

- **七场景 v2** payload 能否由 **真实 LLM** 稳定生成并落库；
- **`sourceVersion = ai-match-simulation-rrm-ready-v2`** 是否作为稳定契约被校验与消费；
- **RRM-Sim evaluator** 能否从 **真实** `transcriptLite`（v2）读出信号并产出 `rrmSimResult`；
- **多候选** `rrmSimMultiCandidateDiagnostic` 是否在 **只读** 前提下可计算与展示；
- **前端** 能否以 **pending / ready / unavailable** 区分用户可见状态；
- **用户** 是否 **不再** 因 Admin `POST /run` 同步阻塞而 **同步等待约 5 分钟**（M3.2 异步化 + GET 轮询）。

---

## 3. 已完成能力

- **AI Simulation v2（RRM-ready）**：七场景 `scenarioResults` + 每场景 `simulationTranscript` 等 v2 契约；与旧版短对话模拟区分。
- **`sourceVersion = ai-match-simulation-rrm-ready-v2`**：与 prompt / 校验层对齐，不满足则失败可观测、不伪造成功。
- **旧 10 场景 `shortlistScenariosV0`**：**不再**作为产品路径上的「真实模拟证据」展示；主链侧车以 item `transcriptLite` v2 为准（与 P6 冻结口径一致）。
- **Deterministic RRM-Sim evaluator**：同输入可复现；与「真实 LLM 输出」解耦验证（单测 / calibration 表）。
- **RRM-Sim calibration / regression**：护栏与诊断字段（含 multi-candidate diagnostic）可回归。
- **关系节奏预测卡片**：Final Match 侧在 **ready** 且 `fallbackUsed === false` 时展示；文案明确为辅助理解。
- **多候选只读 diagnostic**：`rrmSimMultiCandidateDiagnostic`（Admin GET job 富化）；**不**驱动 worker 排序。
- **Admin job diagnostic**：job / item 状态、审计侧车、分诊与诊断页；**不**写 `MatchResult`。
- **`POST .../jobs/:jobId/run` 异步（M3.2）**：**fire-and-forget**；HTTP 快速返回 `running` + `started`；后台 `executeRunJobBody` 继续跑 item。
- **`FinalMatchPage` 静默轮询**：`jobStatus` 为 `queued` / `running` 时定时 `GET` job，**不**长时间全页阻塞。
- **`MatchingWaitingPage`**：不在本页等待完整 AI simulation sidecar；编排后 **带 `aiSimJobId` 进入 Final Match**，后台继续生成。
- **pending / ready / unavailable**：侧车与相关文案对齐（生成中 / 完整预测 / fallback 不可用等），与主结果 **解耦**。

---

## 4. 真实 job 验证记录

**真实 job（本地测试库）**

| 字段 | 值 |
|------|-----|
| **jobId** | `cmodwumhj000a6z3ke20zbrdr` |
| **viewerUserId** | `cmo7ksq8s00006znosryc9k0n` |

**当前状态（收口时快照）**

| 指标 | 值 |
|------|-----|
| **jobStatus** | `completed` |
| **succeeded** | 4 |
| **failed** | 2 |
| **rrmReadyV2ItemCount** | 4 |
| **fallbackCount** | 2 |
| **scoreRange** | min **21**，max **26**，spread **5** |
| **scoreDistributionFlag** | `too_narrow` |
| **topCandidateChangedIfRrmOnly** | `false` |

**说明**：该 job **已满足** M3.1-real 所约定的 **「真实链路上 ≥3 条 rrm-ready v2」** 最低门槛；但因 **`scoreDistributionFlag = too_narrow`**、仍存在 **2** 条 fallback 失败项、且 **`topCandidateChangedIfRrmOnly = false`**，**本阶段不将其作为进入 M4 排序融合的依据**。

---

## 5. 真实链路排障过程（按时间顺序）

以下为该真实链路上出现过的 **典型阻塞 → 处理方向**（与对话/实现记录一致；**不重跑 LLM** 于本文档内）：

1. **`database_unreachable`**  
   - Docker / Postgres 未启动或连接失败。  
   - **处理**：启动 Postgres 后执行 `migrate deploy`，确认 `DATABASE_URL` 可达。

2. **`no_rrm_ready_v2_jobs`**  
   - 历史 job 非当前 v2 / rrm-ready 契约。  
   - **处理**：使用 **当前代码路径** 新建 orchestration job，生成 v2 item。

3. **`ai_simulation_config_missing`**  
   - `AI_SIMULATION_V1_ENABLED=0` 或缺少 key / baseUrl / model。  
   - **处理**：按 `.env.example` 与 runbook 打开开关并配置 OpenAI-compatible 厂商参数。

4. **`http_error`**  
   - Chat Completions **URL 拼接错误**（例如在已含 `/v1` 的 base 上再拼 `/v1/chat/completions` 等）。  
   - **处理**：统一为 **根 baseUrl + `/chat/completions`**（与 DeepSeek / OpenAI 兼容约定对齐）。

5. **`invalid_json`**  
   - LLM 返回体无法直接 `JSON.parse`（markdown 围栏、前后缀文本等）。  
   - **处理**：JSON **抽取**、**failureDetail** 可观测摘要、`max_tokens` 默认 **8000**、prompt 侧 **仅输出 JSON** 等约束。

6. **`simulationTranscript` `expected_object`**  
   - 模型将 transcript 写成 `"viewer: ..."` 字符串或 tuple 等非对象轮次。  
   - **处理**：prompt **强类型**约束 + **严格归一化**（normalize）后再校验。

7. **`simulationTranscript` `expected_length_8_to_16`**  
   - 单场景消息条数不足或过多。  
   - **处理**：prompt 要求每场景 **exactly 8** 条消息、**viewer / candidate 交替**；`failureDetail` 增强 **`actualLength` / `expectedMin` / `expectedMax` / `scenario`** 便于排障。

8. **Production latency（用户同步等待）**  
   - 原 **`POST /run` 同步 await** 整 job LLM，HTTP 长达数分钟。  
   - **处理（M3.2）**：**进程内异步** — `queued → running` 抢占后立即返回；**`executeRunJobBody`** 后台继续；前端 **GET 轮询**。

---

## 6. M3.2 异步化结论

- **`POST /admin/ai-simulation/v1/jobs/:jobId/run`**：**快速返回**（典型 tens of ms 级；不等待 LLM 全量完成）。  
- **重复调用**：`already_running` / `already_completed` 行为符合设计（不重复启动、已完成不重跑）。  
- **`GET /admin/ai-simulation/v1/jobs/:jobId`**：可 **轮询** `jobStatus` 与各 item `status`。  
- **用户侧**：**不再**因单次 `/run` HTTP **同步阻塞约 5 分钟**。  
- **当前实现定位**：Nest **单进程**内 **fire-and-forget MVP**（非独立 worker 队列）。  
- **后续**：若 **多实例**、**进程重启任务恢复**、**stuck `running` 恢复**、**重试策略** 等生产要求上升，建议单独立项 **M3.3 durable queue**（Bull / Redis / SQS 等），**不**在本 closure 内承诺。

---

## 7. Score distribution review（与 M3.1-real-score-distribution-review 对齐）

- **4** 条成功 rrm-ready v2 item 的 **`simulatedRhythmScore`** 分布在 **21–26**；**spread = 5**。  
- **`scoreDistributionFlag = too_narrow`**：实现上在 **`rrmAvailableCount >= 3` 且 `spread < 8`** 时标注（诊断规则驱动，**不**单独等价于「模型一定坏了」）。  
- **主因判断（本阶段）**：**不**支持「明显 evaluator 实现 bug」作为第一结论；更符合 **同一 viewer 短名单** 下 **静态输入同质化** — 例如 **`D_pre` 全部为 1**、**`F_sim` 接近 0.85**、**`R_pre` 全部为 0**；**S / Q** 等场景聚合 **有梯度** 但 **不足以** 拉开最终 rhythm 分数带。  
- **结论**：**暂不**因该单 job 进入 **M1.3 evaluator calibration**；若后续 **多个** 真实 job 反复出现 **`D_pre` 饱和 + 低分压缩** 模式，再评估 M1.3。

---

## 8. 为什么暂不进入 M4

**暂不进入 M4 排序融合**，原因如下：

- **真实 job 样本仍少**（当前 closure 以 **单一** 深度验证 job 为主）；  
- **`fallbackCount` 仍为 2** — 短名单内仍存在 **非 rrm-ready** 失败项，诊断与「全成功短名单」仍有差距；  
- **`scoreDistributionFlag = too_narrow`** — 在现有规则下 **不**构成「RRM 已给出强区分排序信号」；  
- **`topCandidateChangedIfRrmOnly = false`** — **未**观察到「若仅按 RRM 重排则顶端候选人改变」的稳定信号；  
- **产品边界**：RRM-Sim **应继续保持** **只读解释 / 诊断层**，本阶段 **不**与 worker 主排序或 `finalScore` 融合。

---

## 9. 后续建议

| 代号 | 建议 |
|------|------|
| **A** | **M3.1-real-plus（可选）**：再 **单条** reset + async run，例如从 **5 succeeded / 1 failed** 演进，**降低** `fallbackCount`；**不**一次性重跑全部 failed。 |
| **B** | **M3.3 durable queue**：生产 **多实例**、任务 **持久化 / 恢复**、**重试**、**stuck `running` 回收** 等。 |
| **C** | **M1.3 evaluator calibration**：仅当 **更多真实 job** 显示 **`D_pre` 饱和** 与 **普遍压分** 时再开。 |
| **D** | **M0.9 / M3.1 simulation prompt calibration**：仅当 **transcript / 场景信号** 明显 **同质化**、且与静态输入解耦后仍成立时再开。 |
| **E** | **M4-readonly-rerank-proposal**：仅当 **多个真实 job** 显示 RRM **稳定区分度**、且产品与合规明确要求 **只读重排实验** 时再进入；**本 closure 不启动 M4**。 |

---

## 10. 约束确认

- **未改** `finalScore`。  
- **未改** worker **主排序**。  
- **未改** `MatchResult.finalScore`。  
- **RRM-Sim 未参与**真实排序 / 融合。  
- **未恢复** `shortlistScenariosV0` 作为真实模拟证据路径。  
- **未写**假 **transcript**；**未写**假成功结果。  
- **当前 RRM-Sim** 定位为 **read-only sidecar / diagnostic layer**（Admin 与 Final Match 消费边界仍以 P6 / 产品文档为准）。

---

*本文路径：`docs/M3/M3-rrm-sim-real-chain-closure.md`*
