/**
 * P7.6-r8h2 — dev display smoke (resolveMatchResultDisplay + live sidecar DB).
 * Route C viewers have no match_results (r7k2); uses synthetic MatchResult rows for resolver path.
 * Usage: node apps/api/scripts/p76-r8h2-display-smoke.mjs [disabled|enabled|negative]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../dist/app.module.js";
import { PrismaService } from "../dist/common/prisma/prisma.service.js";
import { resolveMatchResultDisplay } from "../dist/modules/matching/matching-result-display.js";
import { MatchingService } from "../dist/modules/matching/matching.service.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function loadDotEnv() {
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
      if (process.env[key] == null || process.env[key] === "") {
        process.env[key] = val;
      }
    }
  } catch {
    /* optional */
  }
}

loadDotEnv();

const VIEWERS = [
  "cmr4hm001016z64demo00m05a",
  "cmfemn00100016z64seed0001",
  "cmr4hf000716z64demo00f04a",
  "cmr4hf000916z64demo00f05a",
  "cmr4r7j4050025z64stag0001",
];
const NON_ALLOWLIST = "cmo7ksq8s00006znosryc9k0n";

const SIDECAR_EXPECTED = {
  cmr4hm001016z64demo00m05a: "cmr4hf000916z64demo00f05a",
  cmfemn00100016z64seed0001: "cmr4hf000716z64demo00f04a",
  cmr4hf000716z64demo00f04a: "cmfemn00100016z64seed0001",
  cmr4hf000916z64demo00f05a: "cmr4hf000716z64demo00f04a",
  cmr4r7j4050025z64stag0001: "cmr4r7j4070025z64stag0003",
};

function syntheticMatchRow(viewerUserId) {
  return {
    id: `mr-r8h2-synthetic-${viewerUserId}`,
    userId: viewerUserId,
    candidateUserId: viewerUserId,
    batchId: "batch-r8h2-smoke",
    finalScore: 0.75,
    reasonSummary: "r8h2-smoke",
    matchInsights: {},
    status: "active",
    createdAt: new Date("2026-05-18T12:00:00.000Z"),
    updatedAt: new Date("2026-05-18T12:00:00.000Z"),
  };
}

function pickDisplay(display, legacyCandidateUserId, finalScore) {
  return {
    legacyCandidateUserId,
    finalScore,
    displayCandidateUserId: display.displayCandidateUserId,
    displaySourceType: display.displaySourceType,
    p76ReadPathMeta: display.p76ReadPathMeta ?? null,
    candidateUserIdUnchanged:
      display.displayCandidateUserId !== legacyCandidateUserId
        ? `display differs; persisted candidate would remain ${legacyCandidateUserId}`
        : "same as legacy baseline",
  };
}

function readPathEnvSnapshot() {
  return {
    PEIMA_P76_READ_PATH_ENABLED: process.env.PEIMA_P76_READ_PATH_ENABLED ?? "",
    PEIMA_P76_READ_PATH_VIEWER_IDS: process.env.PEIMA_P76_READ_PATH_VIEWER_IDS ?? "",
    PEIMA_P76_READ_PATH_SOURCE_VERSION:
      process.env.PEIMA_P76_READ_PATH_SOURCE_VERSION ?? "",
  };
}

async function main() {
  const mode = process.argv[2] ?? "enabled";
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  const prisma = app.get(PrismaService);
  const matching = app.get(MatchingService);
  const out = {};

  if (mode === "negative") {
    try {
      const row = await matching.getLatestResultForUser(NON_ALLOWLIST);
      out[NON_ALLOWLIST] = {
        ok: true,
        path: "getLatestResultForUser",
        syntheticMatchResult: false,
        candidateUserId: row.candidateUserId,
        finalScore: row.finalScore,
        displayCandidateUserId: row.displayCandidateUserId,
        displaySourceType: row.displaySourceType,
        p76ReadPathMeta: row.p76ReadPathMeta ?? null,
      };
    } catch (e) {
      out[NON_ALLOWLIST] = {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  } else {
    for (const viewerUserId of VIEWERS) {
      const mr = syntheticMatchRow(viewerUserId);
      const legacyCandidate = mr.candidateUserId;
      const finalScore = mr.finalScore;
      try {
        const display = await resolveMatchResultDisplay(prisma, mr);
        out[viewerUserId] = {
          ok: true,
          path: "resolveMatchResultDisplay",
          syntheticMatchResult: true,
          expectedSidecarDisplay: SIDECAR_EXPECTED[viewerUserId] ?? null,
          ...pickDisplay(display, legacyCandidate, finalScore),
        };
      } catch (e) {
        out[viewerUserId] = {
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }
  }

  const payload = {
    mode,
    note:
      "Route C viewers lack match_results in dev DB (r7k2); resolver smoke uses synthetic MatchResult rows. GET /matching/result/:id requires a persisted row.",
    env: readPathEnvSnapshot(),
    results: out,
  };
  const outDir = join(root, "artifacts", "p76", "r8h2");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, `display-smoke-${mode}.json`),
    JSON.stringify(payload, null, 2),
  );
  console.log(JSON.stringify(payload, null, 2));
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
