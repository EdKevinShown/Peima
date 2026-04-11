import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AuditService } from '../audit/audit.service';

/**
 * 审计中间件 - 自动捕获API请求
 * 记录：操作类型、实体信息、请求IP、User-Agent、响应状态等
 */
@Injectable()
export class AuditMiddleware implements NestMiddleware {
  private readonly logger = new Logger(AuditMiddleware.name);

  constructor(private auditService: AuditService) {}

  use(req: Request, res: Response, next: NextFunction) {
    // 跳过不需要审计的路由
    if (this.shouldSkipAudit(req.path)) {
      return next();
    }

    // 记录请求开始时间
    const startTime = Date.now();
    const originalSend = res.send;

    // 保存 middleware 引用
    const self = this;

    // 重写res.send以拦截响应
    res.send = function (data: any) {
      const duration = Date.now() - startTime;
      const statusCode = res.statusCode;

      // 触发审计记录（异步，不阻塞响应）
      self.recordAudit(req, statusCode, data, duration).catch((err: Error) => {
        self.logger.error(`Failed to record audit: ${err.message}`);
      });

      // 调用原始send方法（保持 res 为 this）
      return originalSend.call(res, data);
    };

    next();
  }

  private async recordAudit(
    req: Request,
    statusCode: number,
    responseData: any,
    duration: number
  ) {
    try {
      // 从请求路径和方法推断操作类型
      const { action, entityType, entityId } = this.parseRequest(req);

      // 只记录有意义的操作
      if (!action) {
        return;
      }

      // 获取用户信息（middleware 在 guard 之前运行，但 res.send 重写后
      // 实际执行时 guard 已完成，req.user 已注入）
      const userId = (req as any).user?.userId;
      if (!userId) {
        // 未认证请求（JWT 无效或缺失），跳过审计避免 FK 违反
        return;
      }
      const ipAddress = this.getClientIp(req);
      const userAgent = req.get('user-agent');

      // 记录内容取决于操作类型
      let oldValues: Record<string, any> | undefined = undefined;
      let newValues: Record<string, any> | undefined = undefined;

      if (['UPDATE', 'DELETE'].includes(action) && req.body) {
        newValues = req.body;
      }

      if (req.method === 'GET' && responseData && typeof responseData === 'string') {
        try {
          newValues = JSON.parse(responseData);
        } catch {
          // 如果不是JSON，忽略
        }
      }

      // 调用审计服务
      await this.auditService.recordAction(userId, action!, entityType!, {
        entityId,
        oldValues,
        newValues,
        ipAddress,
        userAgent,
        status: statusCode >= 200 && statusCode < 300 ? 'SUCCESS' : 'FAILED',
        duration,
      });
    } catch (error) {
      this.logger.error(
        `Audit recording error: ${(error as Error).message}`,
        (error as Error).stack
      );
    }
  }

  /**
   * 从请求解析操作类型、实体类型和实体ID
   * entityIdExtractor: (segments: string[]) => string | undefined
   * segments 是 path.split('/').filter(Boolean)，即不含空串
   */
  private parseRequest(req: Request) {
    const method = req.method;
    const path = req.path;
    const seg = path.split('/').filter(Boolean);

    // [pattern, httpMethod, action, entityType, entityIdExtractor]
    const patterns: Array<{
      pattern: RegExp;
      method: string;
      action: string;
      entityType: string;
      entityId: (s: string[]) => string | undefined;
    }> = [
      // ── Suggestion Center ──────────────────────────────────────────────
      // PATCH /suggestion-center/:id  (UUID 含 -, 须用 [^/]+)
      {
        pattern: /^\/suggestion-center\/[^/]+$/,
        method: 'PATCH',
        action: 'SUGGESTION_UPDATE',
        entityType: 'SUGGESTION',
        entityId: (s) => s[1],  // suggestion-center / <id>
      },
      // POST /suggestion-center/bulk-operate
      {
        pattern: /^\/suggestion-center\/bulk-operate$/,
        method: 'POST',
        action: 'SUGGESTION_BULK_OPERATE',
        entityType: 'SUGGESTION',
        entityId: () => undefined,
      },
      // POST /suggestion-center/export
      {
        pattern: /^\/suggestion-center\/export$/,
        method: 'POST',
        action: 'SUGGESTION_EXPORT',
        entityType: 'SUGGESTION',
        entityId: () => undefined,
      },
      // GET /suggestion-center/:id/history
      {
        pattern: /^\/suggestion-center\/[^/]+\/history$/,
        method: 'GET',
        action: 'SUGGESTION_HISTORY_READ',
        entityType: 'SUGGESTION',
        entityId: (s) => s[1],
      },

      // ── RBAC ───────────────────────────────────────────────────────────
      // POST /rbac/users/:userId/role
      {
        pattern: /^\/rbac\/users\/[^/]+\/role$/,
        method: 'POST',
        action: 'ROLE_ASSIGN',
        entityType: 'ROLE',
        entityId: (s) => s[2],  // rbac / users / <userId>
      },
      // PATCH /rbac/users/:userId/roles
      {
        pattern: /^\/rbac\/users\/[^/]+\/roles$/,
        method: 'PATCH',
        action: 'ROLE_UPDATE',
        entityType: 'ROLE',
        entityId: (s) => s[2],
      },
      // DELETE /rbac/users/:userId/role/:roleCode
      {
        pattern: /^\/rbac\/users\/[^/]+\/role\/[^/]+$/,
        method: 'DELETE',
        action: 'ROLE_REVOKE',
        entityType: 'ROLE',
        entityId: (s) => s[2],  // userId, not roleCode
      },
    ];

    for (const rule of patterns) {
      if (rule.pattern.test(path) && rule.method === method) {
        return {
          action: rule.action,
          entityType: rule.entityType,
          entityId: rule.entityId(seg),
        };
      }
    }

    return { action: null as string | null, entityType: null as string | null, entityId: undefined as string | undefined };
  }

  /**
   * 获取客户端IP地址
   */
  private getClientIp(req: Request): string {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      (req.headers['x-real-ip'] as string) ||
      req.socket.remoteAddress ||
      'UNKNOWN'
    );
  }

  /**
   * 判断是否应该跳过审计
   */
  private shouldSkipAudit(path: string): boolean {
    const skipPaths = [
      '/health',
      '/ping',
      '/metrics',
      '/favicon.ico',
      '/api/health',
    ];

    return skipPaths.some((p) => path.startsWith(p));
  }
}
