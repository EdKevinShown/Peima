# Peima 后端与全链路测试指南（负责人 / 发版前）

**目标：** 后端核心链路零事故；每个带 **fallback（替代实现）** 的能力，在发版前能证明「默认走主路径」或「fallback 是已知、可观测、符合预期的」。

**读者：** 技术负责人、QA、需要自己做一轮验收的老大。

**相关文档：**

| 文档 | 用途 |
| --- | --- |
| [frontend-smoke-checklist.md](./frontend-smoke-checklist.md) | 浏览器端全流程 / 分页面打勾 |
| [project-test-plan-2026-05.md](./project-test-plan-2026-05.md) | 自动化分层、命令、合并门禁 |
| 本文 **§4** | **Fallback 对照表 + 手工验证步骤**（必看） |

---

## 1. 测试底线（后端不能出问题）

发版前至少满足：

1. **自动化全绿**（见 §2）— API 单元/模块 ~220 套件、Worker 9 套件、e2e 关键链路。
2. **两条真实用户链路** — 两个白名单账号各走一遍：登录 → onboarding → 问卷 → 预览池 → 入队匹配 → 有结果 →（可选）聊天/好友。
3. **Fallback 门禁** — 跑 `runtime-fallback-path-gates.spec.ts`；对「生产应开的主路径」在 `.env` 中未被误关。
4. **迁移已部署** — `pnpm db:migrate:deploy` 与线上一致（例如 `user_friendships` 等表存在）。
5. **无 5xx / 未处理异常** — 核心 GET/POST 在冒烟中成功率 ≥ 99%（见 `tools/local-pressure-baseline.mjs`）。

**P0（阻断发版）：** 鉴权、问卷提交、预览池、匹配入队/结果、MatchResult 读写、聊天会话与消息、好友列表、数据库迁移。  
**P1（应修或书面接受风险）：** AI 增强（Copilot、Summary、Match Explanation）、P76 侧车展示、RRM 只读页、Admin 工具。

---

## 2. 自动化怎么跑（负责人一键）

在仓库根目录 `Peima/`：

```bash
# 1) 类型检查
pnpm --filter @peima/api exec tsc -p tsconfig.json --noEmit
pnpm --filter @peima/worker exec tsc -p tsconfig.json --noEmit

# 2) API 单元 + 模块（约 3–10 分钟，视机器而定）
pnpm --filter @peima/api test

# 3) Fallback 环境门禁（专门验证默认开关，见 test/runtime-fallback-path-gates.spec.ts）
pnpm --filter @peima/api exec jest test/runtime-fallback-path-gates.spec.ts

# 4) Worker
pnpm --filter @peima/worker test

# 5) E2E（需要 DATABASE_URL，会起测试用 HTTP）
pnpm --filter @peima/api test:e2e

# 6) 全链路单文件（推荐发版前必跑）
pnpm --filter @peima/api test:e2e -- matching-full-journey.e2e-spec.ts

# 7) 问卷整体解释收敛 / 未收敛占比（统计型，非阻断）
cd apps/api && npm run questionnaire:non-convergence-analysis -- --samples=100000
```

**对运行中的本地 API：**

```bash
node tools/local-api-smoke.mjs
node tools/local-pressure-baseline.mjs --baseUrl http://127.0.0.1:3000 --token "<jwt>" --userId "<id>" --concurrency 20 --requests 200 --path all
```

---

## 3. 按模块：建议测什么、已有自动化在哪

### 3.1 鉴权 `auth`

| 测什么 | 为什么重要 | 自动化 |
| --- | --- | --- |
| 注册/登录/JWT、`GET /auth/me` | 全站入口 | 缺口：无独立 auth e2e，靠各 controller 鉴权 spec |
| 未带 Token → 401 | 安全 | `matching.controller.auth.spec.ts` 等 |

**手工：** 未登录访问 `/matching/result`、发消息 → 401 或跳转登录。

---

