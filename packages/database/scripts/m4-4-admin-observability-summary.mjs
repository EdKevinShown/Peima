/**
 * M4.4-M1 — Admin observability & fallback reliability (read-only CLI summary).
 *
 * Aggregation logic: @peima/database/matching-observability (P7.11-r1 shared module).
 *
 * Run from monorepo root (Node 20+); build database package first if dist is stale:
 *   pnpm --filter @peima/database build
 *   node --env-file=.env packages/database/scripts/m4-4-admin-observability-summary.mjs
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const require = createRequire(import.meta.url);
const {
  MATCHING_OBSERVABILITY_SOURCE_VERSION,
  buildMatchingObservabilitySummary,
  clampMatchingObservabilityLimit,
  clampMatchingObservabilitySinceDays,
} = require("@peima/database/matching-observability");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = path.join(__dirname, "..", "..", "..");

function tryLoadMonorepoDotEnv() {
  if (process.env.DATABASE_URL) return;
  const p = path.join(MONOREPO_ROOT, ".env");
  if (!fs.existsSync(p)) return;
  const raw = fs.readFileSync(p, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function parseArgs(argv) {
  let limit = 500;
  let sinceDays = 30;
  let jsonPath = "";
  let markdownPath = "";
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--limit" && argv[i + 1]) {
      limit = clampMatchingObservabilityLimit(parseInt(String(argv[++i]), 10));
    } else if (a.startsWith("--limit=")) {
      limit = clampMatchingObservabilityLimit(parseInt(a.slice("--limit=".length), 10));
    } else if (a === "--since-days" && argv[i + 1]) {
      sinceDays = clampMatchingObservabilitySinceDays(parseInt(String(argv[++i]), 10));
    } else if (a.startsWith("--since-days=")) {
      sinceDays = clampMatchingObservabilitySinceDays(
        parseInt(a.slice("--since-days=".length), 10),
      );
    } else if (a === "--json" && argv[i + 1]) {
      jsonPath = String(argv[++i]).trim();
    } else if (a.startsWith("--json=")) {
      jsonPath = a.slice("--json=".length).trim();
    } else if (a === "--markdown" && argv[i + 1]) {
      markdownPath = String(argv[++i]).trim();
    } else if (a.startsWith("--markdown=")) {
      markdownPath = a.slice("--markdown=".length).trim();
    }
  }
  return { limit, sinceDays, jsonPath, markdownPath };
}

function printConsoleSummary(report) {
  const { pairwise: pw, simulation: sim, finalizeMeta: fin, matchAndPreview: mp } = report;

  console.log("=== M4.4-M1 Admin observability summary ===");
  console.log(
    `sourceVersion=${report.sourceVersion} since=${report.window.sinceUtc} sinceDays=${report.window.sinceDays} metaParseCap=${report.window.rowCapForMetaParse}`,
  );
  console.log("\n-- Pairwise (in window) --");
  console.log(`total: ${pw.totalInWindow}`);
  console.log(`status: ${JSON.stringify(pw.statusDistribution)}`);
  console.log(
    `fallbackUsed true/false/null: ${pw.fallbackUsed.trueCount} / ${pw.fallbackUsed.falseCount} / ${pw.fallbackUsed.nullCount} (rate true/all: ${pw.fallbackUsed.rateTrueOverAll})`,
  );
  console.log(`failureDetail.code: ${JSON.stringify(pw.failureDetailCodeDistribution)}`);
  console.log(`schema_validation (pairwise): ${pw.schemaValidationCount}`);
  console.log(`sourceVersion: ${JSON.stringify(pw.sourceVersionDistribution)}`);

  console.log("\n-- AI simulation (items scoped to jobs in window) --");
  console.log(`jobStatus: ${JSON.stringify(sim.jobStatusDistributionInWindow)}`);
  console.log(`item status: ${JSON.stringify(sim.itemStatusDistributionInWindow)}`);
  console.log(`item errorCode: ${JSON.stringify(sim.itemErrorCodeDistributionInWindow)}`);
  console.log(`failed items: ${sim.failedItemCountInWindow}`);
  console.log(`schema_validation items: ${sim.schemaValidationItemCountInWindow}`);

  console.log("\n-- Finalize meta --");
  console.log(`total window/all: ${fin.totalInWindow} / ${fin.totalAllTime}`);
  console.log(`frozen true window/all: ${fin.frozenTrueInWindow} / ${fin.frozenTrueAllTime}`);
  console.log(`meta parsed rows: ${fin.metaRowsParsed} sampled=${fin.metaStatsSampled}`);
  console.log(
    `wouldChangeStaticResult: ${fin.wouldChangeStaticResult.trueCount}/${fin.wouldChangeStaticResult.parsedBooleanCount} (rate ${fin.wouldChangeStaticResult.rateOverParsed})`,
  );
  console.log(`fallbackReason dist: ${JSON.stringify(fin.fallbackReasonDistribution)}`);
  console.log(
    `pairwiseProposalRecommendation dist: ${JSON.stringify(fin.pairwiseProposalRecommendationDistribution)}`,
  );
  console.log(`appliedToFinalScore true (parsed): ${fin.appliedToFinalScoreTrueCountAmongParsed}`);
  console.log(
    `appliedToWorkerRanking true (parsed): ${fin.appliedToWorkerRankingTrueCountAmongParsed}`,
  );
  if (fin.metaParseErrorCount) {
    console.log(`meta parse issues: ${fin.metaParseErrorCount} (see JSON metaParseErrorBuckets)`);
  }

  console.log("\n-- Match / preview --");
  console.log(`match_results total: ${mp.matchResultsTotal}`);
  console.log(`preview_pools total: ${mp.previewPoolsTotal}`);
  console.log(`preview pools with finalize meta (join-valid): ${mp.previewPoolsWithFinalizeMetaRow}`);
  console.log(
    `distinct poolIds with succeeded sim job (window): ${mp.distinctPreviewPoolsWithSucceededSimulationInWindow}`,
  );

  console.log("\n-- M4.2 / M4.1 --");
  console.log(report.m42AlignmentHint.message);
  console.log(`Suggested: ${report.m42AlignmentHint.suggestedScript}`);
  if (report.m42AlignmentHint.sanitizedRunRecordPath) {
    console.log(`Sanitized doc: ${report.m42AlignmentHint.sanitizedRunRecordPath}`);
  }
}

function writeMarkdown(report, mdAbs) {
  const pw = report.pairwise;
  const sim = report.simulation;
  const fin = report.finalizeMeta;
  const mp = report.matchAndPreview;

  const lines = [
    `# M4.4-M1 observability summary`,
    ``,
    `- **Generated**: ${report.generatedAt}`,
    `- **Window**: last **${report.window.sinceDays}** days (UTC midnight anchor), \`since\`=${report.window.sinceUtc}`,
    `- **sourceVersion**: \`${MATCHING_OBSERVABILITY_SOURCE_VERSION}\``,
    ``,
    `## Pairwise (\`ai_pairwise_decision_jobs\`, in window)`,
    ``,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| total | ${pw.totalInWindow} |`,
    `| fallbackUsed true | ${pw.fallbackUsed.trueCount} (rate vs all: ${pw.fallbackUsed.rateTrueOverAll}) |`,
    `| schema_validation | ${pw.schemaValidationCount} |`,
    ``,
    `### status`,
    ``,
    ...Object.entries(pw.statusDistribution).map(([k, v]) => `- **${k}**: ${v}`),
    ``,
    `### failureDetail.code`,
    ``,
    ...Object.entries(pw.failureDetailCodeDistribution).map(([k, v]) => `- **${k}**: ${v}`),
    ``,
    `## Simulation`,
    ``,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| failed items (window) | ${sim.failedItemCountInWindow} |`,
    `| schema_validation items (window) | ${sim.schemaValidationItemCountInWindow} |`,
    ``,
    `### jobStatus`,
    ``,
    ...Object.entries(sim.jobStatusDistributionInWindow).map(([k, v]) => `- **${k}**: ${v}`),
    ``,
    `### item errorCode`,
    ``,
    ...Object.entries(sim.itemErrorCodeDistributionInWindow).map(([k, v]) => `- **${k}**: ${v}`),
    ``,
    `## Finalize meta`,
    ``,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| total (window / all) | ${fin.totalInWindow} / ${fin.totalAllTime} |`,
    `| frozen true (window / all) | ${fin.frozenTrueInWindow} / ${fin.frozenTrueAllTime} |`,
    `| meta rows parsed | ${fin.metaRowsParsed} (sampled=${fin.metaStatsSampled}) |`,
    `| wouldChangeStaticResult true / parsed | ${fin.wouldChangeStaticResult.trueCount} / ${fin.wouldChangeStaticResult.parsedBooleanCount} |`,
    ``,
    `## Match / preview`,
    ``,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| match_results total | ${mp.matchResultsTotal} |`,
    `| preview_pools total | ${mp.previewPoolsTotal} |`,
    `| pools with finalize+preview join | ${mp.previewPoolsWithFinalizeMetaRow} |`,
    `| distinct pools succeeded sim (window) | ${mp.distinctPreviewPoolsWithSucceededSimulationInWindow} |`,
    ``,
    `## M4.1 / M4.2`,
    ``,
    report.m42AlignmentHint.message,
    ``,
    `- Script: \`${report.m42AlignmentHint.suggestedScript}\``,
    report.m42AlignmentHint.sanitizedRunRecordPath
      ? `- Sanitized: \`${report.m42AlignmentHint.sanitizedRunRecordPath}\``
      : "",
  ].filter(Boolean);
  fs.mkdirSync(path.dirname(mdAbs), { recursive: true });
  fs.writeFileSync(mdAbs, lines.join("\n"), "utf8");
}

async function main() {
  tryLoadMonorepoDotEnv();
  const { limit, sinceDays, jsonPath, markdownPath } = parseArgs(process.argv);
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required (e.g. node --env-file=.env from repo root).");
    process.exit(1);
  }

  const m42Sanitized = path.join(
    MONOREPO_ROOT,
    "docs",
    "M4",
    "M4.2-batch-regression-sanitized-run-record.md",
  );

  const prisma = new PrismaClient();
  try {
    const report = await buildMatchingObservabilitySummary(prisma, {
      limit,
      sinceDays,
      m42SanitizedRunRecordExists: fs.existsSync(m42Sanitized),
    });

    printConsoleSummary(report);

    const jsonAbs = jsonPath
      ? path.isAbsolute(jsonPath)
        ? jsonPath
        : path.join(MONOREPO_ROOT, jsonPath)
      : "";
    if (jsonAbs) {
      fs.mkdirSync(path.dirname(jsonAbs), { recursive: true });
      fs.writeFileSync(jsonAbs, JSON.stringify(report, null, 2), "utf8");
      console.log(`\nWrote JSON: ${jsonAbs}`);
    }

    const mdAbs = markdownPath
      ? path.isAbsolute(markdownPath)
        ? markdownPath
        : path.join(MONOREPO_ROOT, markdownPath)
      : "";
    if (mdAbs) {
      writeMarkdown(report, mdAbs);
      console.log(`Wrote Markdown: ${mdAbs}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
