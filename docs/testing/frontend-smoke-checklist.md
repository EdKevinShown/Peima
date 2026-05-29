# 前端手工冒烟清单（本地 / 测试环境）

在 API + Worker 已启动、`.env` 白名单包含当前 `userId` 时使用。每条打勾即通过。

**两种用法：**

| 章节 | 用途 |
| --- | --- |
| [A. 全流程手工](#a-全流程手工推荐发版前) | 按顺序走完整用户旅程（登录 → onboarding → 问卷 → 匹配 → 结果 → 可选聊天） |
| [B. 分页面冒烟](#b-分页面冒烟数据已就绪时) | 只验三页 UI，适合已有 MatchResult / 预览池时快速回归 |

自动化与压力基线见文末「备注」。

---

## 环境（全流程与分页面共用）

- [ ] `pnpm dev:api` 在 `http://127.0.0.1:3000` 可访问
- [ ] `pnpm dev:web` 在 `http://127.0.0.1:5173` 可访问
- [ ] Worker / Redis / DB 正常
- [ ] 测试用户已在 `.env` 白名单中：`PEIMA_TEST_MATCH_*`、`PEIMA_TEST_PREVIEW_POOL_SEED_*`（可选，用于强制换池）、`PEIMA_TEST_MATCH_RESULT_WRITER_*`
- [ ] 预览池懒生成默认开启（`PEIMA_PREVIEW_POOL_AUTO_ENSURE_DISABLED` 未设为 `1`）；首次打开预览池页会自动建池
- [ ] 浏览器控制台无持续报错（偶发可记录）

---

## A. 全流程手工（推荐发版前）

**预计 15–30 分钟**（新账号更长）。全程 URL 保持 `?userId=<当前登录用户>`（或由页面自动写入 `localStorage.peimaUserId`）。

### A0. 准备

- [ ] 使用**白名单测试账号**（或新建手机号登录，并把新 `userId` 加入上述三个 `*_USER_IDS`）
- [ ] 记录本流程使用的 `userId`：________________

### A1. 登录

路径：`/login`

- [ ] 输入手机号登录成功
- [ ] `localStorage` 有 `peimaToken`（及通常有 `peimaUserId`）
- [ ] 首页 `/` 显示已登录状态（非仅「去登录」）

### A2. Onboarding（照片 → 审美）

按首页「继续流程」或手动进入（顺序以 API `onboarding` 状态为准）：

| 步骤 | 路径 | 检查项 |
| --- | --- | --- |
| 上传照片 | `/onboarding/photo-upload?userId=…` | 可上传/更新照片，无白屏 |
| 审美偏好 | `/onboarding/photo-preference?userId=…` | 可保存偏好，可进入下一步 |
| 第一印象（onboarding） | `/onboarding/photo-preview?userId=…` 或 `/preview-pool?userId=…` | 能看到预览池或引导；只读、无报错 |

- [ ] 若账号**已完成** onboarding，可标「跳过 A2」，直接进入 A3

### A3. 关系画像问卷

路径：`/questionnaire?userId=…` → 可选 `/questionnaire-profile?userId=…`

- [ ] 问卷可提交/保存
- [ ] 提交后存在 `UserProfile`（匹配入队前置条件；可在账户页或 API 侧确认）
- [ ] 画像页（若有）展示与问卷一致

### A4. 匹配等待（入队 + 跑批）

路径：`/matching-waiting?userId=…`

- [ ] 页面加载正常，状态与 API `GET /matching/status/:userId` 一致
- [ ] **新用户**：若未入队，通过页面或 API `POST /matching/enqueue` 进入 `waiting`
- [ ] 有预览池：无池时可点「生成本地测试预览池」（需白名单）
- [ ] 点「立即做一次匹配（测试）」或等价操作后，状态最终为 **`ready`**（或页面提示「匹配已完成」）
- [ ] 链接「第一印象预览池」「最终结果」可点击

### A5. 预览池（核对数据）

路径：`/preview-pool?userId=…`

- [ ] 有 **active** 池，约 **6** 条候选（或种子后达到）
- [ ] Shortlist / 候选列表与 `GET /preview-pool/user/:userId/latest` 一致

### A6. 最终结果

路径：`/final-match?userId=…`

- [ ] **有** MatchResult 主内容（分数、说明、推荐对象等），非长期停在「暂无结果」
- [ ] 首屏若短暂空态，刷新或等待 2–3 秒后应出现内容
- [ ] 可选：带 `aiSimJobId` 的深链仍能显示**核心结果**（hint 仅增强侧车）
- [ ] 「进入聊天」「返回等待页」等主按钮可用

### A7. 可选延伸（非匹配主链必测）

- [ ] **聊天** `/chat?userId=…`：能打开、目标用户与最终结果一致
- [ ] **关系时间线** `/chat/timeline?userId=…`：只读加载正常
- [ ] **账户** `/account`：用户信息正确

### A8. 全流程结论

- [ ] A1–A6 全部通过 → **全流程手工 PASS**
- [ ] 失败步骤编号：________ 现象：________

---

## B. 分页面冒烟（数据已就绪时）

适合：本地已有 `MatchResult` + 预览池，只回归三页 UI（约 5 分钟）。

### B1. 匹配等待页 `/matching-waiting?userId=<自己>`

- [ ] 页面加载无白屏、控制台无未处理异常
- [ ] 状态展示合理（`waiting` / `processing` / `ready` 等）
- [ ] 若有「立即做一次匹配（测试）」，点击后状态最终可到 `ready`
- [ ] 链到「第一印象预览池」「最终结果」的链接可点

### B2. 预览池 `/preview-pool?userId=<自己>`

- [ ] 有活跃池子，或点击「生成本地测试预览池」后出现约 6 条候选
- [ ] 列表只读、无异常报错
- [ ] 与 API `GET /preview-pool/user/:userId/latest` 数据一致

### B3. 最终结果 `/final-match?userId=<自己>`

- [ ] **有** MatchResult 内容（头像/分数/说明等，视当前 UI 而定）
- [ ] 若仅有 `aiSimJobId` 查询参数，确认核心结果不依赖 hint 才显示
- [ ] 空态文案与「尚未匹配」区分清楚

### B4. 第二账号（建议）

- [ ] 另一白名单用户重复 B1–B3（或全流程 A1–A6）
- [ ] 两人候选可以不同（**非互选属正常**）

### B5. 负向

- [ ] 未登录访问需鉴权页 → 401 或跳转登录，不崩溃
- [ ] URL `userId` 与登录用户不一致 → 拒绝或安全空态

---

## C. Fallback 路径验收（负责人 / 发版前，约 30 分钟）

**详细说明与对照表：** [backend-qa-and-fallback-manual-guide.md](./backend-qa-and-fallback-manual-guide.md) §4。

自动化门禁（无需浏览器）：

```bash
pnpm --filter @peima/api exec jest test/runtime-fallback-path-gates.spec.ts
```

手工最小打勾（在 API 已启动、有两账号 JWT 时）：

- [ ] **F1** 预览池无池 → `GET /preview-pool/user/:id/latest` 自动有池；`.env` 设 `PEIMA_PREVIEW_POOL_AUTO_ENSURE_DISABLED=1` 重启后同用户无池（验证开关有效）
- [ ] **F2** 跑批匹配后，**被匹配方**也能在 `/final-match` 看到结果（`PEIMA_MATCH_RESULT_RECIPROCAL_ENABLED` 勿误关）
- [ ] **F3** 关 `SUMMARY_AI_ENABLED` 调摘要接口 → 响应 `sourceType` 为 `summary_rule_based`；开启且 key 有效 → `summary_model_*`
- [ ] **F4** 问卷画像页：正常卷有命名标题；边缘卷可出现「尚未收敛到命名标签」（约 3–4%，见 `questionnaire:non-convergence-analysis`）

---

## 备注

| 类型 | 位置 |
| --- | --- |
| **后端 + Fallback 完整测试指南（负责人）** | [backend-qa-and-fallback-manual-guide.md](./backend-qa-and-fallback-manual-guide.md) |
| 全链路自动化（API + worker，无浏览器） | `apps/api/test/matching-full-journey.e2e-spec.ts` |
| Fallback 环境默认门禁 | `apps/api/test/runtime-fallback-path-gates.spec.ts` |
| 对运行中 dev API 一键冒烟 + 压力 | `node tools/local-api-smoke.mjs` |
| 压力脚本单独使用 | `tools/local-pressure-baseline.mjs` |

**分工建议：** 发版前跑 **A 全流程手工** + **C Fallback** + 自动化 e2e；日常改 UI 只跑 **B 分页面** 即可。