### 3.2 Onboarding & 照片 `onboarding` / `images`

| 测什么 | 自动化 |
| --- | --- |
| 上传、审美偏好、`GET /onboarding/photo/status` | `onboarding.service.spec.ts`、`onboarding-photo-*.spec.ts` |
| Vision 规则/云/关闭 | `onboarding-vision-env.spec.ts`、`onboarding-vision-rules-provider.spec.ts` |

**手工：** 新账号走完照片 + 偏好；状态与 API 一致。

---

### 3.3 问卷 `questionnaire`

| 测什么 | 自动化 |
| --- | --- |
| 30 题 canonical 计分、Q29/Q30 | `questionnaire-v3.rules.spec.ts`、`questionnaire-canonical-q29-q30.spec.ts` |
| 整体解释 fallback 标题占比 | `questionnaire-overall-explanation-convergence.spec.ts`、`questionnaire:non-convergence-analysis` |
| 提交写库 | `questionnaire.scorer.regression.e2e-spec.ts` |

**手工：** 提交问卷 → `GET /questionnaire/profile/:userId` 有 `overallExplanation`；画像页 `/questionnaire-profile` 展示一致。

---

### 3.4 预览池 `preview-pool`

| 测什么 | 自动化 |
| --- | --- |
| 无池时懒创建 | `preview-pool-auto-ensure.policy.spec.ts` |
| 真人不足时合成候选 | `preview-pool-generator.service.spec.ts` |
| Shortlist 契约 | `preview-pool-shortlist-contract.v0.spec.ts` |

**手工：** 删池后打开 `/preview-pool` → 自动出现 active 池；约 6 条候选。

---

### 3.5 匹配 `matching` + Worker `batch-match`

| 测什么 | 自动化 |
| --- | --- |
| 入队、状态、结果 GET | `matching-full-journey.e2e-spec.ts` |
| 入站结果可见（双向可见性修复） | `matching-latest-result-access.spec.ts`、`matching-inbound-result.service.spec.ts` |
| 互惠 MatchResult 行 | `reciprocal-match-result-write.spec.ts`（worker） |
| 旧照片写入关闭 | `p710-r9-old-photo-matching-writer-shutdown.spec.ts` |
| P76 读路径 / 安全回落 | `p76-read-path-*.spec.ts`、`p710-r10-safe-fallback-final-policy` 等 |

**手工（双账号）：** A 匹配到 B 后，B 的 `/final-match` 也能看到指向 A 的结果（若仍单向，查 `PEIMA_MATCH_RESULT_RECIPROCAL_ENABLED`）。

---

### 3.6 聊天 `chat` + AI 摘要

| 测什么 | 自动化 |
| --- | --- |
| 同对用户复用会话 | `chat-conversation-participants.spec.ts` |
| 时间线 | `chat-timeline.e2e-spec.ts` |
| Summary / Match Explanation **规则 fallback** | 见 §4；`runtime-fallback-path-gates.spec.ts` |

**手工：** `/chat?peerUserId=<对方>` 发消息双方可见；带 `conversationId` 深链可打开历史。

---

### 3.7 好友 `friends`

| 测什么 | 自动化 |
| --- | --- |
| 匹配后自动好友、`GET /friends/me` | `friendship.service.spec.ts` |

**手工：** 匹配成功后 `/chat` 好友列表有对方；`POST /chat/conversations` 带 `peerUserId` 可建会话。

**DB：** 必须有 `user_friendships` 表（迁移 `20260528120000_user_friendships`）。

---

### 3.8 AI 功能（多为「主路径 = LLM，fallback = 规则」）

