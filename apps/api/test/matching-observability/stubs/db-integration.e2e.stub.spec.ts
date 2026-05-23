/**
 * STUB — real-database integration (not run in CI by default).
 *
 * Enable when DATABASE_URL points at a disposable dev DB with seed data:
 *   RUN_MATCHING_OBSERVABILITY_DB_E2E=1 pnpm exec jest --config ./jest.config.cjs --testPathPattern=db-integration.e2e.stub
 */
import { PrismaClient } from "@peima/database";
import { buildMatchingObservabilitySummary } from "@peima/database";

const run = process.env.RUN_MATCHING_OBSERVABILITY_DB_E2E === "1";

(run ? describe : describe.skip)("matching observability · DB integration (stub)", () => {
  it.todo(
    "buildMatchingObservabilitySummary returns stable shape against real Postgres",
  );

  it.todo(
    "pairwise.failureDetailCodeDistribution matches manual SQL spot-check for since window",
  );

  (run ? it : it.skip)("smoke: runs against DATABASE_URL without throwing", async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL required for RUN_MATCHING_OBSERVABILITY_DB_E2E=1");
    }
    const prisma = new PrismaClient();
    try {
      const report = await buildMatchingObservabilitySummary(prisma, {
        limit: 50,
        sinceDays: 7,
      });
      expect(report.schemaVersion).toBe(1);
    } finally {
      await prisma.$disconnect();
    }
  });
});
