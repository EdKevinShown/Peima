/* One-off discover: completed jobs with >=3 items and rrm-ready v2 counts. */
const { createRequire } = require("node:module");
const path = require("node:path");
const req = createRequire(path.join(__dirname, "..", "packages", "database", "package.json"));
const { PrismaClient } = req("@prisma/client");
const RRM = "ai-match-simulation-rrm-ready-v2";

function isRrmReady(it) {
  if (it.status !== "succeeded") return false;
  const t = it.transcriptLite;
  if (!t || typeof t !== "object") return false;
  return t.schemaVersion === 2 && t.sourceVersion === RRM;
}

async function main() {
  const prisma = new PrismaClient();
  const rows = await prisma.aiSimulationV1Job.findMany({
    where: { jobStatus: "completed" },
    include: { items: true },
    orderBy: { updatedAt: "desc" },
    take: 80,
  });
  const out = rows
    .map((j) => ({
      id: j.id,
      viewerUserId: j.viewerUserId,
      poolId: j.poolId,
      itemCount: j.items.length,
      succeeded: j.items.filter((x) => x.status === "succeeded").length,
      failed: j.items.filter((x) => x.status === "failed").length,
      rrmReadyV2: j.items.filter(isRrmReady).length,
      usable: j.items.length >= 3 && j.items.filter(isRrmReady).length >= 3,
    }))
    .filter((x) => x.itemCount >= 3);
  out.sort((a, b) => b.rrmReadyV2 - a.rrmReadyV2);
  console.log(JSON.stringify({ usableJobCountDb: out.filter((x) => x.usable).length, jobs: out }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