| 模块 | 启用开关 | fallback 表现 |
| --- | --- | --- |
| Summary AI | `SUMMARY_AI_ENABLED` | `sourceType: summary_rule_based` |
| Match Explanation AI | `MATCH_EXPLANATION_AI_ENABLED` | `match_explanation_rule_based` |
| Match Review AI | `MATCH_REVIEW_AI_ENABLED` | 静态/规则摘要 |
| Copilot | `AI_COPILOT_ENABLED` | 规则/非 LLM |
| Interaction Sim Lite | `INTERACTION_SIMULATION_LITE_ENABLED` | 规则轴 + verdict |
| Profile Completion | `PROFILE_COMPLETION_AI_ENABLED` | 非 LLM 建议 |
| AI Simulation v1 | `AI_SIMULATION_V1_ENABLED` + worker | 队列不消费 |
| Pairwise Decision | `AI_PAIRWISE_DECISION_ENABLED` + worker | 不跑 pairwise 任务 |

**手工原则：** 响应 JSON 里的 `sourceType` / `sourceVersion` / 日志 `outcome` 必须与当前 `.env` 意图一致（见 §4）。

---

### 3.9 Admin / 测试钩子 `test` / `admin`

| 测什么 | 自动化 |
| --- | --- |
| 白名单、capabilities | `test-match.policy.spec.ts`、`test.controller.spec.ts` |
| 非白名单不能 seed / 跑批 | `test-dev-smoke-hooks.e2e-spec.ts` |

**手工：** `GET /test/matching/capabilities` 仅对白名单用户返回可写能力。

---

## 4. Fallback 对照表（核心：别误跑替代代码）

**术语：**

- **主路径（primary）：** 产品设计希望用户/生产默认走到的实现（常为 LLM、新 writer、或明确业务规则）。
- **Fallback（替代路径）：** 主路径不可用时的兜底（规则引擎、旧展示、合成数据、`尚未收敛` 文案等）。**Fallback 合法，但必须可观测、可配置，不能「静默顶替」主路径。**

### 4.1 生产推荐默认值（发版前核对 `.env`）

| 变量 | 生产建议 | 若配错会怎样 |
| --- | --- | --- |
| `PEIMA_MATCH_RESULT_RECIPROCAL_ENABLED` | **不设或 =1** | =0 时对方看不到匹配结果 |
| `PEIMA_PREVIEW_POOL_AUTO_ENSURE_DISABLED` | **不设**（保持自动建池） | =1 时无池用户白屏 |
| `PEIMA_PREVIEW_POOL_AUTO_ENSURE_SYNTHETIC_DISABLED` | 视环境；测试可开 | 关合成后候选人不足 |
| `PEIMA_P710_R9_OLD_PHOTO_MATCHING_WRITER_SHUTDOWN_ENABLED` | **保持默认关闭旧 writer** | 误开旧 writer 会写脏数据 |
| `PEIMA_P76_READ_PATH_SAFE_FALLBACK` | **默认 ON** | OFF 时侧车不可用可能直接报错而非回落展示 |
| `SUMMARY_AI_ENABLED` / `MATCH_EXPLANATION_AI_ENABLED` | 有 key 则 **1**；无 key 则接受规则 fallback | 关=永远规则，需产品确认 |
| `PEIMA_P76_READ_PATH_ENABLED` | 仅对白名单 viewer 开 | 误开全局会改展示逻辑 |

完整开关列表见附录 A。

---

### 4.2 逐条 Fallback：如何确认「跑的是哪条路径」

下面 **「生产主路径」** 指你们希望线上默认行为；**手工验证** 给负责人可在本地/预发操作。

#### A. 预览池

| 能力 | 主路径 | Fallback | 生产主路径 | 如何确认主路径 | 如何确认 fallback | 自动化 |
| --- | --- | --- | --- | --- | --- | --- |
| 懒建池 | `findLatest` 内 auto-ensure 写库 | 无池且 DISABLED=1 → 404/空 | 懒建 ON | 删池后 `GET /preview-pool/user/:id/latest` 返回新池 | 设 `PEIMA_PREVIEW_POOL_AUTO_ENSURE_DISABLED=1` 再 GET → 无池 | `preview-pool-auto-ensure.policy.spec.ts` |
| 合成候选 | 真实用户凑满 6 | `SYNTHETIC_FALLBACK` 填假人 | 测试环境可开合成 | 池内 `candidateUserId` 均为真实 UUID | 关合成且 DB 真人<6 → 条数<6 或合成标记 | `preview-pool-generator.service.spec.ts` |

