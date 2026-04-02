# P0 状态短摘要（可直接转发）

peima（配吗）是一个 monorepo：前端 `apps/web`（React+Vite），后端 `apps/api`（NestJS），定时/批次 worker `apps/worker`（Node+node-cron），数据库 `packages/database`（Prisma+PostgreSQL）。

当前 P0：已跑通端到端主链路并可认为完成。链路为：JWT 注册/登录 -> 问卷提交落库画像 -> 准备候选用户与 images -> `preview-pool/generate` 生成 6 人预览池并在页面展示 -> `matching/enqueue` 入队 -> worker cron/batch-match 产出 `match_results` -> final-match 展示 -> 创建 conversation 并在 chat 发送消息。

已修复的关键问题包括：web API 处理 `handleJson` 的 `i.text is not a function`、web Docker 端口 4173/5173 不一致、worker Docker 启动路径错误、worker batch-match Prisma Client 未初始化。下一步：做轻量回归/边界测试并开始 P1 文档与功能规划。

