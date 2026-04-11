-- P5: profile suggestion ops columns, suggestion history, audit logs, RBAC, notifications.
-- Apply with: pnpm --filter @peima/database exec prisma migrate deploy

-- Extend profile_update_suggestions (idempotent for dev DBs that may partially match)
ALTER TABLE "profile_update_suggestions" ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE "profile_update_suggestions" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'profile_refinement';
ALTER TABLE "profile_update_suggestions" ADD COLUMN IF NOT EXISTS "assignedToOperatorId" TEXT;
ALTER TABLE "profile_update_suggestions" ADD COLUMN IF NOT EXISTS "operatorNotes" TEXT;
ALTER TABLE "profile_update_suggestions" ADD COLUMN IF NOT EXISTS "versionNumber" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS "profile_update_suggestions_status_priority_idx" ON "profile_update_suggestions"("status", "priority");
CREATE INDEX IF NOT EXISTS "profile_update_suggestions_assignedToOperatorId_idx" ON "profile_update_suggestions"("assignedToOperatorId");
CREATE INDEX IF NOT EXISTS "profile_update_suggestions_versionNumber_idx" ON "profile_update_suggestions"("versionNumber");

-- SuggestionHistory
CREATE TABLE IF NOT EXISTS "suggestion_history" (
    "id" TEXT NOT NULL,
    "suggestionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "previousVersion" INTEGER,
    "changes" JSONB NOT NULL,
    "changedFields" TEXT[] NOT NULL,
    "changedByUserId" TEXT NOT NULL,
    "changeReason" TEXT,
    "changeType" TEXT NOT NULL DEFAULT 'UPDATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suggestion_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "suggestion_history_suggestionId_idx" ON "suggestion_history"("suggestionId");
CREATE INDEX IF NOT EXISTS "suggestion_history_changedByUserId_idx" ON "suggestion_history"("changedByUserId");
CREATE INDEX IF NOT EXISTS "suggestion_history_createdAt_idx" ON "suggestion_history"("createdAt");
CREATE INDEX IF NOT EXISTS "suggestion_history_suggestionId_createdAt_idx" ON "suggestion_history"("suggestionId", "createdAt" DESC);

ALTER TABLE "suggestion_history" DROP CONSTRAINT IF EXISTS "suggestion_history_suggestionId_fkey";
ALTER TABLE "suggestion_history" ADD CONSTRAINT "suggestion_history_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "profile_update_suggestions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "suggestion_history" DROP CONSTRAINT IF EXISTS "suggestion_history_changedByUserId_fkey";
ALTER TABLE "suggestion_history" ADD CONSTRAINT "suggestion_history_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AuditLog
CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "oldValues" JSONB,
    "newValues" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "changeReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "errorMessage" TEXT,
    "duration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "audit_logs_status_idx" ON "audit_logs"("status");

ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_userId_fkey";
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- UserRole (P5 RBAC assignments)
CREATE TABLE IF NOT EXISTS "user_roles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleCode" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_roles_userId_roleCode_key" ON "user_roles"("userId", "roleCode");
CREATE INDEX IF NOT EXISTS "user_roles_userId_idx" ON "user_roles"("userId");
CREATE INDEX IF NOT EXISTS "user_roles_roleCode_idx" ON "user_roles"("roleCode");
CREATE INDEX IF NOT EXISTS "user_roles_expiresAt_idx" ON "user_roles"("expiresAt");

ALTER TABLE "user_roles" DROP CONSTRAINT IF EXISTS "user_roles_userId_fkey";
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_roles" DROP CONSTRAINT IF EXISTS "user_roles_grantedBy_fkey";
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_grantedBy_fkey" FOREIGN KEY ("grantedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RolePermission (P5 RBAC matrix)
CREATE TABLE IF NOT EXISTS "role_permissions" (
    "id" TEXT NOT NULL,
    "roleCode" TEXT NOT NULL,
    "permissionCode" TEXT NOT NULL,
    "resource" TEXT,
    "conditions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "role_permissions_roleCode_permissionCode_key" ON "role_permissions"("roleCode", "permissionCode");
CREATE INDEX IF NOT EXISTS "role_permissions_roleCode_idx" ON "role_permissions"("roleCode");
CREATE INDEX IF NOT EXISTS "role_permissions_permissionCode_idx" ON "role_permissions"("permissionCode");

-- Notification
CREATE TABLE IF NOT EXISTS "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "actionUrl" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "notifications_userId_read_createdAt_idx" ON "notifications"("userId", "read", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt" DESC);

ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_userId_fkey";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
