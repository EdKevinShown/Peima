import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

/**
 * Load monorepo root `.env` (or `apps/api/.env`) so `DATABASE_URL` is set like local dev.
 * Shell env still wins for any key already exported.
 */
const envAtRepoRoot = resolve(__dirname, "../../../.env");
const envInApiPackage = resolve(__dirname, "../../.env");
if (existsSync(envAtRepoRoot)) {
  loadEnv({ path: envAtRepoRoot });
} else if (existsSync(envInApiPackage)) {
  loadEnv({ path: envInApiPackage });
}

/**
 * Runs before e2e test files load so AuthModule / JwtStrategy see a stable secret.
 * Override with JWT_SECRET in the shell if needed; signing in tests uses the same value.
 */
process.env.JWT_SECRET ??= "e2e-timeline-jwt-secret";
