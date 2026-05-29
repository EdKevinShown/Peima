/**
 * M1.3-M11 — List completed jobs repairable to usable via failed-only reset:
 * itemCount >= 3, failed > 0, rrmReadyV2 + failed >= 3, not yet usable (rrm < 3).
 */
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
  });
  const usableViewers = new Set();
  for (const j of rows) {
    const itemCount = j.items.length;
    if (itemCount < 3) continue;
    const rrm = j.items.filter(isRrmReady).length;
    if (rrm >= 3) usableViewers.add(j.viewerUserId);
  }
  const repairable = [];
  for (const j of rows) {
    const itemCount = j.items.length;
    if (itemCount < 3) continue;
    const succeeded = j.items.filter((x) => x.status === "succeeded").length;
    const failed = j.items.filter((x) => x.status === "failed").length;
    const rrm = j.items.filter(isRrmReady).length;
    const usable = rrm >= 3;
    if (failed === 0) continue;
    if (rrm + failed < 3) continue;
    if (usable) continue;
    repairable.push({
      id: j.id,
      viewerUserId: j.viewerUserId,
      poolId: j.poolId,
      itemCount,
      succeeded,
      failed,
      rrmReadyV2: rrm,
      maxRrmIfAllFailedSucceed: rrm + failed,
    });
  }
  repairable.sort((a, b) => {
    const da = usableViewers.has(a.viewerUserId) ? 1 : 0;
    const db = usableViewers.has(b.viewerUserId) ? 1 : 0;
    if (da !== db) return da - db;
    return b.failed - a.failed;
  });
  console.log(JSON.stringify({ repairableCount: repairable.length, repairable }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