#### B. 匹配结果

| 能力 | 主路径 | Fallback | 生产主路径 | 如何确认主路径 | 如何确认 fallback | 自动化 |
| --- | --- | --- | --- | --- | --- | --- |
| 互惠结果行 | worker 写 reciprocal `MatchResult` | `RECIPROCAL_ENABLED=0` 不写 | 互惠 ON | 用户 B（被匹配方）`GET /matching/result/B` 有 inbound | 设 0 跑批后 B 无结果 | `reciprocal-match-result-write.spec.ts` |
| 旧照片 writer | shutdown 阻止写 | 允许旧 writer | **shutdown ON** | 跑批后仅新路径有结果；日志无 legacy write | 白名单开 `PEIMA_TEST_MATCH_RESULT_WRITER_*` 才在 dev 测旧路 | `p710-r9-old-photo-matching-writer-shutdown.spec.ts` |
| P76 读展示 | 侧车 overlay | `SAFE_FALLBACK` → 基线展示 | 白名单开 P76 + safe fallback ON | 白名单用户 result JSON 含 P76 字段 | 关 SAFE_FALLBACK + 无效侧车 → 应回落基线而非 500 | `p76-read-path-env.spec.ts` 等 |
| 匹配展示解析 | `matching-result-display` 主解析 | M5/M6 shadow 仅 meta | 以当前产品开关为准 | `GET /matching/result` 的 `display`/`resultState` 符合预期 | 开 shadow 标志，确认 **展示不变**、仅 insights 增 meta | 大量 `p76-*` / `matching-result-display` specs |

#### C. 问卷整体解释

| 能力 | 主路径 | Fallback | 生产主路径 | 如何确认主路径 | 如何确认 fallback | 自动化 |
| --- | --- | --- | --- | --- | --- | --- |
| 命名人格 | `displayPrimary.source` = primary/candidate | **fallback** → 标题「尚未收敛到命名标签」 | 多数答卷应 primary/candidate | 画像页标题为「整体画像更接近…」或主标签 copy | 构造边缘答卷或随机抽样 ~3.7% fallback | `questionnaire:non-convergence-analysis` |
| 轴不确定 | 有 dominant | uncertain 分支 + 段落收尾 | 允许存在，≠ 未命名 | `uncertainBranchesByAxis` 部分为空 | 多轴 uncertain → 段落含「并列/阶段性参考」 | `questionnaire-v3.rules.spec.ts` |

**注意：** 轴不确定（~99% 随机卷）与「未收敛标题」（~3.7%）是两层概念，不要混为一谈。

#### D. AI 服务（规则 fallback）

| 服务 | 主路径（LLM） | Fallback | 如何确认主路径 | 如何确认 fallback | 自动化 |
| --- | --- | --- | --- | --- | --- |
| Summary AI | `sourceType` 以 `summary_model_` 开头 | `summary_rule_based` | `SUMMARY_AI_ENABLED=1` 且配 key，调 `GET/POST` chat summary | 关 enabled 或无 key → `summary_rule_based`；日志 `outcome:fallback` | `runtime-fallback-path-gates.spec.ts` |
| Match Explanation AI | `match_explanation_model_*` | `match_explanation_rule_based` | 同上 | 同上 | 同上 |
| Match Review AI | LLM 评审 | 静态/规则 | `MATCH_REVIEW_AI_ENABLED=1` | 关闭 → 静态摘要 | `match-review-static-summary.spec.ts` |
| Copilot | LLM | 规则 | `AI_COPILOT_ENABLED=1` | 关闭 → 非 model source | 门禁 spec |
| Interaction Sim Lite | （若启用 LLM） | 规则轴 | `INTERACTION_SIMULATION_LITE_ENABLED` | 关闭 → rule source version | `interaction-simulation-lite-rule-path.spec.ts` |

