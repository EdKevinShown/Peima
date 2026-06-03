import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { parseAdminUserIds } from "../admin/admin.service";
import {
  isTestingObservabilityEnabled,
  readTestingObservabilityToken,
} from "./testing-observability-env";

type JwtPayload = { sub?: string };

function readBearerToken(
  authorization: string | string[] | undefined,
): string | null {
  const raw = Array.isArray(authorization) ? authorization[0] : authorization;
  if (!raw?.trim()) return null;
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return m?.[1]?.trim() || null;
}

@Injectable()
export class TestingObservabilityGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    if (!isTestingObservabilityEnabled()) {
      throw new NotFoundException();
    }

    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();

    const expectedDebug = readTestingObservabilityToken();
    if (expectedDebug) {
      const raw = req.headers["x-peima-debug-token"];
      const header = Array.isArray(raw) ? raw[0] : raw;
      if (header === expectedDebug) {
        return true;
      }
    }

    if (this.isAdminJwt(req)) {
      return true;
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

  private isAdminJwt(req: {
    headers: Record<string, string | string[] | undefined>;
  }): boolean {
    const admins = parseAdminUserIds();
    if (admins.size === 0) {
      return false;
    }
    const bearer = readBearerToken(req.headers.authorization);
    if (!bearer) {
      return false;
    }
    try {
      const payload = this.jwt.verify<JwtPayload>(bearer);
      const userId = payload?.sub?.trim();
      return Boolean(userId && admins.has(userId));
    } catch {
      return false;
    }
  }
}
