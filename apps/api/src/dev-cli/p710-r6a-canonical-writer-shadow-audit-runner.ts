/**
 * P7.10-r6a — Dev-only canonical writer shadow audit (read-only DB; JSON artifact only).
 *
 * From `apps/api` after `pnpm exec nest build`:
 *   pnpm run p710:r6a:canonical-writer-shadow-audit -- --limit=20
 *
 * Requires DATABASE_URL. Never writes MatchResult / sidecar / matchInsights.
 */
import "reflect-metadata";
import * as path from "path";
import * as dotenv from "dotenv";
import { NestFactory } from "@nestjs/core";
import { PrismaService } from "../common/prisma/prisma.service";
import { buildP76CanonicalWriterShadowAuditReport } from "../modules/matching/p76-canonical-writer-shadow-audit";
import { writeP76CanonicalWriterShadowAuditArtifact } from "../modules/matching/p76-canonical-writer-shadow-audit-json";
import type { P76CanonicalWriterShadowAuditRowInputV1 } from "../modules/matching/p76-canonical-writer-shadow-audit";
import { readP76ReadPathEnv } from "../modules/matching/p76-read-path-env";
import {
  P710R6aCliArgsError,
  parseP710R6aCanonicalWriterShadowAuditCliArgs,
  type P710R6aCanonicalWriterShadowAuditCliArgs,
} from "./p710-r6a-canonical-writer-shadow-audit-cli-args";
import { P710R6aCanonicalWriterShadowAuditRunnerModule } from "./p710-r6a-canonical-writer-shadow-audit-runner.module";

export const P710_R6A_RUNNER_SOURCE_VERSION =
  "p7.10-r6a-canonical-writer-shadow-audit-cli-v1" as const;

function loadDotenvFromCommonLocations(): void {
  const here = __dirname;
  for (const p of [
    path.join(here, "../../.env"),
    path.join(here, "../../../.env"),
  ]) {
    dotenv.config({ path: p });
  }
}

function resolveOutputPath(outputPath: string): string {
  if (path.isAbsolute(outputPath)) return outputPath;
  return path.resolve(process.cwd(), outputPath);
}

export async function loadP76CanonicalWriterShadowAuditRowInputs(
  prisma: PrismaService,
  args: P710R6aCanonicalWriterShadowAuditCliArgs,
  readPathEnv: ReturnType<typeof readP76ReadPathEnv>,
): Promise<P76CanonicalWriterShadowAuditRowInputV1[]> {
  const rows = await prisma.matchResult.findMany({
    where: {
      ...(args.viewerUserId ? { userId: args.viewerUserId } : {}),
      ...(args.batchId ? { batchId: args.batchId } : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: args.limit,
    select: {
      id: true,
      userId: true,
      candidateUserId: true,
      finalScore: true,
    },
  });

  const inputs: P76CanonicalWriterShadowAuditRowInputV1[] = [];

  for (const row of rows) {
    const sidecar = await prisma.p76AllowlistApplyMeta.findUnique({
      where: {
        viewerUserId_sourceVersion: {
          viewerUserId: row.userId,
          sourceVersion: readPathEnv.sourceVersion,
        },
      },
    });

    let sidecarCandidateExists: boolean | undefined;
    if (sidecar?.selectedCandidateId?.trim()) {
      const cand = await prisma.user.findUnique({
        where: { id: sidecar.selectedCandidateId.trim() },
        select: { id: true },
      });
      sidecarCandidateExists = Boolean(cand);
    }

    inputs.push({
      matchResult: {
        id: row.id,
        userId: row.userId,
        candidateUserId: row.candidateUserId,
        finalScore: row.finalScore,
      },
      sidecar: sidecar
        ? {
            id: sidecar.id,
            viewerUserId: sidecar.viewerUserId,
            selectedCandidateId: sidecar.selectedCandidateId,
            sourceVersion: sidecar.sourceVersion,
            allowlistMatched: sidecar.allowlistMatched,
            pmSignoffStatus: sidecar.pmSignoffStatus,
            opsSignoffStatus: sidecar.opsSignoffStatus,
            applied: sidecar.applied,
            dryRun: sidecar.dryRun,
            rolledBack: sidecar.rolledBack,
            appliedToMatchResult: sidecar.appliedToMatchResult,
            appliedToFinalScore: sidecar.appliedToFinalScore,
            appliedToWorkerRanking: sidecar.appliedToWorkerRanking,
            appliedToDisplay: sidecar.appliedToDisplay,
          }
        : null,
      sidecarCandidateExists,
      notes: sidecar
        ? undefined
        : ["sidecar_lookup_best_effort: no p76_allowlist_apply_meta for viewer+sourceVersion"],
    });
  }

  return inputs;
}

export async function runP710R6aCanonicalWriterShadowAuditMain(
  argv: string[] = process.argv.slice(2),
): Promise<{ outputPath: string; report: ReturnType<typeof buildP76CanonicalWriterShadowAuditReport> }> {
  loadDotenvFromCommonLocations();

  let args: P710R6aCanonicalWriterShadowAuditCliArgs;
  try {
    args = parseP710R6aCanonicalWriterShadowAuditCliArgs(argv);
  } catch (err) {
    if (err instanceof P710R6aCliArgsError) {
      throw err;
    }
    throw err;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL missing; set in .env (repo root or apps/api).");
  }

  const readPathEnv = readP76ReadPathEnv(process.env);
  const outputPath = resolveOutputPath(args.outputPath);
  const generatedAt = new Date().toISOString();

  const app = await NestFactory.createApplicationContext(
    P710R6aCanonicalWriterShadowAuditRunnerModule,
    { logger: false },
  );

  try {
    const prisma = app.get(PrismaService);
    const rowInputs = await loadP76CanonicalWriterShadowAuditRowInputs(
      prisma,
      args,
      readPathEnv,
    );

    const report = buildP76CanonicalWriterShadowAuditReport({
      generatedAt,
      rows: rowInputs,
      includeBlocked: args.includeBlocked,
      readPathEnv,
      shadowEnv: {
        ...process.env,
        PEIMA_P76_CANONICAL_WRITER_SHADOW_ENABLED: "1",
      },
    });

    writeP76CanonicalWriterShadowAuditArtifact(report, outputPath, {
      pretty: args.pretty,
    });

    const summary = {
      runnerSourceVersion: P710_R6A_RUNNER_SOURCE_VERSION,
      outputPath,
      readPathSourceVersion: readPathEnv.sourceVersion,
      dryRun: true,
      totalRows: report.totalRows,
      eligibleCount: report.eligibleCount,
      blockedCount: report.blockedCount,
      wouldChangeCandidateCount: report.wouldChangeCandidateCount,
      appliedToMatchResultCount: report.appliedToMatchResultCount,
      reasonCounts: report.reasonCounts,
      scoreDeltaBandCounts: report.scoreDeltaBandCounts,
      rowsWritten: report.rows.length,
    };

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(summary, null, 2));

    return { outputPath, report };
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  try {
    await runP710R6aCanonicalWriterShadowAuditMain();
    process.exit(0);
  } catch (err) {
    if (err instanceof P710R6aCliArgsError) {
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
