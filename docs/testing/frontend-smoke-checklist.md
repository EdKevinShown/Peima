# 前端手工冒烟清单（本地 / 测试环境）

在 API + Worker 已启动、`.env` 白名单包含当前 `userId` 时使用。每条打勾即通过。

## 环境

- [ ] `pnpm dev:api`（或等价）在 `http://127.0.0.1:3000` 可访问
- [ ] Worker / Redis / DB 正常
- [ ] `PEIMA_TEST_MATCH_*`、`PEIMA_TEST_PREVIEW_POOL_SEED_*`、`PEIMA_TEST_MATCH_RESULT_WRITER_*` 含当前用户 id
- [ ] Web 已登录（JWT 与 URL 中 `userId` 一致）

## 1. 匹配等待页 `/matching-waiting?userId=<自己>`

- [ ] 页面加载无白屏、控制台无未处理异常
- [ ] 状态展示合理（`waiting` / `processing` / `ready` 等）
- [ ] 若有「跑一次 batch-match」测试按钮，点击后状态最终可到 `ready`
- [ ] 链到「第一印象预览池」「最终结果」的链接可点

## 2. 预览池 `/preview-pool?userId=<自己>`

- [ ] 有活跃池子，或点击「种子数据」后出现约 6 条候选
- [ ] 列表只读、无异常报错
- [ ] 与 API `GET /preview-pool/user/:userId/latest` 数据一致

## 3. 最终结果 `/final-match?userId=<自己>`

- [ ] **有** MatchResult 内容（头像/分数/说明等，视当前 UI 而定）
- [ ] 若仅有 `aiSimJobId` 查询参数，确认核心结果不依赖 hint 才显示
- [ ] 空态文案与「尚未匹配」区分清楚

## 4. 第二账号（建议）

- [ ] 另一白名单用户重复 1–3
- [ ] 两人候选可以不同（非互选属正常）

## 5. 负向

- [ ] 未登录访问需鉴权页 → 401 或跳转登录，不崩溃
- [ ] URL `userId` 与登录用户不一致 → 拒绝或安全空态

## 备注

- 全链路自动化见 `apps/api/test/matching-full-journey.e2e-spec.ts`
- 压力基线见 `tools/local-pressure-baseline.mjs` 或同上 e2e 内嵌一轮
