import type { PrismaClient } from "@prisma/client";
import {
  clampMatchingObservabilityLimit,
  clampMatchingObservabilitySinceDays,
  MATCHING_OBSERVABILITY_SCHEMA_VERSION,
  MATCHING_OBSERVABILITY_SOURCE_VERSION,
  sinceDateUtcForMatchingObservability,
} from "./matching-observability-summary.constants";
import type {
  BuildMatchingObservabilitySummaryOptions,
  MatchingObservabilitySummaryReport,
} from "./matching-observability-summary.types";

function rate(num: number, den: number): number | null {
  if (den <= 0) return null;
  return Math.round((num / den) * 10_000) / 10_000;
}

function bump(map: Map<string, number>, key: unknown, n = 1): void {
  const k = key == null || key === "" ? "(empty)" : String(key);
  map.set(k, (map.get(k) || 0) + n);
}

function mapToObj(m: Map<string, number>): Record<string, number> {
  const o: Record<string, number> = {};
  for (const [k, v] of [...m.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )) {
    o[k] = v;
  }
  return o;
}

/** Safe meta fields only; never return raw meta object. */
function parseFinalizeMetaRow(
  metaUnknown: unknown,
  parseErrors: string[],
): Record<string, string | number | boolean> | null {
  if (metaUnknown == null) {
    parseErrors.push("null_meta");
    return null;
  }
  let m: unknown = metaUnknown;
  if (typeof m === "string") {
    try {
      m = JSON.parse(m) as unknown;
    } catch {
      parseErrors.push("json_string_parse_fail");
      return null;
    }
  }
  if (typeof m !== "object" || m === null || Array.isArray(m)) {
    parseErrors.push("meta_not_object");
    return null;
  }
  const o: Record<string, string | number | boolean> = {};
  const record = m as Record<string, unknown>;
  for (const key of [
    "wouldChangeStaticResult",
    "fallbackReason",
    "pairwiseProposalRecommendation",
    "appliedToFinalScore",
    "appliedToWorkerRanking",
  ]) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
    const v = record[key];
    if (typeof v === "boolean" || typeof v === "string" || typeof v === "number") {
      o[key] = v;
    } else if (v === null) {
      o[key] = "(null)";
    } else if (typeof v === "object") {
      o[key] = "(object_omitted)";
    }
  }
  return o;
}

/**
 * Read-only aggregation for Admin matching observability (M4.4-M1 / P7.11-r1).
 * No writes; no ID lists; no raw meta / prompts / transcripts.
 */
