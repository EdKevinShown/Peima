/**
 * M4.4-M1 — Admin observability & fallback reliability (read-only CLI summary).
 *
 * - Aggregates pairwise / simulation / finalize / match / preview counts and distributions.
 * - No DB writes, no LLM, no API calls, no MatchResult / worker / FinalMatch changes.
 * - Does not emit viewerUserId / poolId / candidateUserId lists, prompts, transcripts, or raw meta.
 *
 * Run from monorepo root (Node 20+):
 *   node --env-file=.env packages/database/scripts/m4-4-admin-observability-summary.mjs
 *   node --env-file=.env packages/database/scripts/m4-4-admin-observability-summary.mjs --limit 500 --since-days 30
 *   node --env-file=.env packages/database/scripts/m4-4-admin-observability-summary.mjs --json docs/M4/M4.4-admin-observability-summary.local.json --markdown docs/M4/M4.4-admin-observability-summary.local.md
 *
 * Default outputs use *.local.* paths (gitignored). Do not commit raw reports with real IDs.
 */
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = path.join(__dirname, "..", "..", "..");

const SOURCE_VERSION = "m4.4-m1-admin-observability-summary-v1";

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
      limit = Math.max(1, Math.min(50_000, parseInt(String(argv[++i]), 10) || 500));
    } else if (a.startsWith("--limit=")) {
      limit = Math.max(1, Math.min(50_000, parseInt(a.slice("--limit=".length), 10) || 500));
    } else if (a === "--since-days" && argv[i + 1]) {
      sinceDays = Math.max(1, Math.min(3650, parseInt(String(argv[++i]), 10) || 30));
    } else if (a.startsWith("--since-days=")) {
      sinceDays = Math.max(1, Math.min(3650, parseInt(a.slice("--since-days=".length), 10) || 30));
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

function sinceDate(sinceDays) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - sinceDays);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function rate(num, den) {
  if (den <= 0) return null;
  return Math.round((num / den) * 10_000) / 10_000;
}

function bump(map, key, n = 1) {
  const k = key == null || key === "" ? "(empty)" : String(key);
  map.set(k, (map.get(k) || 0) + n);
}

