import type { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface";
import { isProductionNodeEnv } from "./jwt-secret.config";

/** Default browser origins for local development when PEIMA_CORS_ALLOWED_ORIGINS is unset. */
export const DEV_CORS_DEFAULT_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
] as const;

function formatCorsStartupError(message: string): Error {
  return new Error(`${message} Example: PEIMA_CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000`);
}

/** Parse comma-separated CORS origins from env (trimmed, empty entries dropped). */
export function parseCorsAllowedOrigins(raw: string | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function assertNoWildcardOrigins(origins: readonly string[]): void {
  if (origins.some((origin) => origin === "*")) {
    throw formatCorsStartupError(
      'PEIMA_CORS_ALLOWED_ORIGINS must not include wildcard "*". Wildcard origins cannot be used safely with credentialed CORS.',
    );
  }
}

/**
 * Resolve allowed browser origins for Nest enableCors.
 * @throws when production is missing explicit origins or a wildcard is configured
 */
export function assertCorsAllowedOriginsConfigured(): readonly string[] {
  const fromEnv = parseCorsAllowedOrigins(process.env.PEIMA_CORS_ALLOWED_ORIGINS);

  if (isProductionNodeEnv()) {
    if (fromEnv.length === 0) {
      throw formatCorsStartupError(
        "PEIMA_CORS_ALLOWED_ORIGINS is required when NODE_ENV=production.",
      );
    }
    assertNoWildcardOrigins(fromEnv);
    return fromEnv;
  }

  if (fromEnv.length > 0) {
    assertNoWildcardOrigins(fromEnv);
    return fromEnv;
  }

  return DEV_CORS_DEFAULT_ORIGINS;
}

/** NestJS CORS options: explicit allowlist only; never wildcard + credentials. */
export function buildNestCorsOptions(): CorsOptions {
  const allowedOrigins = assertCorsAllowedOriginsConfigured();
  const allowedSet = new Set(allowedOrigins);

  return {
    origin(origin, callback) {
      if (!origin || allowedSet.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: false,
  };
}
