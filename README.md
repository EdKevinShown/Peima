# Peima / 配吗

AI-assisted relationship matching MVP.

## 1. 项目一句话简介

配吗是一个 **AI 辅助**关系匹配系统：用结构化问卷、基础偏好、候选池、批次匹配、**RRM（关系节奏）**评估、最终结果展示和聊天辅助，帮助用户从候选人里得到**一个当前推荐对象**，并理解**为什么**会看到这个推荐。

它不是「纯聊天机器人」，也不是已经上线的「全自动 AI 恋爱模拟器」：大模型能力主要用于解释、复审、预判与诊断；**基础匹配决策仍由结构化规则与 worker 打分链路产生**。

## 2. 当前阶段状态

**当前阶段：M5 / M5.6 已收口，准备进入 M6。**

**当前完成重点：**

- **P0–P5**：主链路与产品化能力（预览池、入队、worker 批次匹配、结果页、聊天、治理与 Admin 等）已形成。
- **P6 系列**：AI 解释、摘要、画像补全建议、匹配复审（Match Review）、互动预判（Interaction Simulation Lite）等**受控、可关、可 fallback** 的能力已接入代码库。
- **M5**：完成 **RRM Top2 controlled production path**（展示解析、元数据、hook job outbox、受控 runner / apply gate、共享 apply 服务、独立 dry-run poller、staging 风格 apply 记录等；详见 `docs/M5/`）。
- **下一阶段 M6**：计划进入 **feedback `decisionContext`**、**RRM 质量评估**、**Admin observation** 等方向，用数据回答「RRM 是否真的提升体验」，而不是在 M5 上无限堆功能。

## 3. 当前已完成的主流程（按用户视角）

1. **注册 / 登录**：账号体系与 JWT，进入产品主流程。
2. **基础资料与偏好**：填写个人资料与匹配偏好，为后续池化与打分提供输入。
3. **问卷画像**：结构化问卷 → 画像视图（只读 API + Web 展示）；用于匹配与多种 AI 侧车的输入摘要。
4. **Preview Pool**：在正式批次前形成「可匹配候选人」视图与元数据（预览池条目等）。
5. **Worker batch-match**：定时或手动触发 worker，对池中用户跑一轮批次匹配，**写入 `MatchResult`（含 `finalScore`、`candidateUserId` 等）**。
6. **MatchResult**：数据库中的一条「本轮对你的匹配结果」，是后续展示、聊天对齐、侧车读数的锚点。
7. **Display resolver**：`GET /matching/result` 时由 `resolveMatchResultDisplay` 计算 **`displayCandidateUserId` / `displaySourceType`**（只读、不写库）；在条件满足时可用 **RRM Top2** 或 **pairwise finalize** 元数据覆盖「展示用候选人」，**不**改库里的 `candidateUserId` / `finalScore`。
8. **FinalMatchPage**：读取匹配结果与解析后的展示字段，**优先展示 `displayCandidateUserId`**；分数区文案区分「基础适配」与「相处节奏影响展示对象」等情况（见 §7）。
9. **Chat handoff**：从结果页进聊天时携带 **`matchResultId`**，后端用同一套 display 解析对齐聊天对象（见 §8）。
10. **Feedback / Copilot / Timeline 等**：会话反馈、只读 Copilot、关系时间线等**辅助能力**在聊天与相关页面串联；**不**替代主匹配写库逻辑。

## 4. 匹配算法当前真实分层

下表描述的是**仓库里真实存在的分层**与**默认/常见触发方式**；「自动」需区分 **worker 定时**、**用户打开页面拉取**、**受控 CLI / staging** 与 **production 默认未开启的 poller**。

