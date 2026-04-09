# P5 Phase 2: Complete Implementation Plan

## 📊 Overview
**选择版本**: Option A (完整版)  
**预期周期**: 4-6 周  
**目标**: 企业级审计、权限管理、实时通知和数据分析

---

## 🎯 Feature Breakdown & Implementation Order

### Phase 2.1: 审计日志系统 (Audit Logging) - Week 1-2
**优先级**: 🔴 P0 (Critical)

#### Database Schema
- **AuditLog Table**
  - id (UUID primary key)
  - userId (FK to User)
  - action (enum: CREATE/READ/UPDATE/DELETE/EXPORT/BULK_OPERATE)
  - entityType (enum: SUGGESTION/USER/ROLE/PERMISSION)
  - entityId (UUID/String)
  - oldValues (JSONB) - 变更前的值
  - newValues (JSONB) - 变更后的值
  - ipAddress (String)
  - userAgent (String)
  - changeReason (String) - 用户填写的原因
  - status (enum: SUCCESS/FAILED)
  - errorMessage (String, nullable)
  - createdAt (DateTime index)
  - Indexes: (userId, createdAt DESC), (entityType, entityId), (action, createdAt DESC)

#### Backend Components
1. **Audit Middleware** (`apps/api/src/common/middleware/audit.middleware.ts`)
   - 自动捕获所有API请求的元数据
   - 记录body/query/params
   - 追踪响应状态和执行时间

2. **Audit Service** (`apps/api/src/common/audit/audit.service.ts`)
   - recordAction()(userId, action, entity, oldValues, newValues, reason)
   - queryLogs(filters: {userId?, entityType?, dateRange?, action?})
   - getLogs(pagination)
   - exportLogs(format: 'csv'|'json'|'excel')
   - generateReport(startDate, endDate)

3. **Audit Controller** (`apps/api/src/common/audit/audit.controller.ts`)
   - GET /audit-logs (list with filters)
   - GET /audit-logs/:id (detail)
   - GET /audit-logs/entity/:entityType/:entityId (object history)
   - POST /audit-logs/export (batch export)
   - GET /audit-logs/report (summary stats)

#### Frontend Components
1. **AuditLogPage.jsx** (300 lines)
   - Advanced filter panel (user, action, entity type, date range)
   - Sortable table with pagination
   - Diff viewer for old/new values (side-by-side)
   - Export button (CSV/JSON/Excel)

2. **AuditLogDetailModal.jsx** (200 lines)
   - Full audit entry details
   - JSON diff viewer with syntax highlighting
   - User info + IP + User Agent
   - Change reason display

3. **EntityHistory.jsx** (150 lines)
   - Show all changes for specific entity
   - Timeline view of modifications
   - Revert suggestion modal integration

---

### Phase 2.2: 权限数据库化 (RBAC Persistence) - Week 2-3
**优先级**: 🟠 P1 (High)

#### Database Schema
- **UserRole Table** (New)
  - id (UUID primary key)
  - userId (FK to User, indexed)
  - roleCode (enum: ADMIN/OPERATOR/DATA_ANALYST/REGULAR_USER)
  - grantedAt (DateTime)
  - grantedBy (FK to User granting the role)
  - expiresAt (DateTime nullable) - 可选的角色过期时间
  - createdAt (DateTime)
  - Indexes: (userId), (userId, roleCode unique)

- **RolePermission Table** (New)
  - id (UUID primary key)
  - roleCode (enum)
  - permissionCode (String)
  - resource (String)
  - conditions (JSONB nullable) - 条件权限，如时间、IP限制
  - createdAt (DateTime)
  - Indexes: (roleCode), (roleCode, permissionCode unique)

#### Backend Updates
1. **RbacService Refactor**
   - Remove in-memory map dependency
   - Load roles from database on startup
   - Cache with Redis TTL 1hour
   - getUserRoles(userId) - changed to DB query
   - updateUserRole(userId, roles) - includes audit logging
   - grantRoleExpiry(userId, role, expiresAt)
   - checkRoleExpiration() - scheduled job

