/**
 * M3.8-M15D: read one ai_pairwise_decision_jobs row — safe summary only (no keys, no raw LLM, no prompts).
 * Usage from repo root: node tools/m38-m15d-read-pairwise-job.cjs [jobId]
 */
const path = require("path");
process.chdir(path.join(__dirname, "../apps/api"));
require(require.resolve("dotenv", { paths: [process.cwd()] })).config({
  path: path.join(__dirname, "../.env"),
  override: true,
});
const { PrismaClient } = require(require.resolve("@peima/database", { paths: [process.cwd()] }));

const jobId = process.argv[2] || "cmonxm59u00016z7ghs7wqzq1";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log(JSON.stringify({ ok: false, error: "DATABASE_URL not set in .env" }));
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const row = await prisma.aiPairwiseDecisionJob.findUnique({ where: { id: jobId } });
    if (!row) {
      console.log(JSON.stringify({ ok: false, error: "job_not_found", jobId }));
      process.exit(2);
    }
    const fd = row.failureDetail && typeof row.failureDetail === "object" ? row.failureDetail : null;
    const out = {
      ok: true,
      jobId: row.id,
      poolId: row.poolId,
      status: row.status,
      failureDetail: fd
        ? {
            code: fd.code ?? null,
            path: fd.path ?? null,
            reason: fd.reason ?? null,
            expected: fd.expected != null ? String(fd.expected).slice(0, 200) : null,
            actual: fd.actual != null ? String(fd.actual).slice(0, 200) : null,
            message: fd.message != null ? String(fd.message).slice(0, 300) : null,
          }
        : null,
      hasDecisionResult: row.decisionResult != null,
      hasFinalSourceShadow: row.finalSourceShadow != null,
    };
    if (row.finalSourceShadow && typeof row.finalSourceShadow === "object") {
      const sh = row.finalSourceShadow;
      out.finalSourceShadowSummary = {
        jobStatus: sh.jobStatus ?? null,
        proposalRecommendation: sh.proposalRecommendation ?? null,
        wouldChangeStaticResult: sh.wouldChangeStaticResult ?? null,
      };
    }
    console.log(JSON.stringify(out, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
});