| 层 | 名称 | 当前作用 | 是否自动运行 | 是否调用 LLM | 是否改 finalScore | 是否改 candidateUserId | 是否影响展示对象 |
|---|------|----------|--------------|--------------|-------------------|------------------------|------------------|
| L1 | **Static / base matching** | Worker 批次匹配：根据池与规则生成 **`MatchResult`**、**`finalScore`**、**`candidateUserId`** 等 | 依赖 worker 调度 / 手动跑 job | 否 | 是 | 是 | 是（默认展示静态 Top1） |
| L2 | **Pairwise finalize** | `POST /matching/finalize-with-pairwise`：把已完成的 **pairwise job** 冻结为侧车元数据；**不**改 `MatchResult` 行上的 `candidateUserId` / `finalScore` | 调用方触发（非每条结果自动） | 否（本接口消费上游 job；pairwise 本身可有 LLM） | 否 | 否 | **条件满足时可**（`displaySourceType` 可为 `pairwise_final` 等） |
| L3 | **RRM Top2 display resolver** | 在 `PEIMA_M5_RRM_TOP2_ENABLED` 等闸门 + 冻结元数据 + eligibility 满足时，把展示候选解析为 Top2 之一 | 随 **`GET /matching/result`** 读路径执行 | 否 | 否 | 否 | **可**（`displaySourceType = rrm_top2_bounded_selector`） |
| L4 | **RRM hook job / outbox controlled path** | Hook job 出队、dry-run / **显式确认的 apply**、写入 **`MatchResultRrmTop2DisplayMeta`** 等；属于 **M5.6 受控生产路径** | **非**生产默认全自动；以 **CLI / 显式运维配置** 为主（见 §6） | 否（路径本身；上游 simulation 可另涉 LLM） | 否 | 否 | **可**（为 resolver 提供冻结元数据） |
| — | **Match Review AI** | 对「当前最新匹配」与指定候选人做结构化复审 JSON；**不落库** | 用户或前端触发 | 受 `MATCH_REVIEW_AI_*` 控制 | 否 | 否 | 否 |
| — | **Match Explanation AI** | 用自然语言解释**已有**匹配结果字段 | 用户或前端触发 | 受 `MATCH_EXPLANATION_AI_*` 控制 | 否 | 否 | 否 |
| — | **Interaction Simulation Lite** | 结构化「初次聊天互动预判」 | 用户或前端触发 | 受 `INTERACTION_SIMULATION_LITE_*` 控制 | 否 | 否 | 否 |
| — | **AI Simulation V1** | 受控 **job / worker / diagnostic**，产生 simulation、transcript_lite、RRM 相关侧车等**上游产物** | **否**（非每条 `MatchResult` 默认跑） | 受 `AI_SIMULATION_V1_*` 等控制 | 否 | 否 | **不直接**；可为 RRM / 深度筛选提供输入 |
| — | **Copilot** | 会话级只读建议（规则为主，可选 LLM enrich） | 打开 Copilot / 相关页面时 | 受 `AI_COPILOT_ENABLED` + `AI_*` 控制 | 否 | 否 | 否 |

**口径小结：** **`finalScore` 与 `MatchResult.candidateUserId` 由 L1（及历史数据）决定；RRM / pairwise 只参与「展示解析」与侧车元数据，不重算 worker 主分数、不覆盖存储的主候选 id。** **`GET /matching/result` 保持只读、不写库。**

## 5. AI「模拟聊天」/ 互动预判的真实说明

**必须先说清：** 当前系统**没有**默认生产化的「两个真实用户由 AI 代替多轮互聊，并由聊天结果**自动**改写最终匹配对象」的链路。

相关能力分三类：

### 5.1 Interaction Simulation Lite

- **输入**：`MatchResult` 上下文 + **双方问卷画像** + **静态摘要**（与复审等侧车同源风格）。
- **输出**：结构化互动预判（例如开场难度、冷场风险、节奏建议等 JSON）。
- **开关与失败**：`INTERACTION_SIMULATION_LITE_*` 关闭、缺 key、超时或 JSON 无效时走 **规则 fallback**。
- **不写 DB**；**不自动发送聊天消息**；**不改** `finalScore`、`candidateUserId`，也**不直接改** `displayCandidateUserId`。

### 5.2 AI Simulation V1

- **性质**：受控 **job、worker 队列消费、诊断页/Admin** 等路径使用的 **AI Simulation V1**；用于假设性 simulation、`transcript_lite`、RRM 诊断输入等。
- **不是**：每条 `MatchResult` 创建后默认自动跑；**不是**两端真实用户自动互发消息。
- **定位**：更多是 **RRM / 深度筛选 / 未来流水线** 的上游与实验能力，与「日常匹配主链路默认行为」解耦。

### 5.3 `rrmSimReadonlySummary`

- **性质**：**viewer-safe** 的只读摘要字段（在 `matchInsights` 等读路径中参与 eligibility / 展示契约）。
- **不是**：完整聊天 transcript；**不**以此保存完整 prompt / 原始长 transcript / 原始模型打分明细。
- **写入方式**：通过 **受控 writer、fixture、hook apply path** 等写入；**不是** production 里无条件的默认全自动写入。

## 6. RRM Top2 当前能力（M5.6 口径）