2. **New Endpoints**
   - PATCH /rbac/users/:userId/roles
   - DELETE /rbac/users/:userId/roles/:roleCode
   - POST /rbac/roles/:roleCode/expire
   - GET /rbac/role-assignments (view all)

#### Frontend Enhancements
1. **RbacPermissionManager.jsx** (Refactor)
   - Edit form for role assignment
   - Role expiry datetime picker
   - Audit trail integration (show who granted role when)
   - Bulk role operations

---

### Phase 2.3: WebSocket 实时通知 (Real-time Notifications) - Week 3-4
**优先级**: 🟠 P1 (High)

#### Technologies
- Socket.io + Redis Adapter (多进程扩展)
- Redis pub/sub for cross-instance messaging

#### Database Schema
- **Notification Table**
  - id, userId, type, title, message, actionUrl, read, createdAt
  - Index: (userId, read, createdAt DESC)

#### Backend Components
1. **NotificationGateway**
   - @WebSocketGateway(3001)
   - handleConnection / handleDisconnect
   - emitToUser(userId, event, data)
   - broadcastToRole(roleCode, event, data)

2. **Events to Broadcast**
   - suggestion.updated (suggestion center changes)
   - role.assigned (user got new role)
   - permission.changed (permission list updated)
   - audit.critical (critical actions logged)
   - export.completed (background export done)

3. **NotificationService**
   - createNotification(userId, type, title, message, actionUrl)
   - markAsRead(notificationId)
   - getUserNotifications(userId, unreadOnly)
   - cleanupOldNotifications() - scheduled job

#### Frontend Components
1. **NotificationCenter.jsx**
   - Bell icon with unread count
   - Dropdown notification list
   - Real-time updates via Socket.io
   - Clear/dismiss actions

2. **WebSocket Integration (apps/admin/src/hooks/useNotifications.js)**
   - Auto-connect to Socket.io server
   - Listen for real-time events
   - Toast notifications for important events
   - Refetch data on relevant events

---

### Phase 2.4: 分析仪表板 (Analytics Dashboard) - Week 4-6
**优先级**: 🟡 P2 (Medium)

#### Database Schema
- **SystemMetrics Table**
  - id, metric (enum), value (Float), unit, timestamp, index
  - Indexes: (metric, timestamp DESC)

#### Backend Components
1. **AnalyticsService**
   - getSystemMetrics(dateRange) - Suggestion metrics
   - getUserActivityMetrics() - User engagement
   - getRoleDistribution() - Role statistics
   - getPermissionUsage() - Which permissions used most
   - getMostActiveUsers()
   - getAuditTrends()

2. **AnalyticsController**
   - GET /analytics/dashboard
   - GET /analytics/suggestions
   - GET /analytics/users
   - GET /analytics/roles
   - GET /analytics/audit
   - POST /analytics/export-report

#### Frontend Components
1. **AnalyticsDashboard.jsx** (Main page, ~400 lines)
   - Date range picker (Today/Week/Month/Year)
   - Overview KPI cards (Total suggestions, active users, operations, etc)
   - Charts: Suggestion flow (ECharts)

2. **SuggestionMetrics.jsx** (~250 lines, ECharts)
   - Line chart: Suggestions over time
   - Bar chart: By priority/category
   - Funnel: Created → Reviewed → Accepted

3. **UserActivityMetrics.jsx** (~200 lines, ECharts)
   - User engagement heatmap
   - Top active users table
   - Role distribution pie chart

4. **AuditInsights.jsx** (~200 lines, ECharts)
   - Action frequency chart
   - User activity heatmap
   - Error rate trends
   - Critical actions timeline

---

## 📈 Implementation Timeline

