/**
 * P7.10-r6f3 — Dev-only rehearsal writer runner (dry-run + optional local insert).
 *
 * From `apps/api` after `pnpm exec nest build`:
 *   pnpm run p710:r6f3:rehearsal-writer -- --dryRun=true
 *   pnpm run p710:r6f3:rehearsal-writer -- --insert=true --cleanup=true
 *
 * Never writes MatchResult / matchInsights. Rehearsal table only when --insert=true.
 */
import "reflect-metadata";
import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import * as dotenv from "dotenv";
import { NestFactory } from "@nestjs/core";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  buildP76RehearsalWriterInputFromShadowAuditArtifact,
  loadP76CanonicalWriterShadowAuditArtifactFromFile,
} from "../modules/matching/p76-canonical-writer-rehearsal-writer-artifact-input";
import {
  dryRunP76CanonicalWriterRehearsalWriter,
  insertOnlyP76CanonicalWriterRehearsalWriter,
  readP76RehearsalSidecarWriterEnv,
} from "../modules/matching/p76-canonical-writer-rehearsal-writer";
import type { P76CanonicalWriterRehearsalWriterResultV1 } from "../modules/matching/p76-canonical-writer-rehearsal-writer.types";
import {
  P710R6f3CliArgsError,
  parseP710R6f3RehearsalWriterCliArgs,
  type P710R6f3RehearsalWriterCliArgs,
} from "./p710-r6f3-rehearsal-writer-cli-args";
import { P710R6f3RehearsalWriterRunnerModule } from "./p710-r6f3-rehearsal-writer-runner.module";

export const P710_R6F3_RUNNER_SOURCE_VERSION =
  "p7.10-r6f3-rehearsal-writer-cli-v1" as const;

export type P76RehearsalInsertVerificationV1 = {
  auditRunId: string;
  rowCount: number;
  appliedToMatchResultTrueCount: number;
  environmentCounts: Record<string, number>;
  pass: boolean;
};

export type P76RehearsalCleanupResultV1 = {
  auditRunId: string;
  deletedCount: number;
};

export type P710R6f3RehearsalWriterSmokeSummaryV1 = {
  runnerSourceVersion: typeof P710_R6F3_RUNNER_SOURCE_VERSION;
  generatedAt: string;
  artifactPath: string;
  auditRunId: string;
  environment: "dev" | "staging";
  mode: "dry_run" | "insert_only";
  dryRun: boolean;
  insert: boolean;
  cleanup: boolean;
  verify: boolean;
  writerResult: P76CanonicalWriterRehearsalWriterResultV1;
  insertVerification?: P76RehearsalInsertVerificationV1;
  cleanupResult?: P76RehearsalCleanupResultV1;
  writerEnv: ReturnType<typeof readP76RehearsalSidecarWriterEnv>;
};

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

/** Resolve artifact/output paths from `apps/api` or repo root cwd. */
export function resolveP710R6f3ArtifactPath(filePath: string): string {
  const direct = resolvePath(filePath);
  if (fs.existsSync(direct)) return direct;

  const parts = filePath.split(/[/\\]/).filter((p) => p !== ".." && p !== ".");
  const fromApi = path.resolve(process.cwd(), "..", "..", ...parts);
  if (fs.existsSync(fromApi)) return fromApi;

  const fromRoot = path.resolve(process.cwd(), ...parts);
  if (fs.existsSync(fromRoot)) return fromRoot;

  return direct;
}

export function buildP710R6f3WriterEnvForCli(
  args: P710R6f3RehearsalWriterCliArgs,
  base: NodeJS.ProcessEnv = process.env,
): ReturnType<typeof readP76RehearsalSidecarWriterEnv> {
  const merged: NodeJS.ProcessEnv = {
    ...base,
    PEIMA_P76_REHEARSAL_SIDECAR_WRITER_ENVIRONMENT: args.environment,
  };
  if (args.insert) {
    merged.PEIMA_P76_REHEARSAL_SIDECAR_WRITER_ENABLED = "1";
    merged.PEIMA_P76_REHEARSAL_SIDECAR_WRITER_DRY_RUN = "0";
    merged.PEIMA_P76_REHEARSAL_SIDECAR_WRITER_ALLOW_DB_WRITE = "1";
    merged.PEIMA_P76_REHEARSAL_SIDECAR_WRITER_KILL_SWITCH = "0";
  } else {
    merged.PEIMA_P76_REHEARSAL_SIDECAR_WRITER_ENABLED =
      base.PEIMA_P76_REHEARSAL_SIDECAR_WRITER_ENABLED ?? "1";
    merged.PEIMA_P76_REHEARSAL_SIDECAR_WRITER_DRY_RUN = "1";
  }
  return readP76RehearsalSidecarWriterEnv(merged);
}