RRM Top2 已从 **fixture / 实验** 演进为仓库内的 **controlled production path**，主要包括：

- **RRM display resolver**（`resolveMatchResultDisplay`：RRM 分支与 pairwise / 原始结果之间的优先级）。
- **`MatchResultRrmTop2DisplayMeta`**（以及与之配套的解析、guardrails、**existing frozen meta 不覆盖**等约束）。
- **`rrmSimReadonlySummary`**（只读摘要；供 eligibility 等使用）。
- **Explicit guardrails**（防越界、防误写、与只读 GET 契约一致）。
- **Writer foundation**（例如 meta writer runner / env：`PEIMA_M5_RRM_TOP2_META_WRITE_ENABLED`）。
- **Hook job outbox**（hook job 表 + 状态机；consumer dry-run / apply 分层）。
- **Controlled create runner**（M5.6-B3：`m56-b3-rrm-top2-hook-job-cli`）。
- **Dry-run consumer**（M5.6-B4B：`m56-b4b-rrm-top2-hook-job-consumer-cli`）。
- **Controlled apply gate**（M5.6-B5：`m56-b5-rrm-top2-hook-job-apply-cli`，需 **`--apply`** 与 **`--confirmControlledApply=I_UNDERSTAND`**）。
- **Shared apply service**（B7 提取的共享服务：poller / CLI / 测试共用聚合逻辑）。
- **Independent dry-run poller**（M5.6-B8：`m56-b8-rrm-top2-hook-job-dry-run-poller-cli`，只读聚合）。
- **Staging-style apply record**（见 `docs/M5/M5.6-b9b-rrm-top2-staging-apply-run-record.md` 等）。

**必须明确：**

- **Production 默认 worker 自动轮询 hook job 并自动 apply 尚未作为默认开启能力**；日常 `apps/worker` 入口当前主要是 **daily match cron** 与 **AI simulation / pairwise 队列 worker**（见 `apps/worker/src/main.ts`）。**常驻 `PEIMA_M5_RRM_TOP2_HOOK_POLLER_*` 式 poller** 见 **`docs/M5/M5.6-b7a-rrm-top2-hook-job-poller-design.md`** 等设计/运维记录，**与「dev:worker 开箱即跑」不是同一回事**。
- **`GET /matching/result` 不写库**，只返回解析后的视图字段。
- **RRM 不改 `finalScore`；不改 `MatchResult.candidateUserId`。**
- **RRM 影响的是 `displayCandidateUserId` / `displaySourceType`（在闸门与元数据满足时）。**
- **已有 frozen meta 不被覆盖**（具体拒绝原因以代码与 M5 文档为准）。

## 7. FinalMatchPage 当前语义

- **展示对象**：优先使用 **`displayCandidateUserId`**；缺省回退 **`candidateUserId`**。
- **当 RRM Top2 生效时**：`displaySourceType === "rrm_top2_bounded_selector"`；主文案区会区分 **「基础适配指数」** 与 **「当前展示对象还结合了相处节奏判断」**（见 `FinalMatchHero` / `finalMatchNarrative`），**避免暗示 `finalScore` 已包含 RRM 重算**。
- **对普通用户**：主界面使用自然中文；**RRM / Top2 / raw score** 等内部词出现在 **「开发者调试信息」折叠区**等位置——产品主路径不应依赖用户理解这些内部名。
- **匹配指数 / 基础适配指数**：来自 **基础匹配分（`finalScore`）**，**不是** RRM 模型分。

## 8. Chat 当前语义

- **FinalMatchPage → Chat**：跳转时携带 **`matchResultId`**（query）。
- **`ChatService.createOrReuseConversation`**：若带 `matchResultId`，会通过 **`resolveMatchResultDisplay`** 解析 **`displayCandidateUserId`**，使会话中的 **candidate** 与结果页展示一致（RRM 生效时尤其重要）。
- **不会**：由系统在用户无操作下 **自动发送** AI 生成的开场白。
- **快捷话题**：仅 **填入输入框**，**不自动发送**（见 `ChatPage` 文案）。

## 9. AI 能力与 fallback（env 速查）

多数能力 **`*_ENABLED` 默认为关** 或需配 **`API_KEY` / `BASE_URL`**；失败时普遍 **规则 fallback**（各模块日志里会有 `fallback` / `rule_based` 等标识）。

