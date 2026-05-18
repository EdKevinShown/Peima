/**
 * P7.10-r3f3 — Dev-only canonical match result sidecar writer runner.
 *
 * From `apps/api` after `pnpm run build`:
 *   pnpm run p710:r3f3:canonical-sidecar-writer-smoke
 *   pnpm run p710:r3f3:canonical-sidecar-writer-smoke -- --insert=true --cleanup=true
 *
 * Never writes MatchResult / matchInsights. Sidecar table only when --insert=true.
 */
import "reflect-metadata";
import * as fs from "node:fs";
import * as path from "node:path";
import * as dotenv from "dotenv";
import { NestFactory } from "@nestjs/core";
import { PrismaService } from "../common/prisma/prisma.service";
import { buildP76CanonicalWriterDryRunPayloadV1 } from "../modules/matching/p76-canonical-writer-dry-run-builder";
import { P76_CANONICAL_WRITER_DRY_RUN_SOURCE_VERSION } from "../modules/matching/p76-canonical-writer-dry-run.types";
import {
  dryRunP76CanonicalMatchResultSidecarWriter,
  insertOnlyP76CanonicalMatchResultSidecarWriter,
  readP76CanonicalMatchResultSidecarWriterEnv,
} from "../modules/matching/p76-canonical-match-result-sidecar-writer";
import type { P76CanonicalMatchResultSidecarWriterInputV1 } from "../modules/matching/p76-canonical-match-result-sidecar-writer.types";
import { P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_SOURCE_VERSION } from "../modules/matching/p76-canonical-match-result-sidecar-writer.types";
import {
  evaluateP76CanonicalMatchResultSidecarWriterSmokePass,
  formatP76CanonicalMatchResultSidecarWriterSmokeMarkdown,
  P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_SMOKE_SOURCE_TYPE,
  P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_SMOKE_SOURCE_VERSION,
  type P76CanonicalMatchResultSidecarWriterSmokeSummaryV1,
  type P76CanonicalMatchResultSidecarWriterSmokeVerifyV1,
} from "../modules/matching/p76-canonical-match-result-sidecar-writer-smoke-artifact";
import {
  P710R3f3CliArgsError,
  parseP710R3f3CanonicalSidecarWriterCliArgs,
  type P710R3f3CanonicalSidecarWriterCliArgs,
} from "./p710-r3f3-canonical-sidecar-writer-cli-args";
import { P710R3f3CanonicalSidecarWriterRunnerModule } from "./p710-r3f3-canonical-sidecar-writer-runner.module";

function stageSummaryFor(candidateId: string) {
  return {
    stage1PhotoVisual: {
      sourceVersion: "p7.6-stage1-v1",
      selectedCandidateIds: [candidateId],
      topCandidatesSummary: [
        { candidateUserId: candidateId, mutualPhotoVisualFit: 0.7, rank: 1 },
      ],
    },
    stage2Ranking: {
      sourceVersion: "p7.6-stage2-v1",
      top2CandidateIds: [candidateId, "cand-r3f3-other"],
      selectedBy20DOnlyCandidateId: candidateId,
      rankedCandidatesSummary: [
        { candidateUserId: candidateId, mutual20DFit: 0.8, rank: 1 },
      ],
    },
    stage3Rrm: {
      sourceVersion: "p7.6-stage3-v1",
      selectedByRrmCandidateId: candidateId,
      rankedCandidatesSummary: [
        { candidateUserId: candidateId, mutualRrmFit: 0.75, rank: 1 },
      ],
      reasonSummary: "RRM selected top mutual fit",
    },
  };
}

function eligiblePayloadFor(viewerUserId: string, candidateId: string) {
  const stages = stageSummaryFor(candidateId);
  const p = buildP76CanonicalWriterDryRunPayloadV1({
    viewerUserId,
    viewerAllowlist: [viewerUserId],
    sourceVersion: P76_CANONICAL_WRITER_DRY_RUN_SOURCE_VERSION,
    cohortSourceVersion: P76_CANONICAL_WRITER_DRY_RUN_SOURCE_VERSION,
    stage1PhotoVisual: stages.stage1PhotoVisual,
    stage2Ranking: stages.stage2Ranking,
    stage3Rrm: stages.stage3Rrm,
    score: 0.88,
    candidateExists: true,
  });
  return {
    ...p,
    sourceVersion: P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_SOURCE_VERSION,
  };
}

