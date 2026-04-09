# P5 Phase 1：权限模型与建议中心 — 实施总结

> **状态**：**已实施**（Phase 1，完整）  
> **阶段**：P5 权限治理 + 建议中心启动  
> **日期**：2026-04-06

---

## 1. 本阶段目标与产出

### 1.1 核心目标
- ✅ 建立轻量 RBAC 权限模型，从 env 白名单向角色演进
- ✅ 构建建议中心聚合查询与管理 API
- ✅ 为后续历史表、Analytics 权限控制打基础

### 1.2 已交付产物

#### 权限模型（Shared 常量 + NestJS 中间件）
| 位置 | 内容 |
|------|------|
| `packages/shared/constants/p5-rbac.ts` | RBAC 定义：`UserRole`、`Permission`、权限矩阵、辅助函数 |
| `apps/api/src/common/rbac/rbac.guard.ts` | 两个守卫：`RbacGuard`（单权限）、`RbacAnyGuard`（多权限OR） |
| `apps/api/src/common/rbac/rbac.service.ts` | 权限检查服务：核心方法 + throw异常 |
| `apps/api/src/common/rbac/rbac.module.ts` | Nest 模块，导出守卫 + Service |

**权限体系**：
- **4 个系统角色**：`REGULAR_USER`、`OPERATOR`、`DATA_ANALYST`、`ADMIN`
- **16 个权限**：从查看自身、编辑自身 → 运营管理全部、数据导出、Analytics
- **向下兼容**：现有 env 白名单（`PEIMA_ADMIN_USER_IDS` 等）自动转换为角色

#### 建议中心模块（查询 + 管理 + 导出）
| 层级 | 文件 | 职责 |
|------|------|------|
| **DTO** | `dto/p5-suggestion-center-query.dto.ts` | 查询、批量操作、更新 DTO |
| **Repository** | `suggestion-center.repository.ts` | Prisma 查询、聚合、批量更新、导出 |
| **Service** | `suggestion-center.service.ts` | 权限检查、业务逻辑、CSV 转换 |
| **Controller** | `suggestion-center.controller.ts` | 5 个 API 端点 |
| **Module** | `suggestion-center.module.ts` | 依赖注入配置 |

**API 端点**（都在 `/suggestion-center`）：

| 方法 | 路径 | 权限要求 | 说明 |
|------|------|---------|------|
| `GET` | `/` | `VIEW_OWN_SUGGESTIONS` | 列表 + 分页 + 统计（权限检查自动限制视角） |
| `GET` | `/stats` | `VIEW_OWN_SUGGESTIONS` | 统计数据（优先级/分类/状态分布） |
| `POST` | `/bulk-operate` | `MANAGE_ALL_SUGGESTIONS` | 批量接受/忽略/分配 |
| `PATCH` | `/:suggestionId` | `MANAGE_ALL_SUGGESTIONS` | 更新单条（优先级、分类、备注、分配） |
| `POST` | `/export` | `EXPORT_SUGGESTIONS` | 导出为 CSV（含时间范围筛选） |

#### 数据模型扩展
| 变更 | 说明 |
|------|------|
| **迁移文件** | `20260406000000_p5_suggestion_center_init` |
| **Schema 更新** | `ProfileUpdateSuggestion` 新增 4 字段（见下） |

**新增字段**：
```typescript
// ProfileUpdateSuggestion
priority: string           // low | medium | high (default: medium)
category: string           // profile_refinement | behavioral_insight | communication_style | compatibility_tip
assignedToOperatorId?: string  // 可选，运营人员分配
operatorNotes?: string     // 可选，运营备注
```

**新增索引**：`status + priority`、`assignedToOperatorId`

#### 共享类型与常量
| 位置 | 内容 |
|------|------|
| `packages/shared/constants/p5-suggestion-center.ts` | 优先级/分类常量 + 权重 + 标签 |
| `packages/shared/types/p5-operations.ts` | 6 个 TS 接口（建议项、查询、统计、权限、审计） |