**Base URL 提示：**  
Match Review / Match Explanation / Summary / Interaction Lite / Copilot 等客户端通常拼接 **`${BASE_URL}/v1/chat/completions`** → **`BASE_URL` 用供应商根域名**（如 `https://api.moonshot.cn`），**不要再手动追加 `/v1`**。  
**AI Simulation V1** 使用 **`AiSimulationV1ChatClient`**：按 **`AI_SIMULATION_V1_BASE_URL`**（可回落到 Match Review）拼接 **`/chat/completions`**；OpenAI 常写 **`https://api.openai.com/v1`**，DeepSeek 常写 **`https://api.deepseek.com`**（**无**额外 `/v1`）——以 `ai-simulation-v1-chat.client.ts` 注释为准。

| 能力 | 主要 env 前缀 / 开关 | 默认倾向 | fallback / 说明 |
|------|----------------------|-----------|-----------------|
| Match Review AI | `MATCH_REVIEW_AI_*` | 关（未设 `ENABLED=1`） | 规则复审 JSON |
| Match Explanation AI | `MATCH_EXPLANATION_AI_*` | 关 | 规则占位说明文本 |
| Interaction Simulation Lite | `INTERACTION_SIMULATION_LITE_*` | 关 | 规则结构化预判 |
| AI Simulation V1 | `AI_SIMULATION_V1_*`（LLM 可回落 `MATCH_REVIEW_AI_*`） | 关 | 队列/接口层拒绝或诊断不可用 |
| Copilot LLM enrich | `AI_COPILOT_ENABLED` + `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` / `AI_TIMEOUT_MS` 等 | 关 | 纯规则 Copilot insights |
| Summary AI | `SUMMARY_AI_*` | 关 | 规则摘要（chat summary service） |
| Profile completion AI | `PROFILE_COMPLETION_AI_*` | 关 | 接口返回禁用说明 / 不调 LLM |
| RRM Top2 展示闸门 | `PEIMA_M5_RRM_TOP2_ENABLED` | 关 | 不走 RRM 展示分支 |
| RRM Top2 meta 写入 | `PEIMA_M5_RRM_TOP2_META_WRITE_ENABLED` | 关 | CLI / writer 拒绝写入 |
| RRM sim readonly summary 写入 | `PEIMA_M5_RRM_SIM_READONLY_SUMMARY_WRITE_ENABLED` | 关 | merge summary 类路径拒绝 |
| RRM hook poller（运维/设计名） | `PEIMA_M5_RRM_TOP2_HOOK_POLLER_*`（见 `docs/M5/M5.6-b7a-*.md`） | **非 dev:worker 默认** | 与 staging 记录、显式 confirm 搭配使用 |

> 说明：`.env.example` 中 **`FINAL_MATCH_CONCLUSION_AI_*`** 标注为历史/文档向；**当前 `apps/api` 未实现该前缀模块**，README 不将其列为已交付开关。

## 10. 技术栈

- **Web**：React + Vite（`apps/web`）；另有 Admin 子应用（`apps/admin`）。
- **API**：NestJS（`apps/api`）。
- **Worker**：Node（`apps/worker`；`@nestjs/schedule` cron + 可选 one-shot 参数）。
- **Database**：Prisma + PostgreSQL（`packages/database`）。
- **Package manager**：pnpm（workspace）。
- **Auth**：JWT。
- **AI provider**：OpenAI-compatible；Kimi / DeepSeek 等通过各模块 **独立或共享的 `BASE_URL` + `API_KEY` + `MODEL`** 配置。

## 11. Monorepo 结构（与仓库一致）

- `apps/web` — 用户端 Web。
- `apps/admin` — 管理端 Web。
- `apps/api` — NestJS API。
- `apps/worker` — 定时与队列 worker。
- `packages/database` — Prisma schema / client。
- `packages/shared` — 共享类型与工具。
- `packages/scoring` — 计分相关库。
- `packages/config` — 共享配置。
- `packages/ai-prompts` — 提示词包（若被各模块引用）。
- `packages/ai-simulation-v1-runner` — AI Simulation V1 队列 worker 侧包。
- `packages/ai-pairwise-decision-runner` — Pairwise 决策队列 worker 侧包。
- `packages/sdk` — 对外/内部 SDK（如存在发布流程则见包内说明）。
- `docs/` — 里程碑与规格文档（含 `docs/M5/`、`docs/P6/` 等）。

## 12. 常用本地命令（PowerShell 友好）

**安装依赖（仓库根目录）：**

```powershell
pnpm install
```