**手工步骤（Summary 示例）：**

1. 准备有消息的 `conversationId` 和 JWT。  
2. `SUMMARY_AI_ENABLED=0`，重启 API，请求 AI 摘要接口。  
3. 断言响应 `sourceType === "summary_rule_based"`。  
4. `SUMMARY_AI_ENABLED=1` 且配置有效 key，再请求 → `sourceType` 应为 `summary_model_<slug>`。  
5. 查 API 日志：主路径 `outcome` 非 `fallback`；fallback 时有 `reason: disabled|missing_api_key|...`。

#### E. RRM / 模拟诊断

| 能力 | Fallback | 如何确认 |
| --- | --- | --- |
| RRM sim 评分 | `fallbackUsed` in diagnostics | Admin/诊断页；`rrm-sim.evaluator.spec.ts` |

---

### 4.3 负责人 Fallback 打勾清单（约 30 分钟）

在 **预发或本地** 复制下表打勾（`.env` 一份「生产拟真」、一份「故意关主路径」做对比）：

- [ ] **F1** 预览池：无池用户 GET latest → 自动有池（主路径）；`AUTO_ENSURE_DISABLED=1` → 无池（fallback 行为符合预期）
- [ ] **F2** 匹配：跑批后 A、B 双方都能看到结果（互惠 ON）；`RECIPROCAL_ENABLED=0` 时 B 看不到（验证开关有效）
- [ ] **F3** 问卷：提交一份「正常完整卷」→ 画像有命名标题；跑 `questionnaire:non-convergence-analysis` 了解 fallback 约 3–4%
- [ ] **F4** Summary：关 `SUMMARY_AI_ENABLED` → `sourceType=summary_rule_based`；开且 key 有效 → `summary_model_*`
- [ ] **F5** Match Explanation：同上，`match_explanation_*`
- [ ] **F6** `pnpm --filter @peima/api exec jest test/runtime-fallback-path-gates.spec.ts` 全绿
- [ ] **F7** `matching-full-journey.e2e-spec.ts` 全绿（需 DB）
- [ ] **F8** 迁移：`user_friendships` 存在，`GET /friends/me` 不 500

---

## 5. 负责人全流程手工（与前端清单的关系）

**浏览器步骤** 以 [frontend-smoke-checklist.md](./frontend-smoke-checklist.md) **§A 全流程** 为准（约 15–30 分钟）。

**后端额外必做（清单里没有的）：**

1. 跑 §2 全部自动化命令，保存终端输出或 CI 截图。  
2. 完成 §4.3 Fallback 打勾。  
3. 双账号：A 匹配 B 后，分别 `GET /matching/result/:userId` 对比 JSON（candidate、score、conversation 相关字段）。  
4. 聊天：`POST /chat/messages` 后对方 `GET /chat/conversations/:id` 能看到。  
5. 压力：`local-pressure-baseline.mjs` successRate ≥ 99%。

---

## 6. 测试覆盖缺口（知情即可）

| 缺口 | 风险 | 缓解 |
| --- | --- | --- |
| 无独立 `auth` e2e | 登录回归靠手工 | §5 登录步骤 |
| `friends` 无 controller e2e | 好友 API 接线错误 | 手工 F8 + `friendship.service.spec.ts` |
| Web/Admin 几乎无自动化 | UI 回归靠冒烟清单 | frontend-smoke §A/B |
| AI fallback 组合爆炸 | 误配环境 | §4 + `runtime-fallback-path-gates.spec.ts` |
| 4^30 问卷全组合不可穷举 | 统计型审计 | `questionnaire:non-convergence-analysis` |

---

## 7. 发版签字建议

