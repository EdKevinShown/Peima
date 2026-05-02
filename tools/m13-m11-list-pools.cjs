const { createRequire } = require("node:module");
const path = require("node:path");
const req = createRequire(path.join(__dirname, "..", "packages", "database", "package.json"));
const { PrismaClient } = req("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  const pools = await prisma.previewPool.findMany({
    include: { items: true },
    orderBy: { updatedAt: "desc" },
    take: 40,
  });
  const out = pools
    .filter((p) => p.items.length >= 3)
    .map((p) => ({
      poolId: p.id,
      userId: p.userId,
      n: p.items.length,
      top3: p.items
        .sort((a, b) => a.rankInPool - b.rankInPool)
        .slice(0, 3)
        .map((i) => i.candidateUserId),
    }));
  console.log(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