---

## 2. 权限模型详解

### 2.1 现状 → 目标路线图

```
现状（P0-P4）：
  PEIMA_ADMIN_USER_IDS=xxx,yyy
  → 硬编码检查，仅 Admin/非Admin 两态

↓ P5 Phase 1（本次）：

向后兼容的 RBAC：
  1. 仍读 env 变量
  2. 自动转换为 UserRole[]
  3. 通过权限矩阵灵活判断

实现：
  getRolesFromEnv(userId) {
    roles = [REGULAR_USER]
    if (ADMIN_IDS.includes(userId)) roles.push(ADMIN)
    if (OPERATOR_IDS.includes(userId)) roles.push(OPERATOR)
    if (ANALYST_IDS.includes(userId)) roles.push(DATA_ANALYST)
    return roles
  }

↓ 后续（P5 Phase 2+）：

从数据库读取：
  getRolesFromDb(userId)  // 数据库表 user_roles
```

### 2.2 权限矩阵（概览）

| 角色 | VIEWOwnSuggestions | ViewAllSuggestions | ManageAllSuggestions | ExportSuggestions | RunBatchMatch | ViewGlobalAnalytics |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| REGULAR_USER | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| OPERATOR | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| DATA_ANALYST | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 3. 使用指南

### 3.1 API 端点示例

#### 获取自己的建议
```bash
curl -X GET 'http://localhost:3000/suggestion-center?page=1&pageSize=10' \
  -H "Authorization: Bearer <USER_TOKEN>"
```

响应：
```json
{
  "items": [
    {
      "id": "cxxx",
      "userId": "user1",
      "status": "pending",
      "priority": "high",
      "category": "profile_refinement",
      "proposedPatch": { "age": 28 },
      "operatorNotes": null,
      "createdAt": "2026-04-06T..."
    }
  ],
  "total": 5,
  "page": 1,
  "pageSize": 10,
  "stats": {
    "totalCount": 5,
    "pendingCount": 3,
    "acceptedCount": 2,
    "dismissedCount": 0,
    "byPriority": { "high": 2, "medium": 3 },
    "byCategory": { "profile_refinement": 5 }
  }
}
```

#### 运营批量处理
```bash
curl -X POST 'http://localhost:3000/suggestion-center/bulk-operate' \
  -H "Authorization: Bearer <OPERATOR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "suggestionIds": ["id1", "id2"],
    "action": "accept"
  }'
```

#### 导出建议为 CSV
```bash
curl -X POST 'http://localhost:3000/suggestion-center/export' \
  -H "Authorization: Bearer <OPERATOR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "status": "pending" }' \
  --output suggestions.csv
```

### 3.2 权限检查（代码层）

在 NestJS 控制器中使用：

```typescript
import { RequirePermission } from 'src/common/rbac/rbac.guard';
import { Permission } from '@peima/shared';
import { RbacGuard } from 'src/common/rbac/rbac.guard';

@Controller('my-api')
@UseGuards(JwtAuthGuard, RbacGuard)
export class MyController {

  @Get('sensitive-data')
  @RequirePermission(Permission.VIEW_GLOBAL_ANALYTICS)
  getSensitiveData() {
    // 只有拥有 VIEW_GLOBAL_ANALYTICS 权限的用户能访问
  }
}
```

或在 Service 中：

```typescript
constructor(private rbacService: RbacService) {}

doSomethingAdmin(userId: string) {
  // 抛异常如果没权限
  this.rbacService.requirePermission(userId, Permission.MANAGE_USERS);
  // ... 执行操作
}
```

### 3.3 环境变量配置

```bash
# .env
PEIMA_ADMIN_USER_IDS=cmnnc6pxo00008ohjcuknps76
PEIMA_OPERATOR_USER_IDS=user_id_1,user_id_2
PEIMA_DATA_ANALYST_USER_IDS=analyst_id_1
```