| Week | Sprint | Focus | Components | Files |
|------|--------|-------|------------|-------|
| 1-2  | 2.1    | Audit System | Middleware, Service, Controller, Views | 6-8 |
| 2-3  | 2.2    | RBAC DB | Schema, Service Refactor, APIs, UI | 4-5 |
| 3-4  | 2.3    | WebSocket | Gateway, Notifications, Real-time | 4-6 |
| 4-6  | 2.4    | Analytics | Services, Controllers, Dashboards | 5-7 |

**Total Deliverables**: ~25-30 new files, ~2,500-3,000 lines of code

---

## 🔧 Database Migration Plan

```sql
-- Migration 1: Audit System
CREATE TABLE "AuditLog" (...)
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt" DESC)
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId")

-- Migration 2: RBAC Persistence
CREATE TABLE "UserRole" (...)
CREATE TABLE "RolePermission" (...)
CREATE UNIQUE INDEX "UserRole_userId_roleCode_unique" ON "UserRole"("userId", "roleCode")
CREATE UNIQUE INDEX "RolePermission_roleCode_permissionCode_unique" ON "RolePermission"("roleCode", "permissionCode")

-- Migration 3: Notifications
CREATE TABLE "Notification" (...)
CREATE INDEX "Notification_userId_read_createdAt_idx" ON "Notification"("userId", "read", "createdAt" DESC)

-- Migration 4: System Metrics
CREATE TABLE "SystemMetrics" (...)
CREATE INDEX "SystemMetrics_metric_timestamp_idx" ON "SystemMetrics"("metric", "timestamp" DESC)
```

---

## 🎯 Quality Standards

- **Code Coverage**: Aim for 80%+ unit test coverage for services
- **Performance**: All query responses < 500ms on test data
- **Security**: All endpoints require authentication + permission checks
- **Accessibility**: All frontend components WCAG 2.1 AA compliant
- **Documentation**: Inline comments for complex logic, JSDoc for APIs

---

## 📋 Verification Checklist

### Audit System (Phase 2.1)
- [ ] AuditLog table created in database migration
- [ ] Audit middleware captures all API requests
- [ ] Audit service records actions correctly
- [ ] Audit logs viewable and filterable in API
- [ ] Frontend audit page displays logs with formatting
- [ ] Diff viewer shows old/new values
- [ ] Export functionality works (CSV/JSON)
- [ ] Pagination and sorting work correctly
- [ ] Date range filtering functional
- [ ] Entity history view shows complete change timeline

### RBAC Persistence (Phase 2.2)
- [ ] UserRole table created and migrations applied
- [ ] Existing in-memory roles migrated to database
- [ ] RolePermission table structure validated
- [ ] Service methods refactored to query database
- [ ] Redis caching layer implemented
- [ ] Role expiry system functional
- [ ] API endpoints tested with real data
- [ ] Frontend permission manager updated
- [ ] Audit logs record all role changes
- [ ] Permission checks still work properly

### WebSocket (Phase 2.3)
- [ ] Socket.io server initialized and listening
- [ ] Redis adapter configured for multi-instance
- [ ] Notification table created
- [ ] Gateway handles connections/disconnections
- [ ] Events broadcast successfully
- [ ] Frontend receives notifications in real-time
- [ ] Toast notifications working
- [ ] Unread notification count displays
- [ ] Notification center dropdown functional
- [ ] Auto-refetch on relevant events

### Analytics (Phase 2.4)
- [ ] System metrics collection scheduled
- [ ] Analytics backend services functional
- [ ] Dashboard data loads correctly
- [ ] Charts render with correct data
- [ ] Date range filters work
- [ ] Export report functionality
- [ ] Performance acceptable (< 1s load time)
- [ ] Mobile responsive
- [ ] Color scheme consistent
- [ ] Legend and tooltips display properly

---

## 🚀 Deployment Readiness

**Docker**: Ensure all new services containerized properly
**Environment Variables**: Add REDIS_URL, SOCKET_IO_PORT, ANALYTICS_ENABLED
**Database**: Migrations tested on staging database
**Documentation**: Update API docs with new endpoints
**Testing**: Run full integration tests before merge