export function assertP710R6f3InsertAllowed(
  args: P710R6f3RehearsalWriterCliArgs,
  writerEnv: ReturnType<typeof readP76RehearsalSidecarWriterEnv>,
): void {
  if (!args.insert) return;
  if (process.env.NODE_ENV === "production") {
    throw new Error("P7.10-r6f3: insert blocked when NODE_ENV=production");
  }
  if (writerEnv.environment === "production") {
    throw new Error("P7.10-r6f3: insert blocked for production environment");
  }
  if (!writerEnv.canInsert) {
    throw new Error(
      `P7.10-r6f3: insert gates not satisfied (blockedReason=${writerEnv.blockedReason ?? "unknown"})`,
    );
  }
}

export async function verifyP76RehearsalRowsForAuditRun(
  prisma: PrismaService,
  auditRunId: string,
): Promise<P76RehearsalInsertVerificationV1> {
  const rows = await prisma.p76CanonicalWriterRehearsalMeta.findMany({
    where: { auditRunId },
    select: {
      appliedToMatchResult: true,
      environment: true,
    },
  });

  const environmentCounts: Record<string, number> = {};
  let appliedToMatchResultTrueCount = 0;
  for (const row of rows) {
    environmentCounts[row.environment] = (environmentCounts[row.environment] ?? 0) + 1;
    if (row.appliedToMatchResult === true) {
      appliedToMatchResultTrueCount += 1;
    }
  }

  return {
    auditRunId,
    rowCount: rows.length,
    appliedToMatchResultTrueCount,
    environmentCounts,
    pass:
      appliedToMatchResultTrueCount === 0 &&
      rows.every((r) => r.environment === "dev" || r.environment === "staging"),
  };
}

export async function cleanupP76RehearsalRowsByAuditRunId(
  prisma: PrismaService,
  auditRunId: string,
): Promise<P76RehearsalCleanupResultV1> {
  const deleted = await prisma.p76CanonicalWriterRehearsalMeta.deleteMany({
    where: { auditRunId },
  });
  return { auditRunId, deletedCount: deleted.count };
}

function formatSummaryMarkdown(summary: P710R6f3RehearsalWriterSmokeSummaryV1): string {
  const wr = summary.writerResult;
  const lines = [
    "# P7.10-r6f3 Rehearsal Writer Local Insert Smoke",
    "",
    `- **generatedAt:** ${summary.generatedAt}`,
    `- **artifact:** ${summary.artifactPath}`,
    `- **auditRunId:** ${summary.auditRunId}`,
    `- **mode:** ${summary.mode}`,
    `- **attempted:** ${wr.attemptedCount} · **inserted:** ${wr.insertedCount} · **duplicates:** ${wr.duplicateCount} · **skipped:** ${wr.skippedCount}`,
    `- **appliedToMatchResultCount:** ${wr.appliedToMatchResultCount}`,
    "",
  ];
  if (summary.insertVerification) {
    const v = summary.insertVerification;
    lines.push(
      "## Insert verification",
      "",
      `- rowCount: ${v.rowCount}`,
      `- appliedToMatchResultTrueCount: ${v.appliedToMatchResultTrueCount}`,
      `- pass: ${v.pass}`,
      "",
    );
  }
  if (summary.cleanupResult) {
    lines.push(
      "## Cleanup",
      "",
      `- deletedCount: ${summary.cleanupResult.deletedCount}`,
      "",
    );
  }
  return lines.join("\n");
}

export function writeP710R6f3SmokeSummaryArtifacts(
  summary: P710R6f3RehearsalWriterSmokeSummaryV1,
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
  fs.writeFileSync(mdPath, formatSummaryMarkdown(summary), "utf8");
}

