/**
 * M4.2-M1 — Batch regression & quality metrics (read-only).
 *
 * - Sample: pairwise_pool_finalize_meta.frozen = true AND preview_pools row exists for (poolId, userId=viewerUserId).
 * - Per pool: reuses Nest MatchingDecisionComparisonService.getComparison (M4.1); no duplicated four-source logic.
 * - No DB writes, no LLM, no MatchResult / display / worker changes.
 *
 * Prerequisite: build API once so dist/ exists:
 *   pnpm exec nest build --project apps/api
 *   (or from apps/api: pnpm exec nest build)
 *
 * Run from **monorepo root** (Node 20+). `@nestjs/core` is resolved via `createRequire(apps/api/package.json)`.
 *
 *   node --env-file=.env packages/database/scripts/m4-2-batch-regression-report.mjs --limit 50
 *   node --env-file=.env packages/database/scripts/m4-2-batch-regression-report.mjs --limit 50 --json docs/M4/M4.2-batch-regression-report.json --markdown docs/M4/M4.2-batch-regression-run-record.md
 *   node --env-file=.env packages/database/scripts/m4-2-batch-regression-report.mjs --include-samples=true
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = path.join(__dirname, "..", "..", "..");

const SCHEMA_VERSION = 1;
const SOURCE_VERSION = "m4.2-batch-regression-quality-metrics-v1";
const SAMPLE_DEFINITION =
  "pairwise_pool_finalize_meta.frozen_true_with_existing_preview_pool";

const NOTE_STATIC = "STATIC_SHORTLIST_MISSING";
const NOTE_MATCH = "MATCH_RESULT_MISSING";
const NOTE_PAIRWISE = "PAIRWISE_META_MISSING";
const NOTE_RRM = "RRM_PROPOSAL_MISSING";

function tryLoadMonorepoDotEnv() {
  if (process.env.DATABASE_URL) return;
  const p = path.join(MONOREPO_ROOT, ".env");
  if (!fs.existsSync(p)) return;
  const raw = fs.readFileSync(p, "utf8");
  for (const line of raw.split(/\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    if (!key || key.includes(" ")) continue;
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function parseArgs(argv) {
  let limit = 50;
  let jsonPath = "";
  let markdownPath = "";
  let includeSamples = false;
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--limit" && argv[i + 1]) {
      limit = Math.max(1, Math.min(5000, parseInt(String(argv[++i]), 10) || 50));
    } else if (a.startsWith("--limit=")) {
      limit = Math.max(1, Math.min(5000, parseInt(a.slice("--limit=".length), 10) || 50));
    } else if (a === "--json" && argv[i + 1]) {
      jsonPath = String(argv[++i]).trim();
    } else if (a.startsWith("--json=")) {
      jsonPath = a.slice("--json=".length).trim();
    } else if (a === "--markdown" && argv[i + 1]) {
      markdownPath = String(argv[++i]).trim();
    } else if (a.startsWith("--markdown=")) {
      markdownPath = a.slice("--markdown=".length).trim();
    } else if (a === "--include-samples" && argv[i + 1]) {
      const v = String(argv[++i]).trim().toLowerCase();
      includeSamples = v === "true" || v === "1" || v === "yes";
    } else if (a.startsWith("--include-samples=")) {
      const v = a.slice("--include-samples=".length).trim().toLowerCase();
      includeSamples = v === "true" || v === "1" || v === "yes";
    }
  }
  return { limit, jsonPath, markdownPath, includeSamples };
}

function assertApiDistBuilt() {
  const appModuleJs = path.join(MONOREPO_ROOT, "apps", "api", "dist", "app.module.js");
  if (!fs.existsSync(appModuleJs)) {
    console.error(
      "Missing apps/api/dist/app.module.js. Run from repo root: cd apps/api && pnpm exec nest build",
    );
    process.exit(1);
  }
}

function triple(numerator, denominator) {
  const rate = denominator > 0 ? numerator / denominator : null;
  return { numerator, denominator, rate };
}

function countNotes(notes, key) {
  if (!Array.isArray(notes)) return 0;
  return notes.filter((x) => x === key).length;
}

function aggregate(samples) {
  let dStaticMatch = 0;
  let nStaticMatch = 0;
  let dPairwiseMatch = 0;
  let nPairwiseMatch = 0;
  let dRrmMatch = 0;
  let nRrmMatch = 0;
  let dStaticRrm = 0;
  let nStaticRrm = 0;
  let dPairwiseRrm = 0;
  let nPairwiseRrm = 0;
  let dRrmWould = 0;
  let nRrmWould = 0;
  let dPairwiseWould = 0;
  let nPairwiseWould = 0;

  const missingCounts = {
    [NOTE_STATIC]: 0,
    [NOTE_MATCH]: 0,
    [NOTE_PAIRWISE]: 0,
    [NOTE_RRM]: 0,
  };
  const uniqueDist = {};
  const fallbackDist = {};

  for (const row of samples) {
    if (row.error) continue;
    const dto = row.dto;
    const notes = dto.comparisonSummary?.notes ?? [];
    missingCounts[NOTE_STATIC] += countNotes(notes, NOTE_STATIC);
    missingCounts[NOTE_MATCH] += countNotes(notes, NOTE_MATCH);
    missingCounts[NOTE_PAIRWISE] += countNotes(notes, NOTE_PAIRWISE);
    missingCounts[NOTE_RRM] += countNotes(notes, NOTE_RRM);

    const staticTop1 = dto.staticShortlist?.top1CandidateUserId ?? null;
    const matchId = dto.matchResultOriginal?.candidateUserId ?? null;
    const pw = dto.pairwiseFrozen;
    const rrm = dto.rrmReadonly;
    const pwSel = pw.present ? pw.selectedCandidateUserId : null;
    const rrmTop1 = rrm.present ? rrm.rrmTop1CandidateUserId : null;
    const sum = dto.comparisonSummary;

    const u = sum?.uniqueCandidateCount ?? 0;
    const uk = String(u);
    uniqueDist[uk] = (uniqueDist[uk] ?? 0) + 1;

    if (pw.present) {
      const fr = pw.fallbackReason == null || pw.fallbackReason === "" ? "none" : String(pw.fallbackReason);
      fallbackDist[fr] = (fallbackDist[fr] ?? 0) + 1;
    }

    if (staticTop1 && matchId) {
      dStaticMatch += 1;
      if (sum.staticTop1EqualsMatchResultOriginal === true) nStaticMatch += 1;
    }
    if (pw.present && matchId) {
      dPairwiseMatch += 1;
      if (sum.matchResultOriginalEqualsPairwiseSelected === true) nPairwiseMatch += 1;
    }
    if (rrm.present && matchId) {
      dRrmMatch += 1;
      if (sum.matchResultOriginalEqualsRrmTop1 === true) nRrmMatch += 1;
    }
    if (staticTop1 && rrmTop1) {
      dStaticRrm += 1;
      if (sum.staticTop1EqualsRrmTop1 === true) nStaticRrm += 1;
    }
    if (pwSel && rrmTop1) {
      dPairwiseRrm += 1;
      if (sum.pairwiseSelectedEqualsRrmTop1 === true) nPairwiseRrm += 1;
    }
    if (rrm.present && rrm.wouldChangeStaticResult != null) {
      dRrmWould += 1;
      if (rrm.wouldChangeStaticResult === true) nRrmWould += 1;
    }
    if (pw.present && pw.wouldChangeStaticResult != null) {
      dPairwiseWould += 1;
      if (pw.wouldChangeStaticResult === true) nPairwiseWould += 1;
    }
  }

  const metrics = {
    staticTop1EqualsMatchResultOriginalRate: triple(nStaticMatch, dStaticMatch),
    pairwiseEqualsMatchResultRate: triple(nPairwiseMatch, dPairwiseMatch),
    rrmEqualsMatchResultRate: triple(nRrmMatch, dRrmMatch),
    staticTop1EqualsRrmTop1Rate: triple(nStaticRrm, dStaticRrm),
    pairwiseSelectedEqualsRrmTop1Rate: triple(nPairwiseRrm, dPairwiseRrm),
    rrmWouldChangeStaticResultRate: triple(nRrmWould, dRrmWould),
    pairwiseWouldChangeStaticResultRate: triple(nPairwiseWould, dPairwiseWould),
  };

  return {
    missingCounts,
    distributions: { uniqueCandidateCountDistribution: uniqueDist },
    fallbackReasonDistribution: fallbackDist,
    metrics,
  };
}

function slimPerSample(dto) {
  return {
    viewerUserId: dto.viewerUserId,
    poolId: dto.poolId,
    staticTop1CandidateUserId: dto.staticShortlist?.top1CandidateUserId ?? null,
    matchResultOriginalCandidateUserId: dto.matchResultOriginal?.candidateUserId ?? null,
    pairwiseSelectedCandidateUserId: dto.pairwiseFrozen.present
      ? dto.pairwiseFrozen.selectedCandidateUserId
      : null,
    rrmTop1CandidateUserId: dto.rrmReadonly.present ? dto.rrmReadonly.rrmTop1CandidateUserId : null,
    uniqueCandidateCount: dto.comparisonSummary?.uniqueCandidateCount ?? 0,
    notes: dto.comparisonSummary?.notes ?? [],
  };
}

function consoleSummary(report) {
  console.log(`\n=== M4.2 batch regression (${SOURCE_VERSION}) ===`);
  console.log(`sampleDefinition: ${report.sampleDefinition}`);
  console.log(`sampleCount: ${report.sampleCount}`);
  console.log(`generatedAt: ${report.generatedAt}`);
  console.log("\n--- metrics (numerator / denominator / rate) ---");
  for (const [k, v] of Object.entries(report.metrics)) {
    console.log(
      `${k}: ${v.numerator}/${v.denominator} => ${v.rate == null ? "n/a" : (v.rate * 100).toFixed(2) + "%"}`,
    );
  }
  console.log("\n--- missingCounts (from M4.1 notes) ---");
  console.log(JSON.stringify(report.missingCounts, null, 2));
  console.log("\n--- uniqueCandidateCountDistribution ---");
  console.log(JSON.stringify(report.distributions.uniqueCandidateCountDistribution, null, 2));
  console.log("\n--- fallbackReasonDistribution ---");
  console.log(JSON.stringify(report.fallbackReasonDistribution, null, 2));
}

function writeMarkdown(report, outPath) {
  const lines = [];
  lines.push(`# M4.2 — Batch regression run record`);
  lines.push(``);
  lines.push(`- **sourceVersion**: \`${report.sourceVersion}\``);
  lines.push(`- **generatedAt**: ${report.generatedAt}`);
  lines.push(`- **sampleDefinition**: \`${report.sampleDefinition}\``);
  lines.push(`- **sampleCount**: ${report.sampleCount}`);
  lines.push(``);
  lines.push(`## Metrics`);
  lines.push(``);
  lines.push(`| metric | numerator | denominator | rate |`);
  lines.push(`|--------|-----------|-------------|------|`);
  for (const [k, v] of Object.entries(report.metrics)) {
    const rateStr = v.rate == null ? "n/a" : `${(v.rate * 100).toFixed(2)}%`;
    lines.push(`| ${k} | ${v.numerator} | ${v.denominator} | ${rateStr} |`);
  }
  lines.push(``);
  lines.push(`## missingCounts`);
  lines.push(``);
  lines.push("```json");
  lines.push(JSON.stringify(report.missingCounts, null, 2));
  lines.push("```");
  lines.push(``);
  lines.push(`## uniqueCandidateCountDistribution`);
  lines.push(``);
  lines.push("```json");
  lines.push(JSON.stringify(report.distributions.uniqueCandidateCountDistribution, null, 2));
  lines.push("```");
  lines.push(``);
  lines.push(`## fallbackReasonDistribution`);
  lines.push(``);
  lines.push("```json");
  lines.push(JSON.stringify(report.fallbackReasonDistribution, null, 2));
  lines.push("```");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`\nWrote markdown: ${outPath}`);
}

async function collectSamples(prisma, limit) {
  const rows = await prisma.pairwisePoolFinalizeMeta.findMany({
    where: { frozen: true },
    orderBy: { updatedAt: "desc" },
    select: { viewerUserId: true, poolId: true },
    take: Math.min(5000, Math.max(limit, limit * 5)),
  });
  const out = [];
  for (const r of rows) {
    const pool = await prisma.previewPool.findFirst({
      where: { id: r.poolId, userId: r.viewerUserId },
      select: { id: true },
    });
    if (!pool) continue;
    out.push({ viewerUserId: r.viewerUserId, poolId: r.poolId });
    if (out.length >= limit) break;
  }
  return out;
}

async function main() {
  tryLoadMonorepoDotEnv();
  const args = parseArgs(process.argv);
  assertApiDistBuilt();

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required (use --env-file=.env or set env).");
    process.exit(1);
  }

  /** Resolve Nest like `apps/api` (pnpm deps live under apps/api or hoisted). */
  const apiRequire = createRequire(path.join(MONOREPO_ROOT, "apps", "api", "package.json"));
  const { NestFactory } = apiRequire("@nestjs/core");
  const { AppModule } = await import(
    pathToFileURL(path.join(MONOREPO_ROOT, "apps", "api", "dist", "app.module.js")).href,
  );
  const { MatchingDecisionComparisonService } = await import(
    pathToFileURL(
      path.join(MONOREPO_ROOT, "apps", "api", "dist", "modules", "matching", "matching-decision-comparison.service.js"),
    ).href,
  );
  const { PrismaService } = await import(
    pathToFileURL(path.join(MONOREPO_ROOT, "apps", "api", "dist", "common", "prisma", "prisma.service.js")).href,
  );

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const prisma = app.get(PrismaService);
    const comparison = app.get(MatchingDecisionComparisonService);

    const sampleKeys = await collectSamples(prisma, args.limit);
    const samples = [];
    for (const s of sampleKeys) {
      try {
        const dto = await comparison.getComparison(s.viewerUserId, s.poolId);
        samples.push({ viewerUserId: s.viewerUserId, poolId: s.poolId, dto, error: null });
      } catch (e) {
        samples.push({
          viewerUserId: s.viewerUserId,
          poolId: s.poolId,
          dto: null,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const generatedAt = new Date().toISOString();
    const agg = aggregate(samples);
    const perSample = args.includeSamples
      ? samples.map((r) =>
          r.error
            ? {
                viewerUserId: r.viewerUserId,
                poolId: r.poolId,
                error: r.error,
              }
            : slimPerSample(r.dto),
        )
      : [];

    const report = {
      schemaVersion: SCHEMA_VERSION,
      sourceVersion: SOURCE_VERSION,
      generatedAt,
      sampleDefinition: SAMPLE_DEFINITION,
      sampleCount: samples.length,
      metrics: agg.metrics,
      missingCounts: agg.missingCounts,
      distributions: agg.distributions,
      fallbackReasonDistribution: agg.fallbackReasonDistribution,
      perSample,
    };

    consoleSummary(report);

    if (args.jsonPath) {
      fs.mkdirSync(path.dirname(args.jsonPath), { recursive: true });
      fs.writeFileSync(args.jsonPath, JSON.stringify(report, null, 2), "utf8");
      console.log(`\nWrote JSON: ${args.jsonPath}`);
    }
    if (args.markdownPath) {
      writeMarkdown(report, args.markdownPath);
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