---

## 4. 验收清单

- ✅ 权限模型代码完整（角色、权限、矩阵、函数）
- ✅ RBAC 守卫与 Service 可用于 API 保护
- ✅ 建议中心所有 5 个 API 端点实现完毕
- ✅ 数据库迁移文件已创建（方案确定，未执行）
- ✅ 共享常量与类型导出
- ✅ 模块挂接到 AppModule
- ✅ 权限检查逻辑涵盖所有敏感端点

### 待数据库迁移后验证
```bash
# 在 API 启动前
pnpm --filter @peima/database db:migrate

# 启动 API
pnpm dev:api

# 测试权限
curl -X GET 'http://localhost:3000/suggestion-center' \
  -H "Authorization: Bearer <FROM_REGULAR_USER>"
# 期望：见到自己的建议 + stats

curl -X GET 'http://localhost:3000/suggestion-center/bulk-operate' \
  -H "Authorization: Bearer <FROM_REGULAR_USER>" \
  -d '{"suggestionIds": [...], "action": "accept"}'
# 期望：403 Forbidden
```

---

## 5. 后续章节（Phase 2+）

> 本文档仅覆盖 **P5 Phase 1**。后续阶段见路线：

- **Phase 2**：摘要版本历史 API + 审计日志表
- **Phase 3**：Analytics 增强 + 缓存策略
- **Phase 2b（可选）**：Admin UI 建议中心页面
- **演进方向**：从 env 白名单 → 数据库角色管理（`user_roles` 表）

---

## 6. 关键决定与折衷

| 决定 | 理由 |
|------|------|
| **向下兼容 env** | 现有部署不中断，平滑演进 |
| **未采 CASL / Authz 库** | 轻量化，权限矩阵简洁，满足需求 |
| **建议中心单表查询** | Profile*Suggestion 已有索引，性能足够；分析表可 Phase 3 补 |
| **权限检查在 Service** | 既保护 API，又可在 Service 层复用（不仅前端） |
| **CSV 导出内存转换** | 数据量在合理范围；大规模可后续用流或队列 |

---

## 7. 文件清单（总计 11 个新文件）

```
Shared：
  packages/shared/constants/p5-rbac.ts
  packages/shared/constants/p5-suggestion-center.ts
  packages/shared/types/p5-operations.ts

API (RBAC):
  apps/api/src/common/rbac/rbac.guard.ts
  apps/api/src/common/rbac/rbac.service.ts
  apps/api/src/common/rbac/rbac.module.ts

API (建议中心):
  apps/api/src/modules/suggestion-center/dto/p5-suggestion-center-query.dto.ts
  apps/api/src/modules/suggestion-center/suggestion-center.repository.ts
  apps/api/src/modules/suggestion-center/suggestion-center.service.ts
  apps/api/src/modules/suggestion-center/suggestion-center.controller.ts
  apps/api/src/modules/suggestion-center/suggestion-center.module.ts

数据库：
  packages/database/prisma/migrations/20260406000000_p5_suggestion_center_init/migration.sql

修改的文件：
  packages/database/prisma/schema.prisma (ProfileUpdateSuggestion 扩展)
  packages/shared/constants/index.ts (re-export)
  packages/shared/types/index.ts (re-export)
  apps/api/src/app.module.ts (导入 RbacModule + SuggestionCenterModule)
```

---

## 8. 下一步行动

**立即**：
1. 执行数据库迁移：`pnpm --filter @peima/database db:migrate`
2. 重建 shared：`pnpm --filter @peima/shared build`
3. 启动 API：`pnpm dev:api`
4. 手动测试权限场景

**近期**：
5. 编写 Jest 单元测试（RBAC Service）
6. 集成测试（API 端点权限）
7. 可选：Phase 1b 补充建议中心的 Web/Admin UI

**中期**：
8. Phase 2：摘要历史 + 审计日志
9. Phase 3：Analytics 增强

