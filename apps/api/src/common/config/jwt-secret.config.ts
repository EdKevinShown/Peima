/** Minimum length for JWT_SECRET when NODE_ENV=production. */
export const JWT_SECRET_MIN_LENGTH_PRODUCTION = 32;

/**
 * Explicit dev/test fallback only — never used when NODE_ENV=production.
 * Must stay >= JWT_SECRET_MIN_LENGTH_PRODUCTION so local signing matches prod rules.
 */
export const DEV_JWT_SECRET_FALLBACK =
  "dev-only-jwt-secret-not-for-production-min-32-chars";

const FORBIDDEN_JWT_SECRETS = new Set([
  "change-me-in-production",
  "changeme",
  "secret",
  "jwt-secret",
]);

export function isProductionNodeEnv(): boolean {
  return process.env.NODE_ENV === "production";
}

function formatJwtSecretStartupError(message: string): Error {
  return new Error(
    `${message} Generate one with: openssl rand -hex 32`,
  );
}

/**
 * Resolve and validate JWT signing secret for API boot and JwtModule registration.
 * @throws when production is misconfigured or a forbidden placeholder is used
 */
export function assertJwtSecretConfigured(): string {
  const raw = process.env.JWT_SECRET?.trim() ?? "";

  if (isProductionNodeEnv()) {
    if (!raw) {
      throw formatJwtSecretStartupError(
        "JWT_SECRET is required when NODE_ENV=production.",
      );
    }
    if (FORBIDDEN_JWT_SECRETS.has(raw)) {
      throw formatJwtSecretStartupError(
        "JWT_SECRET must not use a known insecure placeholder in production.",
      );
    }
    if (raw.length < JWT_SECRET_MIN_LENGTH_PRODUCTION) {
      throw formatJwtSecretStartupError(
        `JWT_SECRET must be at least ${JWT_SECRET_MIN_LENGTH_PRODUCTION} characters when NODE_ENV=production (got ${raw.length}).`,
      );
    }
    return raw;
  }

  if (!raw) {
    return DEV_JWT_SECRET_FALLBACK;
  }
  if (FORBIDDEN_JWT_SECRETS.has(raw)) {
    throw formatJwtSecretStartupError(
      'JWT_SECRET is set to a known insecure placeholder ("change-me-in-production"). Unset JWT_SECRET to use the dev-only fallback, or set a strong random secret.',
    );
  }
  return raw;
}

let cachedJwtSecret: string | undefined;

/** Cached JWT secret after first successful validation. */
export function getJwtSecret(): string {
  if (cachedJwtSecret === undefined) {
    cachedJwtSecret = assertJwtSecretConfigured();
  }
  return cachedJwtSecret;
}

/** Clear module cache — for unit tests only. */
export function resetJwtSecretCacheForTests(): void {
  cachedJwtSecret = undefined;
}
