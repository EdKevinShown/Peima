/**
 * P7.6-r9b — seed production-like MatchResult fixtures (dev/staging only).
 * Tag: p7.6-r9b-http-get-smoke-fixture
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
try {
  const envText = readFileSync(join(root, ".env"), "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") process.env[key] = val;
  }
} catch {
  /* optional */
}

const prisma = new PrismaClient();
const FIXTURE_TAG = "p7.6-r9b-http-get-smoke-fixture";
const FINAL_SCORE = 0.75;
const VIEWERS = [
  "cmr4hm001016z64demo00m05a",
  "cmfemn00100016z64seed0001",
  "cmr4hf000716z64demo00f04a",
  "cmr4hf000916z64demo00f05a",
  "cmr4r7j4050025z64stag0001",
];

async function main() {
  const batch = await prisma.matchBatch.create({
    data: {
      batchDate: new Date("2026-05-18T14:00:00.000Z"),
      status: "completed",
      totalUsers: VIEWERS.length,
      successCount: VIEWERS.length,
      failedCount: 0,
    },
  });

  const seeded = [];
  for (const userId of VIEWERS) {
    const existing = await prisma.matchResult.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      seeded.push({
        userId,
        action: "skipped_existing",
        matchResultId: existing.id,
        candidateUserId: existing.candidateUserId,
        finalScore: existing.finalScore,
      });
      continue;
    }
    const row = await prisma.matchResult.create({
      data: {
        userId,
        candidateUserId: userId,
        batchId: batch.id,
        finalScore: FINAL_SCORE,
        reasonSummary: FIXTURE_TAG,
        matchInsights: { p76R9bFixture: true },
        status: "active",
        createdAt: new Date("2026-05-18T14:01:00.000Z"),
        updatedAt: new Date("2026-05-18T14:01:00.000Z"),
      },
    });
    seeded.push({
      userId,
      action: "created",
      matchResultId: row.id,
      candidateUserId: row.candidateUserId,
      finalScore: row.finalScore,
      batchId: batch.id,
    });
  }

  const outDir = join(root, "artifacts/p76/r9b");
  mkdirSync(outDir, { recursive: true });
  const payload = {
    fixtureTag: FIXTURE_TAG,
    batchId: batch.id,
    finalScore: FINAL_SCORE,
    seeded,
    seededAt: new Date().toISOString(),
  };
  writeFileSync(join(outDir, "fixture-seed-log.json"), JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