export async function runP710R6f3RehearsalWriterMain(
  argv: string[] = process.argv.slice(2),
): Promise<P710R6f3RehearsalWriterSmokeSummaryV1> {
  loadDotenvFromCommonLocations();

  let args: P710R6f3RehearsalWriterCliArgs;
  try {
    args = parseP710R6f3RehearsalWriterCliArgs(argv);
  } catch (err) {
    if (err instanceof P710R6f3CliArgsError) throw err;
    throw err;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL missing; set in .env (repo root or apps/api).");
  }

  const artifactPath = resolveP710R6f3ArtifactPath(args.artifactPath);
  const artifact = loadP76CanonicalWriterShadowAuditArtifactFromFile(
    artifactPath,
    fs,
  );
  const auditRunId = args.auditRunId?.trim() || `r6f3-${randomUUID()}`;
  const writerInput = buildP76RehearsalWriterInputFromShadowAuditArtifact({
    artifact,
    auditRunId,
    environment: args.environment,
    readPathSourceVersion: args.readPathSourceVersion,
    includeBlocked: args.includeBlocked,
  });

  const writerEnv = buildP710R6f3WriterEnvForCli(args);
  assertP710R6f3InsertAllowed(args, writerEnv);

  const app = await NestFactory.createApplicationContext(
    P710R6f3RehearsalWriterRunnerModule,
    { logger: false },
  );

  try {
    const prisma = app.get(PrismaService);
    let writerResult: P76CanonicalWriterRehearsalWriterResultV1;
    let insertVerification: P76RehearsalInsertVerificationV1 | undefined;
    let cleanupResult: P76RehearsalCleanupResultV1 | undefined;

    if (args.insert) {
      writerResult = await insertOnlyP76CanonicalWriterRehearsalWriter(writerInput, {
        prisma: {
          p76CanonicalWriterRehearsalMeta: {
            create: (createArgs) =>
              prisma.p76CanonicalWriterRehearsalMeta.create(createArgs),
          },
        },
        writerEnv,
      });
      if (args.verify) {
        insertVerification = await verifyP76RehearsalRowsForAuditRun(
          prisma,
          auditRunId,
        );
        if (!insertVerification.pass) {
          throw new Error(
            "P7.10-r6f3 insert verification failed (appliedToMatchResult or environment)",
          );
        }
      }
      if (args.cleanup) {
        cleanupResult = await cleanupP76RehearsalRowsByAuditRunId(
          prisma,
          auditRunId,
        );
      }
    } else {
      writerResult = dryRunP76CanonicalWriterRehearsalWriter(writerInput, writerEnv);
    }

    const summary: P710R6f3RehearsalWriterSmokeSummaryV1 = {
      runnerSourceVersion: P710_R6F3_RUNNER_SOURCE_VERSION,
      generatedAt: new Date().toISOString(),
      artifactPath,
      auditRunId,
      environment: args.environment,
      mode: args.insert ? "insert_only" : "dry_run",
      dryRun: args.dryRun,
      insert: args.insert,
      cleanup: args.cleanup,
      verify: args.verify,
      writerResult,
      insertVerification,
      cleanupResult,
      writerEnv,
    };

    const summaryJsonPath = resolveP710R6f3ArtifactPath(args.outputJsonPath);
    const summaryMdPath = resolveP710R6f3ArtifactPath(args.outputMdPath);

    writeP710R6f3SmokeSummaryArtifacts(summary, {
      jsonPath: summaryJsonPath,
      mdPath: summaryMdPath,
      pretty: args.pretty,
    });

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          runnerSourceVersion: summary.runnerSourceVersion,
          auditRunId: summary.auditRunId,
          mode: summary.mode,
          insertedCount: writerResult.insertedCount,
          duplicateCount: writerResult.duplicateCount,
          skippedCount: writerResult.skippedCount,
          insertVerification: insertVerification?.pass,
          cleanupDeleted: cleanupResult?.deletedCount,
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
    await runP710R6f3RehearsalWriterMain();
    process.exit(0);
  } catch (err) {
    if (err instanceof P710R6f3CliArgsError) {
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