export async function buildMatchingObservabilitySummary(
  prisma: PrismaClient,
  options: BuildMatchingObservabilitySummaryOptions,
): Promise<MatchingObservabilitySummaryReport> {
  const limit = clampMatchingObservabilityLimit(options.limit);
  const sinceDays = clampMatchingObservabilitySinceDays(options.sinceDays);
  const since = sinceDateUtcForMatchingObservability(sinceDays);
  const generatedAt = (options.generatedAt ?? new Date()).toISOString();

  const report: MatchingObservabilitySummaryReport = {
    schemaVersion: MATCHING_OBSERVABILITY_SCHEMA_VERSION,
    sourceVersion: MATCHING_OBSERVABILITY_SOURCE_VERSION,
    generatedAt,
    window: { sinceDays, sinceUtc: since.toISOString(), rowCapForMetaParse: limit },
    notes: [
      "Pairwise failureDetail.code distribution uses full time window (SQL aggregate).",
      "Finalize meta field distributions: rows in window; if count exceeds rowCapForMetaParse, only the most recent N rows are parsed (see finalizeMeta.metaStatsSampled).",
      "M4.1 four-source agreement rate is not recomputed here; use packages/database/scripts/m4-2-batch-regression-report.mjs.",
      "Sanitized narrative reference: docs/M4/M4.2-batch-regression-sanitized-run-record.md (if present).",
    ],
    pairwise: {
      totalInWindow: 0,
      statusDistribution: {},
      sourceVersionDistribution: {},
      fallbackUsed: {
        trueCount: 0,
        falseCount: 0,
        nullCount: 0,
        rateDenominatorAll: 0,
        rateTrueOverAll: null,
      },
      failureDetailCodeDistribution: {},
      schemaValidationCount: 0,
    },
    simulation: {
      jobStatusDistributionInWindow: {},
      itemStatusDistributionInWindow: {},
      itemErrorCodeDistributionInWindow: {},
      failedItemCountInWindow: 0,
      schemaValidationItemCountInWindow: 0,
    },
    finalizeMeta: {
      totalInWindow: 0,
      totalAllTime: 0,
      frozenTrueInWindow: 0,
      frozenTrueAllTime: 0,
      metaStatsSampled: false,
      metaRowsParsed: 0,
      wouldChangeStaticResult: {
        trueCount: 0,
        parsedBooleanCount: 0,
        rateOverParsed: null,
      },
      fallbackReasonDistribution: {},
      pairwiseProposalRecommendationDistribution: {},
      appliedToFinalScoreTrueCountAmongParsed: 0,
      appliedToWorkerRankingTrueCountAmongParsed: 0,
      appliedFlagsDenominatorRows: 0,
      metaParseErrorCount: 0,
      metaParseErrorBuckets: {},
    },
    matchAndPreview: {
      matchResultsTotal: 0,
      previewPoolsTotal: 0,
      previewPoolsWithFinalizeMetaRow: 0,
      distinctPreviewPoolsWithSucceededSimulationInWindow: 0,
    },
    m42AlignmentHint: {
      message:
        "Four-source agreement / disagreement rates are produced by m4-2-batch-regression-report.mjs (M4.2); this script does not re-run MatchingDecisionComparisonService.",
      suggestedScript: "packages/database/scripts/m4-2-batch-regression-report.mjs",
      sanitizedRunRecordPath: options.m42SanitizedRunRecordExists
        ? "docs/M4/M4.2-batch-regression-sanitized-run-record.md"
        : null,
    },
  };

  const pwWhere = { updatedAt: { gte: since } };
  const pairwiseTotal = await prisma.aiPairwiseDecisionJob.count({ where: pwWhere });
  const pwStatus = await prisma.aiPairwiseDecisionJob.groupBy({
    by: ["status"],
    where: pwWhere,
    _count: true,
  });
  const pwStatusDist: Record<string, number> = {};
  for (const row of pwStatus) {
    pwStatusDist[row.status] = row._count;
  }

  const pwSource = await prisma.aiPairwiseDecisionJob.groupBy({
    by: ["sourceVersion"],
    where: pwWhere,
    _count: true,
  });
  const sourceVersionDist: Record<string, number> = {};
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

  const codeRows = await prisma.$queryRaw<Array<{ code: string; c: number | bigint }>>`
    SELECT COALESCE("failureDetail"->>'code', '(null)') AS code, COUNT(*)::int AS c
    FROM "ai_pairwise_decision_jobs"
    WHERE "updatedAt" >= ${since}
    GROUP BY 1
  `;
  const failureDetailCodeDist: Record<string, number> = {};
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

  const simJobWhere = { updatedAt: { gte: since } };
  const simJobStatus = await prisma.aiSimulationV1Job.groupBy({
    by: ["jobStatus"],
    where: simJobWhere,
    _count: true,
  });
  const jobStatusDist: Record<string, number> = {};
  for (const row of simJobStatus) {
    jobStatusDist[row.jobStatus] = row._count;
  }

  const itemWhere = { job: { updatedAt: { gte: since } } };
  const itemStatus = await prisma.aiSimulationV1Item.groupBy({
    by: ["status"],
    where: itemWhere,
    _count: true,
  });
  const itemStatusDist: Record<string, number> = {};
  for (const row of itemStatus) {
    itemStatusDist[row.status] = row._count;
  }

  const itemError = await prisma.aiSimulationV1Item.groupBy({
    by: ["errorCode"],
    where: itemWhere,
    _count: true,
  });
  const itemErrorCodeDist: Record<string, number> = {};
  for (const row of itemError) {
    const k = row.errorCode == null ? "(null)" : row.errorCode;
    itemErrorCodeDist[k] = row._count;
  }

  const failedItemCount = await prisma.aiSimulationV1Item.count({
    where: { ...itemWhere, status: "failed" },
  });

  const simSchemaRows = await prisma.$queryRaw<Array<{ c: number | bigint }>>`
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

  const finWhere = { updatedAt: { gte: since } };
  const finalizeTotalWindow = await prisma.pairwisePoolFinalizeMeta.count({ where: finWhere });
  const finalizeTotalAll = await prisma.pairwisePoolFinalizeMeta.count();
  const frozenTrueWindow = await prisma.pairwisePoolFinalizeMeta.count({
    where: { ...finWhere, frozen: true },
  });
  const frozenTrueAll = await prisma.pairwisePoolFinalizeMeta.count({ where: { frozen: true } });

  let finRows: Array<{ meta: unknown; frozen: boolean; updatedAt: Date }> = [];
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
  const fallbackReason = new Map<string, number>();
  const pairwiseRec = new Map<string, number>();
  let appliedFinal = 0;
  let appliedWorker = 0;
  const metaParseErrors: string[] = [];

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
      }, new Map<string, number>()),
    ),
  };

  const matchResultsTotal = await prisma.matchResult.count();
  const previewPoolsTotal = await prisma.previewPool.count();

  const poolsWithFinalize = await prisma.$queryRaw<Array<{ c: number | bigint }>>`
    SELECT COUNT(*)::int AS c
    FROM "pairwise_pool_finalize_meta" m
    WHERE EXISTS (
      SELECT 1 FROM "preview_pools" p
      WHERE p."id" = m."poolId" AND p."userId" = m."viewerUserId"
    )
  `;

  const poolsWithSucceededSim = await prisma.$queryRaw<Array<{ c: number | bigint }>>`
    SELECT COUNT(DISTINCT j."poolId")::int AS c
    FROM "ai_simulation_v1_jobs" j
    WHERE j."jobStatus" = 'succeeded'
      AND j."updatedAt" >= ${since}
  `;

  report.matchAndPreview = {
    matchResultsTotal,
    previewPoolsTotal,
    previewPoolsWithFinalizeMetaRow: Number(poolsWithFinalize[0]?.c ?? 0),
    distinctPreviewPoolsWithSucceededSimulationInWindow: Number(
      poolsWithSucceededSim[0]?.c ?? 0,
    ),
  };

  return report;
}