/** Synthetic local smoke rows (no real user ids). */
export function buildP710R3f3SyntheticSidecarWriterInput(
  auditRunId: string,
  environment: "dev" | "staging",
): P76CanonicalMatchResultSidecarWriterInputV1 {
  const ineligible = buildP76CanonicalWriterDryRunPayloadV1({
    viewerUserId: "  ",
    sourceVersion: P76_CANONICAL_WRITER_DRY_RUN_SOURCE_VERSION,
  });

  return {
    auditRunId,
    environment,
    rows: [
      {
        dryRunPayload: eligiblePayloadFor("r3f3-viewer-1", "r3f3-cand-1"),
        matchResultId: null,
      },
      {
        dryRunPayload: eligiblePayloadFor("r3f3-viewer-2", "r3f3-cand-2"),
        matchResultId: null,
      },
      {
        dryRunPayload: {
          ...ineligible,
          sourceVersion: P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_SOURCE_VERSION,
        },
      },
    ],
  };
}

function loadDotenvFromCommonLocations(): void {
  const here = __dirname;
  for (const p of [
    path.join(here, "../../.env"),
    path.join(here, "../../../.env"),
  ]) {
    dotenv.config({ path: p });
  }
}

function resolvePath(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

export function resolveP710R3f3ArtifactPath(filePath: string): string {
  const direct = resolvePath(filePath);
  if (fs.existsSync(direct)) return direct;

  const parts = filePath.split(/[/\\]/).filter((x) => x !== ".." && x !== ".");
  const fromApi = path.resolve(process.cwd(), "..", "..", ...parts);
  if (fs.existsSync(fromApi)) return fromApi;

  const fromRoot = path.resolve(process.cwd(), ...parts);
  if (fs.existsSync(fromRoot)) return fromRoot;

  return direct;
}

export function buildP710R3f3SidecarWriterEnvForCli(
  args: P710R3f3CanonicalSidecarWriterCliArgs,
  base: NodeJS.ProcessEnv = process.env,
): ReturnType<typeof readP76CanonicalMatchResultSidecarWriterEnv> {
  const merged: NodeJS.ProcessEnv = {
    ...base,
    PEIMA_P76_CANONICAL_SIDECAR_WRITER_ENVIRONMENT: args.environment,
    NODE_ENV: base.NODE_ENV === "production" ? "development" : base.NODE_ENV,
  };
  if (args.insert) {
    merged.PEIMA_P76_CANONICAL_SIDECAR_WRITER_ENABLED = "1";
    merged.PEIMA_P76_CANONICAL_SIDECAR_WRITER_DRY_RUN = "0";
    merged.PEIMA_P76_CANONICAL_SIDECAR_WRITER_ALLOW_DB_WRITE = "1";
    merged.PEIMA_P76_CANONICAL_SIDECAR_WRITER_KILL_SWITCH = "0";
  } else {
    merged.PEIMA_P76_CANONICAL_SIDECAR_WRITER_ENABLED =
      base.PEIMA_P76_CANONICAL_SIDECAR_WRITER_ENABLED ?? "1";
    merged.PEIMA_P76_CANONICAL_SIDECAR_WRITER_DRY_RUN = "1";
    merged.PEIMA_P76_CANONICAL_SIDECAR_WRITER_ALLOW_DB_WRITE = "0";
  }
  return readP76CanonicalMatchResultSidecarWriterEnv(merged);
}

export function assertP710R3f3InsertAllowed(
  args: P710R3f3CanonicalSidecarWriterCliArgs,
  writerEnv: ReturnType<typeof readP76CanonicalMatchResultSidecarWriterEnv>,
): void {
  if (!args.insert) return;
  if (process.env.NODE_ENV === "production") {
    throw new Error("P7.10-r3f3: insert blocked when NODE_ENV=production");
  }
  if (writerEnv.environment === "production") {
    throw new Error("P7.10-r3f3: insert blocked for production environment");
  }
  if (!writerEnv.canInsert) {
    throw new Error(
      `P7.10-r3f3: insert gates not satisfied (blockedReason=${writerEnv.blockedReason ?? "unknown"})`,
    );
  }
}

export async function verifyP76CanonicalMatchResultSidecarRowsForAuditRun(
  prisma: PrismaService,
  auditRunId: string,
): Promise<P76CanonicalMatchResultSidecarWriterSmokeVerifyV1> {
  const rows = await prisma.p76CanonicalMatchResultMeta.findMany({
    where: { auditRunId },
    select: {
      appliedToMatchResult: true,
      appliedToFinalScore: true,
      appliedToWorkerRanking: true,
      promotionStatus: true,
    },
  });

  let appliedToMatchResultTrueCount = 0;
  let appliedToFinalScoreTrueCount = 0;
  let appliedToWorkerRankingTrueCount = 0;
  let promotionStatusNotPromotedCount = 0;

  for (const row of rows) {
    if (row.appliedToMatchResult === true) appliedToMatchResultTrueCount += 1;
    if (row.appliedToFinalScore === true) appliedToFinalScoreTrueCount += 1;
    if (row.appliedToWorkerRanking === true) appliedToWorkerRankingTrueCount += 1;
    if (row.promotionStatus === "not_promoted") {
      promotionStatusNotPromotedCount += 1;
    }
  }

  return {
    rowCount: rows.length,
    appliedToMatchResultTrueCount,
    appliedToFinalScoreTrueCount,
    appliedToWorkerRankingTrueCount,
    promotionStatusNotPromotedCount,
  };
}

export async function countP76CanonicalMatchResultSidecarRowsForAuditRun(
  prisma: PrismaService,
  auditRunId: string,
): Promise<number> {
  return prisma.p76CanonicalMatchResultMeta.count({ where: { auditRunId } });
}

export async function cleanupP76CanonicalMatchResultSidecarRowsByAuditRunId(
  prisma: PrismaService,
  auditRunId: string,
): Promise<number> {
  const deleted = await prisma.p76CanonicalMatchResultMeta.deleteMany({
    where: { auditRunId },
  });
  return deleted.count;
}

export function writeP710R3f3SmokeSummaryArtifacts(
  summary: P76CanonicalMatchResultSidecarWriterSmokeSummaryV1,
  opts: { jsonPath: string; mdPath: string; pretty?: boolean },
): void {
  const jsonPath = resolvePath(opts.jsonPath);
  const mdPath = resolvePath(opts.mdPath);
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.mkdirSync(path.dirname(mdPath), { recursive: true });
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(summary, null, opts.pretty ? 2 : undefined),
    "utf8",
  );
  fs.writeFileSync(
    mdPath,
    formatP76CanonicalMatchResultSidecarWriterSmokeMarkdown(summary),
    "utf8",
  );
}

