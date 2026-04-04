/**
 * Runs before e2e test files load so AuthModule / JwtStrategy see a stable secret.
 * Override with JWT_SECRET in the shell if needed; signing in tests uses the same value.
 */
process.env.JWT_SECRET ??= "e2e-timeline-jwt-secret";