**数据库 migration / generate（示例：在 `packages/database` 下用根 `.env`）：**

```powershell
cd packages/database
pnpm exec dotenv -e ..\..\.env -- prisma migrate deploy --schema=.\prisma\schema.prisma
pnpm exec dotenv -e ..\..\.env -- prisma generate --schema=.\prisma\schema.prisma
```

也可使用根脚本：`pnpm db:migrate:deploy`（内部已 `dotenv` + `@peima/database`）。

若 Windows 上 **`prisma generate` 报 EPERM**：先结束占用文件的 Node 进程，例如：

```powershell
taskkill /F /IM node.exe
```

然后重新执行 `prisma generate`。

**启动开发：**

```powershell
pnpm -w run dev:api
pnpm -w run dev:web
pnpm -w run dev:worker
```

**构建 / 类型检查（示例）：**

```powershell
pnpm --filter @peima/api build
cd apps/api
npx tsc --noEmit
pnpm exec nest build
```

## 13. M5.6 代表性验证命令（占位符）

以下命令假设已在 **`apps/api`** 执行过 **`pnpm --filter @peima/api build`**，且在 **`apps/api`** 目录下运行 **`dist`** 内 CLI；**将占位符换成你本地数据库中的 id**（不要把真实 ID 提交进仓库文档外的版本控制）。

**B3 — controlled hook job create：**

```powershell
cd apps\api
node --env-file=..\..\.env dist\dev-cli\m56-b3-rrm-top2-hook-job-cli.js --matchResultId=<LOCAL_MATCH_RESULT_ID> --viewerUserId=<LOCAL_VIEWER_USER_ID> --top2CandidateUserIdA=<ID_A> --top2CandidateUserIdB=<ID_B> --top2Fingerprint=<FINGERPRINT> [--apply] [--pretty]
```

**B4B — consumer dry-run（不写库）：**

```powershell
node dist\dev-cli\m56-b4b-rrm-top2-hook-job-consumer-cli.js [--limit=<N>] [--pretty]
```

**B5 — apply runner（默认 dry-run；真写需显式确认）：**

```powershell
node dist\dev-cli\m56-b5-rrm-top2-hook-job-apply-cli.js [--limit=<N>] [--pretty] [--apply] [--confirmControlledApply=I_UNDERSTAND]
```

**B8 — independent dry-run poller：**

```powershell
node dist\dev-cli\m56-b8-rrm-top2-hook-job-dry-run-poller-cli.js [--limit=<N>] [--once] [--pretty]
```

等价 npm script 见 `apps/api/package.json` 中 `m56-b3:rrm-top2-hook-job` 等条目。

## 14. 当前不应该误解的点

- **不是所有 AI 能力都默认开启**；多数要显式 env + key。
- **不是每次匹配都会自动跑完整 AI simulation**；AI Simulation V1 是 **受控 job / 诊断** 向能力。
- **AI simulation 不会直接重算 `finalScore`**，也不会把「聊天结果」写回主匹配行覆盖 `candidateUserId`。
- **RRM 不覆盖 `MatchResult.candidateUserId`**；只影响读模型下的 **展示字段**（在条件满足时）。
- **`GET /matching/result` 不写库**。
- **Chat 不会自动替用户发出消息**；快捷话题只填输入框。
- **Production 默认 worker 对 RRM hook 的自动轮询 / 自动 apply 尚未作为开箱默认能力**；需要运维级开关与 M6 后续 operationalization。

## 15. 下一阶段 M6 方向（建议）

1. **Feedback `decisionContext`** — 把用户真实反馈与匹配上下文结构化，支撑迭代与实验分析。
2. **RRM quality analytics** — 回答「RRM 是否提升匹配质量 / 聊天转化 / 满意度」，而不是继续堆 M5 功能。
3. **Admin observation** — 运营与产品可观测、可审计的视图与采样。
4. **Optional production poller operationalization** — 在风险可控前提下，把 hook poller / apply 从 **staging / 受控 CLI** 推广到可选生产默认（与 SRE 流程绑定）。

**说明：** M6 的重点是 **评估 RRM 是否带来真实增益**，而不是无限扩展 M5 边界。

## 16. 当前状态摘要

M5 已收口。M6 即将开始。

当前 README 对应状态：  
**M5.6 RRM Top2 controlled production path closed.**  
**Next: M6 feedback / quality analytics / admin observation.**

更细的里程碑、验收与运行记录见 **`docs/M5/`**、**`docs/P6/`** 等目录。
