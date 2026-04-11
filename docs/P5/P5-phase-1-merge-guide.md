# P5 Phase 1：合并与部署指南

> Status: Historical / Archived
> **针对**：Team 同学在合并 P5 Phase 1 代码时的完整清单与命令参考  
> **难度**：低（顺序执行即可）  
> **预计时间**：10-15 分钟

---

## 前置检查

```bash
# 确保在项目根目录
cd /path/to/peima

# 拉取最新代码（如从远端）
git pull origin main

# 确保依赖最新
pnpm install

# 查看变更文件列表（总计 14 个 new + 4 个 modified）
git status
```

---

## A. 本地验证（开发环境）

### A1. 构建 Shared 包
```bash
# RBAC 和建议中心的常量/类型在 shared 中，需先构建
pnpm --filter @peima/shared build

# 验证输出
ls packages/shared/dist/constants/p5-rbac.js
ls packages/shared/dist/types/p5-operations.d.ts
```

### A2. 数据库迁移（关键步骤）
```bash
# Option A：本地开发 + 原有 PostgreSQL
pnpm --filter @peima/database db:migrate

# Option B：Docker 环境
docker compose down  # 停止旧容器
docker compose up -d postgres  # 重启 PostgreSQL
docker compose run --rm api pnpm --filter @peima/database db:migrate -- --name p5-phase-1

# 验证迁移成功（应看到新字段）
echo "SELECT column_name, data_type FROM information_schema.columns 
       WHERE table_name='profile_update_suggestions' 
       ORDER BY ordinal_position;" | \
  psql -U peima_user -d peima -h localhost
```

预期输出包含：`priority TEXT`、`category TEXT`、`assignedToOperatorId TEXT`、`operatorNotes TEXT`

### A3. 编译 API
```bash
pnpm --filter @peima/api build

# 看到 success 才继续
# 若有类型错误，检查 import 语句
```

### A4. 启动并测试

#### 方式 1：本地 dev 环境
```bash
# 终端 1：API 服务
pnpm dev:api

# 终端 2（API 启动后）：测试权限检查
# 注册一个新用户并获取 token
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"phone": "13800000001", "nickname": "TestUser"}'

# 响应包含 token，复制下来
TOKEN="eyJhbGc..."

# 尝试访问建议中心（应成功）
curl -X GET http://localhost:3000/suggestion-center \
  -H "Authorization: Bearer $TOKEN"
# 期望：200 + { items: [], total: 0, stats: {...} }

# 尝试批量操作（应 403 Forbidden）
curl -X POST http://localhost:3000/suggestion-center/bulk-operate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"suggestionIds": [], "action": "accept"}'
# 期望：403 { "message": "Permission denied..." }
```

#### 方式 2：Docker 环境
```bash
# 重建并启动
docker compose up -d --build api

# 等待 API 启动
sleep 5

# 测试同上，但 API 地址可能不同
curl -X GET http://localhost:3000/suggestion-center -H "Authorization: Bearer $TOKEN"
```

### A5. 检查 RBAC 日志（可选）

在代码中查看权限检查是否工作：
- 查看 `logs/` 或控制台输出
- 若用到 `RbacGuard`，应看到权限拒绝消息

---

## B. 代码审查重点

> PRreview 时确认以下要点

- [ ] **权限矩阵**：确认 4 个角色、16 个权限的分配合理（见 `p5-rbac.ts`）
- [ ] **建议中心 API**：5 个端点的签名与权限需求一致（见 Controller）
- [ ] **Repository 查询**：Prisma 条件过滤无 SQL 注入风险（使用 where 子句）
- [ ] **CSV 导出**：字符转义处理（双引号）无遗漏
- [ ] **向下兼容**：env 白名单仍有效（`getRolesFromEnv` 实现）
- [ ] **测试覆盖**：至少有基础的单元测试（可在 merge 后补充）

---

## C. 环境变量更新（可选但推荐）

在 `.env` 中补充新的角色定义（如之前没有）：

```bash
# .env

# 原有（保持不变）
PEIMA_ADMIN_USER_IDS=cmnnc6pxo00008ohjcuknps76

# P5 新增（可选，未设置时为空）
PEIMA_OPERATOR_USER_IDS=
PEIMA_DATA_ANALYST_USER_IDS=
```

若要快速测试，可添加：
```bash
PEIMA_OPERATOR_USER_IDS=test_operator_user_id
PEIMA_DATA_ANALYST_USER_IDS=test_analyst_user_id
```

---

## D. 关键变更摘要

### Schema 变更（必须迁移）
```sql
-- ProfileUpdateSuggestion 表
ALTER TABLE profile_update_suggestions
  ADD COLUMN priority TEXT DEFAULT 'medium',
  ADD COLUMN category TEXT DEFAULT 'profile_refinement',
  ADD COLUMN assignedToOperatorId TEXT,
  ADD COLUMN operatorNotes TEXT;

CREATE INDEX idx_profile_suggestions_status_priority 
  ON profile_update_suggestions(status, priority);
CREATE INDEX idx_profile_suggestions_assignedTo 
  ON profile_update_suggestions(assignedToOperatorId);
```