function narrowSidecarWriterPrisma(prisma: PrismaService) {
  return {
    p76CanonicalMatchResultMeta: {
      create: (args: { data: Record<string, unknown> }) =>
        prisma.p76CanonicalMatchResultMeta.create(
          args as Parameters<
            typeof prisma.p76CanonicalMatchResultMeta.create
          >[0],
        ),
    },
  };
}

export async function runP710R3f3CanonicalSidecarWriterMain(
  argv: string[] = process.argv.slice(2),
): Promise<P76CanonicalMatchResultSidecarWriterSmokeSummaryV1> {
  loadDotenvFromCommonLocations();

  let args: P710R3f3CanonicalSidecarWriterCliArgs;
  try {
    args = parseP710R3f3CanonicalSidecarWriterCliArgs(argv);
  } catch (err) {
    if (err instanceof P710R3f3CliArgsError) throw err;
    throw err;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL missing; set in .env (repo root or apps/api).");
  }

  const auditRunId = args.auditRunId.trim();
  const writerInput = buildP710R3f3SyntheticSidecarWriterInput(
    auditRunId,
    args.environment,
  );
  const writerEnv = buildP710R3f3SidecarWriterEnvForCli(args);
  assertP710R3f3InsertAllowed(args, writerEnv);

  const app = await NestFactory.createApplicationContext(
    P710R3f3CanonicalSidecarWriterRunnerModule,
    { logger: false },
  );

  try {
    const prisma = app.get(PrismaService);
    const narrowPrisma = narrowSidecarWriterPrisma(prisma);

    let insertedCount = 0;
    let duplicateCount = 0;
    let skippedCount = 0;
    let blockedCount = 0;
    let attemptedCount = writerInput.rows.length;
    let mode: "dry_run" | "insert_only" = args.insert ? "insert_only" : "dry_run";

    if (args.insert) {
      const first = await insertOnlyP76CanonicalMatchResultSidecarWriter(
        writerInput,
        { prisma: narrowPrisma, writerEnv },
      );
      insertedCount = first.insertedCount;
      duplicateCount = first.duplicateCount;
      skippedCount = first.skippedCount;
      blockedCount = first.blockedCount;
      attemptedCount = first.attemptedCount;

      let verify = await verifyP76CanonicalMatchResultSidecarRowsForAuditRun(
        prisma,
        auditRunId,
      );

      if (args.verify) {
        if (verify.appliedToMatchResultTrueCount > 0) {
          throw new Error("P7.10-r3f3: appliedToMatchResultTrueCount must be 0");
        }
        if (verify.appliedToFinalScoreTrueCount > 0) {
          throw new Error("P7.10-r3f3: appliedToFinalScoreTrueCount must be 0");
        }
        if (verify.appliedToWorkerRankingTrueCount > 0) {
          throw new Error(
            "P7.10-r3f3: appliedToWorkerRankingTrueCount must be 0",
          );
        }
        if (
          insertedCount > 0 &&
          verify.promotionStatusNotPromotedCount !== verify.rowCount
        ) {
          throw new Error(
            "P7.10-r3f3: promotionStatus not_promoted must match row count",
          );
        }
      }

      let duplicateProbe:
        | P76CanonicalMatchResultSidecarWriterSmokeSummaryV1["duplicateProbe"]
        | undefined;

      if (args.includeDuplicateProbe) {
        const rowCountBefore = verify.rowCount;
        const second = await insertOnlyP76CanonicalMatchResultSidecarWriter(
          writerInput,
          { prisma: narrowPrisma, writerEnv },
        );
        duplicateCount += second.duplicateCount;
        const rowCountAfter = await countP76CanonicalMatchResultSidecarRowsForAuditRun(
          prisma,
          auditRunId,
        );
        duplicateProbe = {
          duplicateCount: second.duplicateCount,
          rowCountAfter,
          rowCountUnchanged: rowCountAfter === rowCountBefore,
        };
        if (args.verify && second.duplicateCount <= 0) {
          throw new Error("P7.10-r3f3: duplicate probe expected duplicateCount > 0");
        }
        verify = await verifyP76CanonicalMatchResultSidecarRowsForAuditRun(
          prisma,
          auditRunId,
        );
      }

      let deletedCount = 0;
      let finalRowsForAuditRunId = verify.rowCount;

      if (args.cleanup) {
        deletedCount = await cleanupP76CanonicalMatchResultSidecarRowsByAuditRunId(
          prisma,
          auditRunId,
        );
        finalRowsForAuditRunId =
          await countP76CanonicalMatchResultSidecarRowsForAuditRun(
            prisma,
            auditRunId,
          );
        if (args.verify && finalRowsForAuditRunId !== 0) {
          throw new Error("P7.10-r3f3: cleanup must leave zero rows for auditRunId");
        }
      }

      const summary: P76CanonicalMatchResultSidecarWriterSmokeSummaryV1 = {
        generatedAt: new Date().toISOString(),
        sourceType: P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_SMOKE_SOURCE_TYPE,
        sourceVersion: P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_SMOKE_SOURCE_VERSION,
        auditRunId,
        environment: args.environment,
        mode,
        attemptedCount,
        insertedCount,
        duplicateCount,
        skippedCount,
        blockedCount,
        verify,
        cleanup: {
          requested: args.cleanup,
          deletedCount,
          finalRowsForAuditRunId,
        },
        safety: {
          matchResultTouched: false,
          workerTouched: false,
          getTouched: false,
        },
        duplicateProbe,
        pass: false,
      };
      summary.pass = evaluateP76CanonicalMatchResultSidecarWriterSmokePass(summary);

      const summaryJsonPath = resolveP710R3f3ArtifactPath(args.outputJsonPath);
      const summaryMdPath = resolveP710R3f3ArtifactPath(args.outputMdPath);
      writeP710R3f3SmokeSummaryArtifacts(summary, {
        jsonPath: summaryJsonPath,
        mdPath: summaryMdPath,
        pretty: args.pretty,
      });

      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify(
          {
            sourceVersion: summary.sourceVersion,
            auditRunId: summary.auditRunId,
            mode: summary.mode,
            insertedCount: summary.insertedCount,
            duplicateCount: summary.duplicateCount,
            verify: summary.verify,
            cleanup: summary.cleanup,
            pass: summary.pass,
            outputJson: summaryJsonPath,
          },
          null,
          2,
        ),
      );

      if (!summary.pass) {
        throw new Error("P7.10-r3f3: smoke summary pass=false");
      }

      return summary;
    }

    const dry = dryRunP76CanonicalMatchResultSidecarWriter(writerInput, writerEnv);
    insertedCount = dry.insertedCount;
    duplicateCount = dry.duplicateCount;
    skippedCount = dry.skippedCount;
    blockedCount = dry.blockedCount;
    attemptedCount = dry.attemptedCount;
    mode = "dry_run";

    const summary: P76CanonicalMatchResultSidecarWriterSmokeSummaryV1 = {
      generatedAt: new Date().toISOString(),
      sourceType: P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_SMOKE_SOURCE_TYPE,
      sourceVersion: P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_SMOKE_SOURCE_VERSION,
      auditRunId,
      environment: args.environment,
      mode,
      attemptedCount,
      insertedCount,
      duplicateCount,
      skippedCount,
      blockedCount,
      verify: {
        rowCount: 0,
        appliedToMatchResultTrueCount: 0,
        appliedToFinalScoreTrueCount: 0,
        appliedToWorkerRankingTrueCount: 0,
        promotionStatusNotPromotedCount: 0,
      },
      cleanup: {
        requested: false,
        deletedCount: 0,
        finalRowsForAuditRunId: 0,
      },
      safety: {
        matchResultTouched: false,
        workerTouched: false,
        getTouched: false,
      },
      pass: false,
    };
    summary.pass = evaluateP76CanonicalMatchResultSidecarWriterSmokePass(summary);

    const summaryJsonPath = resolveP710R3f3ArtifactPath(args.outputJsonPath);
    const summaryMdPath = resolveP710R3f3ArtifactPath(args.outputMdPath);
    writeP710R3f3SmokeSummaryArtifacts(summary, {
      jsonPath: summaryJsonPath,
      mdPath: summaryMdPath,
      pretty: args.pretty,
    });

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          sourceVersion: summary.sourceVersion,
          auditRunId: summary.auditRunId,
          mode: summary.mode,
          mappedCount: dry.mappedCount,
          skippedCount: dry.skippedCount,
          pass: summary.pass,
          outputJson: summaryJsonPath,
        },
        null,
        2,
      ),
    );

    return summary;
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  try {
    await runP710R3f3CanonicalSidecarWriterMain();
    process.exit(0);
  } catch (err) {
    if (err instanceof P710R3f3CliArgsError) {
      // eslint-disable-next-line no-console
      console.error(err.message);
      process.exit(1);
      return;
    }
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  }
}

if (require.main === module) {
  void main();
}
