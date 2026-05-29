import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
try {
  const envText = readFileSync(join(root, ".env"), "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    if (process.env[k] == null || process.env[k] === "") process.env[k] = v;
  }
} catch {}

const prisma = new PrismaClient();
const viewers = [
  "cmr4hm001016z64demo00m05a",
  "cmfemn00100016z64seed0001",
  "cmr4hf000716z64demo00f04a",
  "cmr4hf000916z64demo00f05a",
  "cmr4r7j4050025z64stag0001",
];
const inList = viewers.map((v) => `'${v}'`).join(",");

async function main() {
  const sidecar = await prisma.$queryRawUnsafe(`
    select "viewerUserId", "selectedCandidateId", "sourceVersion",
      "pmSignoffStatus", "opsSignoffStatus", "applied", "dryRun", "rolledBack",
      "appliedToMatchResult", "appliedToFinalScore", "appliedToWorkerRanking", "appliedToDisplay"
    from p76_allowlist_apply_meta where "viewerUserId" in (${inList}) order by "viewerUserId"
  `);
  const matchResults = await prisma.$queryRawUnsafe(`
    select "userId", id, "candidateUserId", "finalScore", "createdAt", "updatedAt", "reasonSummary"
    from match_results where "userId" in (${inList}, 'cmo7ksq8s00006znosryc9k0n')
    order by "userId", "updatedAt" desc
  `);
  const [violation] = await prisma.$queryRawUnsafe(`
    select count(*)::int as violation_count from p76_allowlist_apply_meta
    where "appliedToMatchResult" = true or "appliedToFinalScore" = true
      or "appliedToWorkerRanking" = true or "appliedToDisplay" = true
  `);
  const [routeC] = await prisma.$queryRawUnsafe(`
    select count(*)::int as route_c_rows from p76_allowlist_apply_meta where "viewerUserId" in (${inList})
  `);
  const [rolledBack] = await prisma.$queryRawUnsafe(`
    select count(*)::int as rolled_back_count from p76_allowlist_apply_meta where "rolledBack" = true
  `);
  const outDir = join(root, "artifacts/p76/r9b");
  mkdirSync(outDir, { recursive: true });
  const fixturePrecheck = { sidecar, matchResults, sourceVersion: "p7.6-r7j3-staging-cohort-v1" };
  writeFileSync(join(outDir, "fixture-precheck.json"), JSON.stringify(fixturePrecheck, null, 2));
  writeFileSync(
    join(outDir, "violation-sql-results.json"),
    JSON.stringify({ violation, routeC, rolledBack }, null, 2),
  );
  console.log(JSON.stringify({ violation, routeC, rolledBack }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
