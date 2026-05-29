/**
 * M3.3 stuck recovery (no LLM): simulate stale running job, call recoverStuckAiSimulationV1JobsOnce, restore DB.
 * Run: cd apps/api && node ../../tools/m33-e2e-stuck-polish.cjs
 */
const path = require("path");
process.chdir(path.join(__dirname, "../apps/api"));
require(require.resolve("dotenv", { paths: [process.cwd()] })).config({
  path: path.join(__dirname, "../.env"),
  override: true,
});
const { PrismaClient } = require(require.resolve("@peima/database", { paths: [process.cwd()] }));
const {
  recoverStuckAiSimulationV1JobsOnce,
} = require(path.join(__dirname, "../packages/ai-simulation-v1-runner/dist/worker-consumer.js"));

const JOB_ID = "cmodwumhj000a6z3ke20zbrdr";
const RUNNING_ITEM_ID = "cmodwumhm000b6z3k2a6c177j";

async function main() {
  const prisma = new PrismaClient();
  const backupJob = await prisma.aiSimulationV1Job.findUniqueOrThrow({ where: { id: JOB_ID } });
  const backupItem = await prisma.aiSimulationV1Item.findUniqueOrThrow({ where: { id: RUNNING_ITEM_ID } });

  try {
    await prisma.aiSimulationV1Job.update({
      where: { id: JOB_ID },
      data: { jobStatus: "running" },
    });
    await prisma.$executeRawUnsafe(
      `UPDATE ai_simulation_v1_jobs SET "updatedAt" = NOW() - INTERVAL '25 minutes' WHERE id = $1`,
      JOB_ID,
    );
    await prisma.aiSimulationV1Item.update({
      where: { id: RUNNING_ITEM_ID },
      data: { status: "running" },
    });

    const before = await prisma.aiSimulationV1Job.findUniqueOrThrow({
      where: { id: JOB_ID },
      select: { jobStatus: true, updatedAt: true },
    });
    const itemBefore = await prisma.aiSimulationV1Item.findUniqueOrThrow({
      where: { id: RUNNING_ITEM_ID },
      select: { status: true },
    });

    await recoverStuckAiSimulationV1JobsOnce(prisma, {
      stuckTimeoutMs: 60_000,
      now: new Date(),
    });

    const afterJob = await prisma.aiSimulationV1Job.findUniqueOrThrow({
      where: { id: JOB_ID },
      select: { jobStatus: true },
    });
    const afterItem = await prisma.aiSimulationV1Item.findUniqueOrThrow({
      where: { id: RUNNING_ITEM_ID },
      select: { status: true },
    });

    const failedOther = await prisma.aiSimulationV1Item.findFirst({
      where: { jobId: JOB_ID, status: "failed" },
      select: { id: true, status: true, errorCode: true },
    });

    console.log(
      JSON.stringify(
        {
          setup: { job: before, item: itemBefore },
          afterRecovery: { jobStatus: afterJob.jobStatus, itemStatus: afterItem.status },
          failedRowUnchanged: failedOther,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.aiSimulationV1Item.update({
      where: { id: RUNNING_ITEM_ID },
      data: {
        status: backupItem.status,
        attemptCount: backupItem.attemptCount,
        errorCode: backupItem.errorCode,
        failureDetail: backupItem.failureDetail,
        transcriptLite: backupItem.transcriptLite,
        evaluator: backupItem.evaluator,
      },
    });
    await prisma.aiSimulationV1Job.update({
      where: { id: JOB_ID },
      data: {
        jobStatus: backupJob.jobStatus,
        shortlistBinding: backupJob.shortlistBinding,
        shortlistDecisionV0: backupJob.shortlistDecisionV0,
        shortlistFourDimV0: backupJob.shortlistFourDimV0,
        shortlistScenariosV0: backupJob.shortlistScenariosV0,
      },
    });
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
