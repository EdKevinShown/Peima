import { config } from "dotenv";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

config({ path: resolve(process.cwd(), "../../.env") });
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const prisma = new PrismaClient();
const viewers = [
  "cmr4hm001016z64demo00m05a",
  "cmfemn00100016z64seed0001",
  "cmr4hf000716z64demo00f04a",
  "cmr4hf000916z64demo00f05a",
  "cmr4r7j4050025z64stag0001",
];

async function main() {
  const inList = viewers.map((v) => `'${v}'`).join(",");
  const precheck = await prisma.$queryRawUnsafe(`
    select "viewerUserId", "selectedCandidateId", "sourceVersion",
      "pmSignoffStatus", "opsSignoffStatus", "applied", "dryRun", "rolledBack",
      "appliedToMatchResult", "appliedToFinalScore", "appliedToWorkerRanking", "appliedToDisplay"
    from p76_allowlist_apply_meta
    where "viewerUserId" in (${inList})
    order by "viewerUserId"
  `);
  const [violation] = await prisma.$queryRawUnsafe(`
    select count(*)::int as violation_count from p76_allowlist_apply_meta
    where "appliedToMatchResult" = true or "appliedToFinalScore" = true
      or "appliedToWorkerRanking" = true or "appliedToDisplay" = true
  `);
  const [rolledBack] = await prisma.$queryRawUnsafe(`
    select count(*)::int as rolled_back_count from p76_allowlist_apply_meta where "rolledBack" = true
  `);
  const [routeC] = await prisma.$queryRawUnsafe(`
    select count(*)::int as route_c_rows from p76_allowlist_apply_meta
    where "viewerUserId" in (${inList})
  `);
  const payload = { precheck, violation, rolledBack, routeC };
  const out = join(dirname(fileURLToPath(import.meta.url)), "../../../artifacts/p76/r8h2/sql-results.json");
  writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
