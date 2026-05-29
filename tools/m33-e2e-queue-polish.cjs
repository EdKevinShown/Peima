/**
 * M3.3 polish: POST /run with no worker — verify enqueued_for_worker + DB still queued, then restore row.
 * Run: cd apps/api && node ../../tools/m33-e2e-queue-polish.cjs
 * Requires: no worker consuming; Docker Postgres up.
 */
const path = require("path");
process.chdir(path.join(__dirname, "../apps/api"));
require(require.resolve("dotenv", { paths: [process.cwd()] })).config({
  path: path.join(__dirname, "../.env"),
  override: true,
});
const { PrismaClient } = require(require.resolve("@peima/database", { paths: [process.cwd()] }));
const jwt = require(require.resolve("jsonwebtoken", { paths: [process.cwd()] }));

const JOB_ID = "cmodwumhj000a6z3ke20zbrdr";
/** Last item row (succeeded) — temporarily reset for enqueue-only check, then restored from backup. */
const ITEM_ID = "cmodwumhm000g6z3k7qkuuvhv";

async function main() {
  const secret = process.env.JWT_SECRET || "change-me-in-production";
  const sub = (process.env.PEIMA_ADMIN_USER_IDS || "")
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)[0];
  if (!sub) throw new Error("PEIMA_ADMIN_USER_IDS empty");
  const token = jwt.sign({ sub }, secret, { expiresIn: "1h" });
  const base = (process.env.VITE_API_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

  const prisma = new PrismaClient();
  const backup = await prisma.aiSimulationV1Item.findUniqueOrThrow({ where: { id: ITEM_ID } });
  const backupJob = await prisma.aiSimulationV1Job.findUniqueOrThrow({ where: { id: JOB_ID } });

  try {
    await prisma.aiSimulationV1Item.update({
      where: { id: ITEM_ID },
      data: {
        status: "queued",
        attemptCount: 0,
        errorCode: null,
        failureDetail: null,
        transcriptLite: null,
        evaluator: null,
      },
    });
    await prisma.aiSimulationV1Job.update({
      where: { id: JOB_ID },
      data: { jobStatus: "queued" },
    });

    const postRes = await fetch(`${base}/admin/ai-simulation/v1/jobs/${JOB_ID}/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const postBody = await postRes.json();

    const jobAfter = await prisma.aiSimulationV1Job.findUniqueOrThrow({
      where: { id: JOB_ID },
      select: { jobStatus: true, updatedAt: true },
    });

    console.log(
      JSON.stringify(
        {
          post: { httpStatus: postRes.status, body: postBody },
          dbImmediatelyAfterPost: { jobStatus: jobAfter.jobStatus },
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.aiSimulationV1Item.update({
      where: { id: ITEM_ID },
      data: {
        status: backup.status,
        attemptCount: backup.attemptCount,
        errorCode: backup.errorCode,
        failureDetail: backup.failureDetail,
        transcriptLite: backup.transcriptLite,
        evaluator: backup.evaluator,
      },
    });
    await prisma.aiSimulationV1Job.update({
      where: { id: JOB_ID },
      data: { jobStatus: backupJob.jobStatus },
    });
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