### 新模块导入
- `apps/api/src/app.module.ts`：导入 `RbacModule` + `SuggestionCenterModule`

### 新常量与泛型
- `packages/shared/constants/p5-rbac.ts`：权限体系
- `packages/shared/constants/p5-suggestion-center.ts`：优先级与分类
- `packages/shared/types/p5-operations.ts`：TS 类型接口

---

## E. 常见问题排查

### Q1：迁移报错 `Table already exists`
```bash
# 可能是之前部分执行，查认当前状态
psql -U peima_user -d peima -c "SELECT * FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 1;"

# 若要重置（仅开发环境）
pnpm --filter @peima/database db:push  # 无条件应用当前 schema
# 或手动删除旧的迁移文件，重新运行
```

### Q2：API 启动报错 `Cannot find module '@peima/shared'`
```bash
# shared 未构建，重新构建
pnpm install
pnpm --filter @peima/shared build
pnpm dev:api
```

### Q3：权限检查不生效（所有人都能访问敏感接口）
```bash
# 检查 RbacGuard 是否正确使用
# 错误：@UseGuards(JwtAuthGuard) 而未加 RbacGuard 或 @RequirePermission
# 正确：
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission(Permission.MANAGE_ALL_SUGGESTIONS)
```

### Q4：导出 CSV 为空或格式错乱
```bash
# 检查字符编码（应为 UTF-8）
# 检查特殊字符是否转义（双引号 → 四引号）
# 查看 convertToCSV 逻辑
```

---

## F. 部署顺序（生产环境）

> 若直接上生产，遵循此顺序以避免不一致

```bash
# 1. 代码部署（所有文件已准备）
git pull origin main
pnpm install
pnpm --filter @peima/shared build
pnpm --filter @peima/api build
pnpm --filter @peima/worker build  # 若 worker 依赖 shared

# 2. 数据库迁移（在 API 启动前）
# 以仓库当前 scripts 为准（@peima/database 仅提供 db:migrate / db:push / db:generate）
pnpm --filter @peima/database db:migrate

# 3. API 启动（热启）
# 若使用 PM2/Docker/K8s，按各自流程
docker compose kill api
docker compose up -d --build api

# 4. 烟雾测试（关键）
curl -X GET http://<API_HOST>:3000/auth/me \
  -H "Authorization: Bearer <TEST_TOKEN>"
# 期望：200 + user info

curl -X GET http://<API_HOST>:3000/suggestion-center \
  -H "Authorization: Bearer <TEST_TOKEN>"
# 期望：200 + suggestions list
```

---

## G. 回滚计划（若出现问题）

```bash
# 若 API 无法启动
# 1. 检查日志
docker compose logs api

# 2. 回滚代码（快速）
git revert <commit-hash>
git pull
pnpm install && pnpm build:api
docker compose up -d --build api

# 3. 若需回滚数据库迁移（需谨慎）
# Prisma 未内置回滚，但可用 SQL （生产建议先备份）
psql -U peima_user -d peima -c "
  ALTER TABLE profile_update_suggestions 
    DROP COLUMN priority, 
    DROP COLUMN category,
    DROP COLUMN assignedToOperatorId,
    DROP COLUMN operatorNotes;
  DELETE FROM _prisma_migrations 
    WHERE migration_name LIKE '%p5_suggestion_center%';
"
```

---

## H. 文档更新（可选）

在团队文档中补充：

```markdown
### P5 Phase 1：权限模型与建议中心（已实施）

**权限体系**：见 `docs/P5/P5-phase-1-implementation.md`

**新 API 端点**（均在 `/suggestion-center`）：
- `GET /` - 列表 + 统计（权限自动过滤）
- `POST /bulk-operate` - 批量操作（仅运营/Admin）
- `PATCH /:id` - 更新单条
- `POST /export` - 导出 CSV

**示例**：见 P5-phase-1-implementation.md 的 "3. 使用指南" 章节

**权限配置**：在 `.env` 中设置 `PEIMA_OPERATOR_USER_IDS` 与 `PEIMA_DATA_ANALYST_USER_IDS`
```

---

## I. 最终检查清单（merge 前）

```
[ ] 代码审查通过（所有 14 个新文件 + 4 个修改文件）
[ ] 本地测试通过（A1-A5 流程完成）
[ ] 数据库迁移可运行（已验证 SQL）
[ ] 权限检查有效（403 在正确位置）
[ ] 文档已更新（README / docs/P5）
[ ] 无遗留的 TODO / console.log
[ ] 提交消息清晰：「feat(p5): RBAC phase 1 - permission model & suggestion center」
[ ] 关联 Issue（如有）
```

---

## J. 合并后的第一周计划

- **Day 1-2**：监控日志，处理反馈
- **Day 3-4**：补充 Jest 单元测试
- **Day 5**：评估是否补充 Admin UI（phase 1b）或直接推进 Phase 2

---

## K. 联系与支持

若遇问题：
1. 查看本文档的「E. 常见问题排查」
2. 检查日志：`docker compose logs api`
3. 回溯 commit：查看最近的代码变更
4. 联系团队（@架构 @后端）

---

**Ready? Let's merge! 🚀**

