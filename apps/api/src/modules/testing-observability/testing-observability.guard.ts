import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { isProductionNodeEnv } from "../../common/config/jwt-secret.config";
import { parseAdminUserIds } from "../admin/admin.service";
import {
  assertTestingObservabilityStartupConfig,
  isTestingObservabilityEnabled,
  readTestingObservabilityToken,
  type TestingObservabilityAuthContext,
} from "./testing-observability-env";

type JwtPayload = { sub?: string };

export type TestingObservabilityRequest = {
  headers: Record<string, string | string[] | undefined>;
  user?: { userId?: string };
  testingObservabilityAuth?: TestingObservabilityAuthContext;
};

function readBearerToken(
  authorization: string | string[] | undefined,
): string | null {
  const raw = Array.isArray(authorization) ? authorization[0] : authorization;
  if (!raw?.trim()) return null;
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return m?.[1]?.trim() || null;
}

function readDebugTokenHeader(
  headers: Record<string, string | string[] | undefined>,
): string | null {
  const raw = headers["x-peima-debug-token"];
  const header = Array.isArray(raw) ? raw[0] : raw;
  return header?.trim() || null;
}

@Injectable()
export class TestingObservabilityGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    if (!isTestingObservabilityEnabled()) {
      throw new NotFoundException();
    }

    assertTestingObservabilityStartupConfig();

    const req = context.switchToHttp().getRequest<TestingObservabilityRequest>();
    const expectedDebug = readTestingObservabilityToken();
    const debugHeader = readDebugTokenHeader(req.headers);
    const adminUserId = this.tryResolveAdminUserId(req);

    if (isProductionNodeEnv()) {
      if (!expectedDebug || debugHeader !== expectedDebug) {
        throw new UnauthorizedException(
          "invalid or missing x-peima-debug-token (required in production)",
        );
      }
      if (!adminUserId) {
        throw new UnauthorizedException(
          "admin JWT required in production (PEIMA_ADMIN_USER_IDS)",
        );
      }
      this.attachAuth(req, { callerUserId: adminUserId, via: "admin_jwt" });
      return true;
    }

    if (expectedDebug && debugHeader === expectedDebug) {
      this.attachAuth(req, {
        callerUserId: adminUserId,
        via: adminUserId ? "admin_jwt" : "debug_token",
      });
      return true;
    }

    if (adminUserId) {
      this.attachAuth(req, { callerUserId: adminUserId, via: "admin_jwt" });
      return true;
    }

    const bearer = readBearerToken(req.headers.authorization);
    if (bearer) {
      throw new ForbiddenException(
        "admin only: add your user id to PEIMA_ADMIN_USER_IDS",
      );
    }

    if (expectedDebug) {
      throw new UnauthorizedException(
        "invalid or missing x-peima-debug-token (or sign in as PEIMA_ADMIN_USER_IDS)",
      );
    }
    throw new UnauthorizedException(
      "sign in as an admin user (PEIMA_ADMIN_USER_IDS) or set x-peima-debug-token when PEIMA_TEST_OBSERVABILITY_TOKEN is configured",
    );
  }

  private attachAuth(
    req: TestingObservabilityRequest,
    auth: TestingObservabilityAuthContext,
  ): void {
    req.testingObservabilityAuth = auth;
    if (auth.callerUserId) {
      req.user = { userId: auth.callerUserId };
    }
  }

  private tryResolveAdminUserId(req: TestingObservabilityRequest): string | null {
    const admins = parseAdminUserIds();
    if (admins.size === 0) {
      return null;
    }
    const bearer = readBearerToken(req.headers.authorization);
    if (!bearer) {
      return null;
    }
    try {
      const payload = this.jwt.verify<JwtPayload>(bearer);
      const userId = payload?.sub?.trim();
      return userId && admins.has(userId) ? userId : null;
    } catch {
      return null;
    }
  }
}
