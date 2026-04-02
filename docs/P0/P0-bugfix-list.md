# P0 Bugfix List

## 如何使用这份 bugfix list

- 在进行 P0 验收时，把发现的每个问题按“发现顺序”填写到表格里。
- `状态` 建议填写：`todo`（待处理）/ `doing`（正在修复）/ `fixed`（已修复）。
- `严重程度` 建议按影响范围评估：  
  - `high`：阻塞 P0 闭环（无法完成核心链路：登录/问卷/预览池/匹配/最终结果/聊天，或大量请求 401/500）  
  - `medium`：不阻塞但影响关键功能可用性或需手动规避  
  - `low`：体验/边界问题（影响较小）
- 每次修复后更新 `实际结果`、`状态` 与必要的 `备注`（例如对应 commit、修复原因、回归验证信息）。

---

| 编号 | 模块 | 问题描述 | 复现步骤 | 预期结果 | 实际结果 | 严重程度（high / medium / low） | 状态（todo / doing / fixed） | 备注 |
|---|---|---|---|---|---|---|---|---|
| 1 | deployment / worker / matching | worker 执行 batch-match 时 Prisma Client 未初始化，导致无法生成 MatchResult | 1）确保队列已 enqueue 成功；2）执行 `docker compose exec worker node apps/worker/dist/main.js --batch-match`；3）观察 worker 日志 | PrismaClient 能正常 import/初始化并生成 MatchResult，/final-match 显示结果 | worker 日志报错：`@prisma/client did not initialize yet. Please run "prisma generate"...`；未生成 MatchResult | high | fixed | 已修复：`apps/worker/Dockerfile` 构建阶段增加 `pnpm --filter @peima/database build`，确保 Prisma generate 产物在 worker 镜像内可用；修复后 batch-match 写入 `match_results`，状态可查询为 `ready`。 |
| 2 | web / login | `/login` 注册/登录报错 `i.text is not a function` | 1）打开 `/login`；2）点击注册或登录；3）观察页面错误 | 注册/登录请求成功，token 写入 localStorage 并跳转等待页 | 页面报错 `i.text is not a function` | high | fixed | 已修复：统一 web 侧 API 调用方式，禁止 `handleJson(fetch(...))`，改为 `const res = await fetch(...); return handleJson(res)`；修复涉及 `apps/web/src/api/auth.ts`、`apps/web/src/api/matching.ts`、`apps/web/src/api/previewPool.ts`、`apps/web/src/api/questionnaire.ts`、`apps/web/src/api/chat.ts`。 |
| 3 | deployment / web | web Docker 端口不一致：日志显示 `--port 5173`，但 `vite preview` 实际打印 `localhost:4173` | 1）启动 docker-compose；2）查看 web 容器日志；3）访问 `localhost:5173` | 容器稳定监听 `5173`，日志输出与映射一致 | 日志端口为 `4173`，导致宿主访问不稳定/不正确 | medium | fixed | 已修复：`apps/web/vite.config.ts` 增加 `preview.port=5173` + `strictPort=true`，并在 `apps/web/Dockerfile` 的 preview 启动参数加入 `--strictPort`，保证不会自动换端口。 |
| 4 | deployment / worker | worker 容器启动路径错误：找不到 `/app/dist/main.js` | 1）启动 docker-compose；2）观察 worker 重启日志 | worker 能正确启动并注册 cron | 报错 `Cannot find module '/app/dist/main.js'`，容器重启 | high | fixed | 已修复：`apps/worker/Dockerfile` 的 CMD 改为 `node apps/worker/dist/main.js`（worker 的 outDir=dist 在 package 内）。 |

