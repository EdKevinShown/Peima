# Peima

AI 关系匹配系统 — 当前为 **工程骨架** 阶段，业务逻辑后续迭代补充。

## 环境要求

- Node.js >= 20
- pnpm >= 9

## 快速开始

```bash
pnpm install
```

开发（按需）：

```bash
pnpm dev:web      # 用户端 Web (Vite)
pnpm dev:admin    # 管理端
pnpm dev:api      # NestJS API
pnpm dev:worker   # 批处理 Worker
```

复制环境变量模板：

```bash
cp .env.example .env
```

## 目录结构

| 路径 | 说明 |
|------|------|
| `apps/web` | 用户端 React + Vite |
| `apps/admin` | 管理端 React + Vite |
| `apps/api` | NestJS 后端 |
| `apps/worker` | Node 批处理 / 队列消费 |
| `packages/shared` | 跨包类型与常量 |
| `packages/config` | 共享配置 |
| `packages/database` | Prisma 与数据访问 |
| `packages/ai-prompts` | AI 提示词资产（占位） |
| `packages/scoring` | 匹配打分逻辑占位 |
| `packages/sdk` | 对外/对内 API SDK |
| `infrastructure/` | Nginx、Docker、脚本、监控相关物料 |
| `docs/` | 文档（按优先级 P0–P3、`common`） |

## 后续开发方向（概览）

1. **API**：在 `apps/api/src/modules` 中逐步增加 `auth`、`users`、`images`、`preview-pool` 等模块。
2. **Worker**：在 `apps/worker` 中接入队列与定时任务，承载每日批次匹配等作业。
3. **包**：业务类型入 `packages/shared`；库表与迁移入 `packages/database`；提示词与评分分别入 `ai-prompts`、`scoring`。
4. **运维**：镜像与编排放入 `infrastructure/docker`，网关配置放入 `infrastructure/nginx`。

## License

Private / TBD

## 最小 Docker 部署（P0）

该方案用于让 `web / api / worker / postgres` 通过 `docker-compose` 跑起来（非生产级高可用）。

### 1. 准备环境

```bash
cp .env.example .env
```

如果你本地没有 Postgres，请确保 `.env` 里 `POSTGRES_*` 与 `DOCKER_DATABASE_URL` 保持一致。

### 2. 启动 Postgres

```bash
docker compose up -d postgres
```

### 3. 初始化数据库（Prisma migrate）

```bash
docker compose run --rm api pnpm --filter @peima/database db:migrate -- --name docker_init
```

### 4. 启动其余服务

```bash
docker compose up -d --build api worker web
```

### 5. 验证是否正常运行

1. 检查日志：
   - `docker compose logs -f worker`
   - 你应看到：
     - `worker started`
     - `daily-match.scheduler cron registered: MATCH_CRON=...`
     - 后续 batch 运行时会看到 `batch started / batch completed / batch failed`
2. 验证 API：
   - `curl -i http://localhost:3000/matching/status/test`（只要能返回 404/错误并有响应，说明 API 正常运行）
   - 或直接创建用户（按实际校验传参）：
     ```bash
     curl -s -X POST http://localhost:3000/users \
       -H "Content-Type: application/json" \
       -d "{\"phone\":\"13900139000\",\"nickname\":\"DockerTest\"}"
     ```
3. 验证 Web：
   - 打开 `http://localhost:5173`
   - 访问 `/matching-waiting?userId=xxx` 或 `/final-match?userId=xxx`