| 项 | 负责人 | 日期 |
| --- | --- | --- |
| API `test` + fallback gates 全绿 | | |
| Worker `test` 全绿 | | |
| `matching-full-journey` e2e 全绿 | | |
| §4.3 Fallback 清单完成 | | |
| frontend-smoke §A 全流程 | | |
| DB migrate deploy 已执行 | | |
| 已知缺口已评审 | | |

---

## 附录 A：环境变量速查（Fallback / 开关）

| 变量 | 默认倾向 | 作用摘要 |
| --- | --- | --- |
| `PEIMA_PREVIEW_POOL_AUTO_ENSURE_ENABLED` / `_DISABLED` | ON | 无池自动建池 |
| `PEIMA_PREVIEW_POOL_AUTO_ENSURE_SYNTHETIC_FALLBACK` / `_SYNTHETIC_DISABLED` | ON | 候选人不足时合成 |
| `PEIMA_MATCH_RESULT_RECIPROCAL_ENABLED` | ON | 互惠 MatchResult |
| `PEIMA_P710_R9_OLD_PHOTO_MATCHING_WRITER_SHUTDOWN_ENABLED` | shutdown ON | 禁旧 writer |
| `PEIMA_P76_READ_PATH_ENABLED` + `VIEWER_IDS` | OFF | P76 展示覆盖 |
| `PEIMA_P76_READ_PATH_SAFE_FALLBACK` | ON | 侧车失败→基线展示 |
| `PEIMA_M5_RRM_TOP2_ENABLED` | OFF | RRM Top2 展示分支 |
| `PEIMA_M6_RRM_V2_SELECTOR_DISPLAY_ENABLED` | OFF | v2 selector 展示 |
| `PAIRWISE_FINAL_MATCH_ENABLED` + `MODE` | OFF | pairwise _finalize |
| `SUMMARY_AI_ENABLED` | OFF | 聊天摘要 LLM |
| `MATCH_EXPLANATION_AI_ENABLED` | OFF | 匹配解释 LLM |
| `MATCH_REVIEW_AI_ENABLED` | OFF | 匹配评审 LLM |
| `AI_COPILOT_ENABLED` | OFF | Copilot LLM |
| `INTERACTION_SIMULATION_LITE_ENABLED` | OFF | 互动模拟 |
| `PROFILE_COMPLETION_AI_ENABLED` | OFF | 补全建议 LLM |
| `AI_SIMULATION_V1_ENABLED` / `_WORKER_ENABLED` | OFF | 模拟 v1 队列 |
| `AI_PAIRWISE_DECISION_ENABLED` / `_WORKER_ENABLED` | OFF | Pairwise 队列 |
| `PEIMA_TEST_MATCH_*` / `PEIMA_TEST_PREVIEW_POOL_SEED_*` | OFF | 仅 dev 白名单 |

代码位置：`apps/api/src/modules/**/**-env.ts`、`*config.service.ts`；`apps/worker/src/jobs/*-env.ts`。

---

## 附录 B：关键 HTTP 端点速查

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/auth/login` | 登录 |
| GET | `/auth/me` | 当前用户 |
| GET | `/questionnaire/questions` | 题目 |
| POST | `/questionnaire/submit` | 提交 |
| GET | `/questionnaire/profile/:userId` | 画像 + overallExplanation |
| GET | `/preview-pool/user/:userId/latest` | 最新预览池 |
| POST | `/matching/enqueue` | 入队 |
| GET | `/matching/status/:userId` | 状态 |
| GET | `/matching/result/:userId` | 结果（核心） |
| GET | `/friends/me` | 好友列表 |
| POST | `/chat/conversations` | 建会话（可带 `peerUserId`） |
| POST | `/chat/messages` | 发消息 |
| GET | `/test/matching/capabilities` | 测试能力（白名单） |
| POST | `/test/matching/run-batch-once` | 本地跑一批匹配 |

---

*文档版本：2026-05-28。若新增 env 或 fallback，请同步更新 §4 与 `runtime-fallback-path-gates.spec.ts`。*