function mapToObj(m) {
  const o = {};
  for (const [k, v] of [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    o[k] = v;
  }
  return o;
}

/** Safe meta fields only; never return raw meta object. */
function parseFinalizeMetaRow(metaUnknown, parseErrors) {
  if (metaUnknown == null) {
    parseErrors.push("null_meta");
    return null;
  }
  let m = metaUnknown;
  if (typeof m === "string") {
    try {
      m = JSON.parse(m);
    } catch {
      parseErrors.push("json_string_parse_fail");
      return null;
    }
  }
  if (typeof m !== "object" || Array.isArray(m)) {
    parseErrors.push("meta_not_object");
    return null;
  }
  const o = {};
  for (const key of [
    "wouldChangeStaticResult",
    "fallbackReason",
    "pairwiseProposalRecommendation",
    "appliedToFinalScore",
    "appliedToWorkerRanking",
  ]) {
    if (Object.prototype.hasOwnProperty.call(m, key)) {
      const v = m[key];
      if (v === null || typeof v === "boolean" || typeof v === "string" || typeof v === "number") {
        o[key] = v;
      } else if (typeof v === "object") {
        o[key] = "(object_omitted)";
      }
    }
  }
  return o;
}

async function main() {
  tryLoadMonorepoDotEnv();
  const { limit, sinceDays, jsonPath, markdownPath } = parseArgs(process.argv);
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required (e.g. node --env-file=.env from repo root).");
    process.exit(1);
  }

  const since = sinceDate(sinceDays);
  const prisma = new PrismaClient();

  const report = {
    schemaVersion: 1,
    sourceVersion: SOURCE_VERSION,
    generatedAt: new Date().toISOString(),
    window: { sinceDays, sinceUtc: since.toISOString(), rowCapForMetaParse: limit },
    notes: [
      "Pairwise failureDetail.code distribution uses full time window (SQL aggregate).",
      "Finalize meta field distributions: rows in window; if count exceeds rowCapForMetaParse, only the most recent N rows are parsed (see finalizeMeta.metaStatsSampled).",
      "M4.1 four-source agreement rate is not recomputed here; use packages/database/scripts/m4-2-batch-regression-report.mjs.",
      "Sanitized narrative reference: docs/M4/M4.2-batch-regression-sanitized-run-record.md (if present).",
    ],
  };

  try {
    /* --- Pairwise --- */
    const pwWhere = { updatedAt: { gte: since } };
    const pairwiseTotal = await prisma.aiPairwiseDecisionJob.count({ where: pwWhere });
    const pwStatus = await prisma.aiPairwiseDecisionJob.groupBy({
      by: ["status"],
      where: pwWhere,
      _count: true,
    });
    const pwStatusDist = {};
    for (const row of pwStatus) {
      pwStatusDist[row.status] = row._count;
    }

    const pwSource = await prisma.aiPairwiseDecisionJob.groupBy({
      by: ["sourceVersion"],
      where: pwWhere,
      _count: true,
    });
    const sourceVersionDist = {};
    for (const row of pwSource) {
      sourceVersionDist[row.sourceVersion] = row._count;
    }

    const pwFbTrue = await prisma.aiPairwiseDecisionJob.count({
      where: { ...pwWhere, fallbackUsed: true },
    });
    const pwFbFalse = await prisma.aiPairwiseDecisionJob.count({
      where: { ...pwWhere, fallbackUsed: false },
    });
    const pwFbNull = await prisma.aiPairwiseDecisionJob.count({
      where: { ...pwWhere, fallbackUsed: null },
    });

    const codeRows = await prisma.$queryRaw`
      SELECT COALESCE("failureDetail"->>'code', '(null)') AS code, COUNT(*)::int AS c
      FROM "ai_pairwise_decision_jobs"
      WHERE "updatedAt" >= ${since}
      GROUP BY 1
    `;
    const failureDetailCodeDist = {};
    let schemaValidationPairwise = 0;
    for (const row of codeRows) {
      const c = Number(row.c);
      failureDetailCodeDist[row.code] = c;
      if (row.code === "schema_validation") schemaValidationPairwise = c;
    }

    report.pairwise = {
      totalInWindow: pairwiseTotal,
      statusDistribution: pwStatusDist,
      sourceVersionDistribution: sourceVersionDist,
      fallbackUsed: {
        trueCount: pwFbTrue,
        falseCount: pwFbFalse,
        nullCount: pwFbNull,
        rateDenominatorAll: pairwiseTotal,
        rateTrueOverAll: rate(pwFbTrue, pairwiseTotal),
      },
      failureDetailCodeDistribution: failureDetailCodeDist,
      schemaValidationCount: schemaValidationPairwise,
    };

    /* --- Simulation jobs + items --- */
    const simJobWhere = { updatedAt: { gte: since } };
    const simJobStatus = await prisma.aiSimulationV1Job.groupBy({
      by: ["jobStatus"],
      where: simJobWhere,
      _count: true,
    });
    const jobStatusDist = {};
    for (const row of simJobStatus) {
      jobStatusDist[row.jobStatus] = row._count;
    }

    const itemWhere = { job: { updatedAt: { gte: since } } };
    const itemStatus = await prisma.aiSimulationV1Item.groupBy({
      by: ["status"],
      where: itemWhere,
      _count: true,
    });
    const itemStatusDist = {};
    for (const row of itemStatus) {
      itemStatusDist[row.status] = row._count;
    }

    const itemError = await prisma.aiSimulationV1Item.groupBy({
      by: ["errorCode"],
      where: itemWhere,
      _count: true,
    });
    const itemErrorCodeDist = {};
    for (const row of itemError) {
      const k = row.errorCode == null ? "(null)" : row.errorCode;
      itemErrorCodeDist[k] = row._count;
    }

    const failedItemCount = await prisma.aiSimulationV1Item.count({
      where: { ...itemWhere, status: "failed" },
    });

    const simSchemaRows = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS c
      FROM "ai_simulation_v1_items" i
      INNER JOIN "ai_simulation_v1_jobs" j ON j."id" = i."jobId"
      WHERE j."updatedAt" >= ${since}
        AND (
          i."errorCode" = 'schema_validation'
          OR (i."failureDetail" IS NOT NULL AND i."failureDetail"->>'code' = 'schema_validation')
        )
    `;
    const schemaValidationSimItems = Number(simSchemaRows[0]?.c ?? 0);

    report.simulation = {
      jobStatusDistributionInWindow: jobStatusDist,
      itemStatusDistributionInWindow: itemStatusDist,
      itemErrorCodeDistributionInWindow: itemErrorCodeDist,
      failedItemCountInWindow: failedItemCount,
      schemaValidationItemCountInWindow: schemaValidationSimItems,
    };

    /* --- Finalize meta --- */
    const finWhere = { updatedAt: { gte: since } };
    const finalizeTotalWindow = await prisma.pairwisePoolFinalizeMeta.count({ where: finWhere });
    const finalizeTotalAll = await prisma.pairwisePoolFinalizeMeta.count();
    const frozenTrueWindow = await prisma.pairwisePoolFinalizeMeta.count({
      where: { ...finWhere, frozen: true },
    });
    const frozenTrueAll = await prisma.pairwisePoolFinalizeMeta.count({ where: { frozen: true } });

    let finRows = [];
    if (finalizeTotalWindow > 0) {
      finRows = await prisma.pairwisePoolFinalizeMeta.findMany({
        where: finWhere,
        select: { meta: true, frozen: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: Math.min(limit, finalizeTotalWindow),
      });
    }
    const metaStatsSampled = finalizeTotalWindow > limit;

    const wouldTrue = { n: 0, den: 0 };
    const fallbackReason = new Map();
    const pairwiseRec = new Map();
    let appliedFinal = 0;
    let appliedWorker = 0;
    const metaParseErrors = [];

    for (const row of finRows) {
      const parsed = parseFinalizeMetaRow(row.meta, metaParseErrors);
      if (!parsed) continue;
      if (typeof parsed.wouldChangeStaticResult === "boolean") {
        wouldTrue.den += 1;
        if (parsed.wouldChangeStaticResult) wouldTrue.n += 1;
      }
      if (parsed.fallbackReason != null) bump(fallbackReason, String(parsed.fallbackReason));
      if (parsed.pairwiseProposalRecommendation != null) {
        bump(pairwiseRec, String(parsed.pairwiseProposalRecommendation));
      }
      if (parsed.appliedToFinalScore === true) appliedFinal += 1;
      if (parsed.appliedToWorkerRanking === true) appliedWorker += 1;
    }

    report.finalizeMeta = {
      totalInWindow: finalizeTotalWindow,
      totalAllTime: finalizeTotalAll,
      frozenTrueInWindow: frozenTrueWindow,
      frozenTrueAllTime: frozenTrueAll,
      metaStatsSampled,
      metaRowsParsed: finRows.length,
      wouldChangeStaticResult: {
        trueCount: wouldTrue.n,
        parsedBooleanCount: wouldTrue.den,
        rateOverParsed: rate(wouldTrue.n, wouldTrue.den),
      },
      fallbackReasonDistribution: mapToObj(fallbackReason),
      pairwiseProposalRecommendationDistribution: mapToObj(pairwiseRec),
      appliedToFinalScoreTrueCountAmongParsed: appliedFinal,
      appliedToWorkerRankingTrueCountAmongParsed: appliedWorker,
      appliedFlagsDenominatorRows: finRows.length,
      metaParseErrorCount: metaParseErrors.length,
      metaParseErrorBuckets: mapToObj(
        metaParseErrors.reduce((m, e) => {
          bump(m, e);
          return m;
        }, new Map()),
      ),
    };

    /* --- Match / preview base --- */
    const matchResultsTotal = await prisma.matchResult.count();
    const previewPoolsTotal = await prisma.previewPool.count();

    const poolsWithFinalize = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS c
      FROM "pairwise_pool_finalize_meta" m
      WHERE EXISTS (
        SELECT 1 FROM "preview_pools" p
        WHERE p."id" = m."poolId" AND p."userId" = m."viewerUserId"
      )
    `;

    const poolsWithSucceededSim = await prisma.$queryRaw`
      SELECT COUNT(DISTINCT j."poolId")::int AS c
      FROM "ai_simulation_v1_jobs" j
      WHERE j."jobStatus" = 'succeeded'
        AND j."updatedAt" >= ${since}
    `;

    report.matchAndPreview = {
      matchResultsTotal,
      previewPoolsTotal,
      previewPoolsWithFinalizeMetaRow: Number(poolsWithFinalize[0]?.c ?? 0),
      distinctPreviewPoolsWithSucceededSimulationInWindow: Number(poolsWithSucceededSim[0]?.c ?? 0),
    };

    /* --- M4.2 hint (no parsing of committed JSON reports) --- */
    const m42Sanitized = path.join(MONOREPO_ROOT, "docs", "M4", "M4.2-batch-regression-sanitized-run-record.md");
    report.m42AlignmentHint = {
      message:
        "Four-source agreement / disagreement rates are produced by m4-2-batch-regression-report.mjs (M4.2); this script does not re-run MatchingDecisionComparisonService.",
      suggestedScript: "packages/database/scripts/m4-2-batch-regression-report.mjs",
      sanitizedRunRecordPath: fs.existsSync(m42Sanitized)
        ? "docs/M4/M4.2-batch-regression-sanitized-run-record.md"
        : null,
    };

    /* --- Console --- */
    console.log("=== M4.4-M1 Admin observability summary ===");
    console.log(`sourceVersion=${SOURCE_VERSION} since=${since.toISOString()} sinceDays=${sinceDays} metaParseCap=${limit}`);
    console.log("\n-- Pairwise (in window) --");
    console.log(`total: ${pairwiseTotal}`);
    console.log(`status: ${JSON.stringify(pwStatusDist)}`);
    console.log(`fallbackUsed true/false/null: ${pwFbTrue} / ${pwFbFalse} / ${pwFbNull} (rate true/all: ${rate(pwFbTrue, pairwiseTotal)})`);
    console.log(`failureDetail.code: ${JSON.stringify(failureDetailCodeDist)}`);
    console.log(`schema_validation (pairwise): ${schemaValidationPairwise}`);
    console.log(`sourceVersion: ${JSON.stringify(sourceVersionDist)}`);

    console.log("\n-- AI simulation (items scoped to jobs in window) --");
    console.log(`jobStatus: ${JSON.stringify(jobStatusDist)}`);
    console.log(`item status: ${JSON.stringify(itemStatusDist)}`);
    console.log(`item errorCode: ${JSON.stringify(itemErrorCodeDist)}`);
    console.log(`failed items: ${failedItemCount}`);
    console.log(`schema_validation items: ${schemaValidationSimItems}`);

    console.log("\n-- Finalize meta --");
    console.log(`total window/all: ${finalizeTotalWindow} / ${finalizeTotalAll}`);
    console.log(`frozen true window/all: ${frozenTrueWindow} / ${frozenTrueAll}`);
    console.log(`meta parsed rows: ${finRows.length} sampled=${metaStatsSampled}`);
    console.log(`wouldChangeStaticResult: ${wouldTrue.n}/${wouldTrue.den} (rate ${rate(wouldTrue.n, wouldTrue.den)})`);
    console.log(`fallbackReason dist: ${JSON.stringify(mapToObj(fallbackReason))}`);
    console.log(`pairwiseProposalRecommendation dist: ${JSON.stringify(mapToObj(pairwiseRec))}`);
    console.log(`appliedToFinalScore true (parsed): ${appliedFinal}`);
    console.log(`appliedToWorkerRanking true (parsed): ${appliedWorker}`);
    if (metaParseErrors.length) {
      console.log(`meta parse issues: ${metaParseErrors.length} (see JSON metaParseErrorBuckets)`);
    }

    console.log("\n-- Match / preview --");
    console.log(`match_results total: ${matchResultsTotal}`);
    console.log(`preview_pools total: ${previewPoolsTotal}`);
    console.log(`preview pools with finalize meta (join-valid): ${Number(poolsWithFinalize[0]?.c ?? 0)}`);
    console.log(`distinct poolIds with succeeded sim job (window): ${Number(poolsWithSucceededSim[0]?.c ?? 0)}`);

    console.log("\n-- M4.2 / M4.1 --");
    console.log(report.m42AlignmentHint.message);
    console.log(`Suggested: ${report.m42AlignmentHint.suggestedScript}`);
    if (report.m42AlignmentHint.sanitizedRunRecordPath) {
      console.log(`Sanitized doc: ${report.m42AlignmentHint.sanitizedRunRecordPath}`);
    }

    const jsonAbs = jsonPath ? (path.isAbsolute(jsonPath) ? jsonPath : path.join(MONOREPO_ROOT, jsonPath)) : "";
    if (jsonAbs) {
      fs.mkdirSync(path.dirname(jsonAbs), { recursive: true });
      fs.writeFileSync(jsonAbs, JSON.stringify(report, null, 2), "utf8");
      console.log(`\nWrote JSON: ${jsonAbs}`);
    }

    const mdAbs = markdownPath ? (path.isAbsolute(markdownPath) ? markdownPath : path.join(MONOREPO_ROOT, markdownPath)) : "";
    if (mdAbs) {
      const lines = [
        `# M4.4-M1 observability summary`,
        ``,
        `- **Generated**: ${report.generatedAt}`,
        `- **Window**: last **${sinceDays}** days (UTC midnight anchor), \`since\`=${report.window.sinceUtc}`,
        `- **sourceVersion**: \`${SOURCE_VERSION}\``,
        ``,
        `## Pairwise (\`ai_pairwise_decision_jobs\`, in window)`,
        ``,
        `| Metric | Value |`,
        `|--------|-------|`,
        `| total | ${pairwiseTotal} |`,
        `| fallbackUsed true | ${pwFbTrue} (rate vs all: ${rate(pwFbTrue, pairwiseTotal)}) |`,
        `| schema_validation | ${schemaValidationPairwise} |`,
        ``,
        `### status`,
        ``,
        ...Object.entries(pwStatusDist).map(([k, v]) => `- **${k}**: ${v}`),
        ``,
        `### failureDetail.code`,
        ``,
        ...Object.entries(failureDetailCodeDist).map(([k, v]) => `- **${k}**: ${v}`),
        ``,
        `## Simulation`,
        ``,
        `| Metric | Value |`,
        `|--------|-------|`,
        `| failed items (window) | ${failedItemCount} |`,
        `| schema_validation items (window) | ${schemaValidationSimItems} |`,
        ``,
        `### jobStatus`,
        ``,
        ...Object.entries(jobStatusDist).map(([k, v]) => `- **${k}**: ${v}`),
        ``,
        `### item errorCode`,
        ``,
        ...Object.entries(itemErrorCodeDist).map(([k, v]) => `- **${k}**: ${v}`),
        ``,
        `## Finalize meta`,
        ``,
        `| Metric | Value |`,
        `|--------|-------|`,
        `| total (window / all) | ${finalizeTotalWindow} / ${finalizeTotalAll} |`,
        `| frozen true (window / all) | ${frozenTrueWindow} / ${frozenTrueAll} |`,
        `| meta rows parsed | ${finRows.length} (sampled=${metaStatsSampled}) |`,
        `| wouldChangeStaticResult true / parsed | ${wouldTrue.n} / ${wouldTrue.den} |`,
        ``,
        `## Match / preview`,
        ``,
        `| Metric | Value |`,
        `|--------|-------|`,
        `| match_results total | ${matchResultsTotal} |`,
        `| preview_pools total | ${previewPoolsTotal} |`,
        `| pools with finalize+preview join | ${poolsWithFinalize[0]?.c ?? 0} |`,
        `| distinct pools succeeded sim (window) | ${poolsWithSucceededSim[0]?.c ?? 0} |`,
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
