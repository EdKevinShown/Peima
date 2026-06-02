import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  isTestingObservabilityEnabled,
  readTestingObservabilityToken,
} from "./testing-observability-env";

@Injectable()
export class TestingObservabilityGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!isTestingObservabilityEnabled()) {
      throw new NotFoundException();
    }
    const expected = readTestingObservabilityToken();
    if (!expected) {
      return true;
    }
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const raw = req.headers["x-peima-debug-token"];
    const header = Array.isArray(raw) ? raw[0] : raw;
    if (header !== expected) {
      throw new UnauthorizedException("invalid or missing x-peima-debug-token");
    }
    return true;
  }
}
