const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

console.log("SCRIPT_START");
console.log("ARGV:", process.argv);

(async () => {
  const viewerUserId = process.argv[2];
  console.log("viewerUserId=", viewerUserId);

  const rows = await prisma.user.findMany({
    where: {
      id: { not: viewerUserId },
      images: { some: {} },
      relationProfile: { isNot: null },
    },
    select: {
      id: true,
      phone: true,
      nickname: true,
      age: true,
      city: true,
      _count: { select: { images: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log("ROW_COUNT=", rows.length);
  console.log(JSON.stringify(rows, null, 2));
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error("SCRIPT_ERROR");
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
