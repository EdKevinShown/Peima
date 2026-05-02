/**
 * M4.2-M3-C — Finalize-with-pairwise for succeeded rows from M4.2-M3-B pairwise run log (local only).
 *
 * Reads `docs/M4/M4.2-m3-pairwise-run.local.md`, extracts blocks with `status: succeeded`,
 * calls `MatchingFinalizePairwiseService.finalizeWithPairwise` (same as POST /matching/finalize-with-pairwise).
 * Does not mutate MatchResult. Writes `docs/M4/M4.2-m3-finalize-run.local.md` (gitignored).
 *
 * From monorepo root:
 *   cd apps/api && pnpm exec nest build
 *   node --env-file=.env packages/database/scripts/m4-2-m3-c-finalize-pairwise-local.mjs
 *   node --env-file=.env packages/database/scripts/m4-2-m3-c-finalize-pairwise-local.mjs --pairwise-log docs/M4/M4.2-m3-pairwise-run-2.local.md --out docs/M4/M4.2-m3-finalize-run-2.local.md
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = path.join(__dirname, "..", "..", "..");

function tryLoadMonorepoDotEnv() {
  if (process.env.DATABASE_URL) return;
  const p = path.join(MONOREPO_ROOT, ".env");
  if (!fs.existsSync(p)) return;
  const raw = fs.readFileSync(p, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function parseArgs(argv) {
  let inPath = path.join(MONOREPO_ROOT, "docs", "M4", "M4.2-m3-pairwise-run.local.md");
  let outPath = path.join(MONOREPO_ROOT, "docs", "M4", "M4.2-m3-finalize-run.local.md");
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--pairwise-log" && argv[i + 1]) {
      const v = String(argv[++i]);
      inPath = path.isAbsolute(v) ? v : path.join(MONOREPO_ROOT, v);
    } else if (a.startsWith("--pairwise-log=")) {
      const v = a.slice("--pairwise-log=".length);
      inPath = path.isAbsolute(v) ? v : path.join(MONOREPO_ROOT, v);
    } else if (a === "--out" && argv[i + 1]) {
      const v = String(argv[++i]);
      outPath = path.isAbsolute(v) ? v : path.join(MONOREPO_ROOT, v);
    } else if (a.startsWith("--out=")) {
      const v = a.slice("--out=".length);
      outPath = path.isAbsolute(v) ? v : path.join(MONOREPO_ROOT, v);
    }
  }
  return { inPath, outPath };
}

/**
 * @returns {{ viewerUserId: string, poolId: string, pairwiseJobId: string, rowLabel: string }[]}
 */
function parseSucceededFromPairwiseRunMd(text) {
  const parts = text.split(/\n## Row /);
  const out = [];
  for (const chunk of parts) {
    if (!chunk.trim()) continue;
    const headerLine = chunk.split("\n")[0] ?? "";
    const header = headerLine.match(/^\d+:/) ? `Row ${headerLine}` : headerLine;
    const body = chunk;
    if (!/status:\s*`succeeded`/.test(body) && !/status:\s*succeeded/.test(body)) continue;
    const hv = header.match(/viewer=([^\s]+)\s+pool=([^\s]+)/);
    if (!hv) continue;
    const viewerUserId = hv[1];
    const poolId = hv[2];
    const mJob = body.match(/pairwiseJobId=`([^`]+)`/);
    if (!mJob) continue;
    out.push({
      viewerUserId,
      poolId,
      pairwiseJobId: mJob[1],
      rowLabel: header.trim(),
    });
  }
  return out;
}

function assertApiDistBuilt() {
  const p = path.join(MONOREPO_ROOT, "apps", "api", "dist", "app.module.js");
  if (!fs.existsSync(p)) {
    console.error("Missing apps/api/dist. Run: cd apps/api && pnpm exec nest build");
    process.exit(1);
  }
}

function assertMetaChecks(meta, label) {
  const errs = [];
  if (!meta || typeof meta !== "object") errs.push("meta missing");
  else {
    if (meta.frozen !== true) errs.push(`meta.frozen expected true got ${meta.frozen}`);
    if (typeof meta.selectedCandidateUserId !== "string" || !meta.selectedCandidateUserId)
      errs.push("meta.selectedCandidateUserId missing");
    if (meta.appliedToFinalScore !== false) errs.push(`meta.appliedToFinalScore expected false got ${meta.appliedToFinalScore}`);
    if (meta.appliedToWorkerRanking !== false) errs.push(`meta.appliedToWorkerRanking expected false got ${meta.appliedToWorkerRanking}`);
  }
  if (errs.length) throw new Error(`${label}: ${errs.join("; ")}`);
}

async function main() {
  tryLoadMonorepoDotEnv();
  const args = parseArgs(process.argv);
  assertApiDistBuilt();
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required.");
    process.exit(1);
  }
  if (!fs.existsSync(args.inPath)) {
    console.error(`Missing pairwise run log: ${args.inPath}`);
    process.exit(1);
  }
  const md = fs.readFileSync(args.inPath, "utf8");
  const items = parseSucceededFromPairwiseRunMd(md);
  if (!items.length) {
    console.error("No succeeded rows parsed from pairwise run log.");
    process.exit(1);
  }

  const apiRequire = createRequire(path.join(MONOREPO_ROOT, "apps", "api", "package.json"));
  const { NestFactory } = apiRequire("@nestjs/core");
  const { AppModule } = await import(
    pathToFileURL(path.join(MONOREPO_ROOT, "apps", "api", "dist", "app.module.js")).href,
  );
  const { MatchingFinalizePairwiseService } = await import(
    pathToFileURL(
      path.join(
        MONOREPO_ROOT,
        "apps",
        "api",
        "dist",
        "modules",
        "matching",
        "matching-finalize-pairwise.service.js",
      ),
    ).href,
  );
  const { PrismaService } = await import(
    pathToFileURL(path.join(MONOREPO_ROOT, "apps", "api", "dist", "common", "prisma", "prisma.service.js")).href,
  );

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const finalize = app.get(MatchingFinalizePairwiseService);
  const prisma = app.get(PrismaService);

  let attempted = 0;
  let finalized = 0;
  let already = 0;
  let failed = 0;
  let frozenTotal = 0;
  const lines = [];

  lines.push(`# M4.2-M3-C — finalize-with-pairwise (local, not committed)`);
  lines.push(``);
  lines.push(`- **generatedAt**: ${new Date().toISOString()}`);
  lines.push(`- **sourceLog**: \`${path.relative(MONOREPO_ROOT, args.inPath)}\``);
  lines.push(`- **mode**: Nest \`MatchingFinalizePairwiseService.finalizeWithPairwise\` (= POST /matching/finalize-with-pairwise)`);
  lines.push(``);

  try {
    for (const it of items) {
      attempted += 1;
      const head = `## ${it.rowLabel}`;
      lines.push(head);
      lines.push(`viewerUserId=\`${it.viewerUserId}\` poolId=\`${it.poolId}\` pairwiseJobId=\`${it.pairwiseJobId}\``);
      lines.push(``);
      try {
        const r = await finalize.finalizeWithPairwise({
          viewerUserId: it.viewerUserId,
          poolId: it.poolId,
          pairwiseJobId: it.pairwiseJobId,
        });
        lines.push(`- response.status: \`${r.status}\``);
        if (r.status === "finalized") finalized += 1;
        else if (r.status === "already_frozen") already += 1;
        else {
          lines.push(`- note: unexpected status for M3-C path: ${r.status}`);
        }

        const row = await prisma.pairwisePoolFinalizeMeta.findUnique({
          where: {
            viewerUserId_poolId: {
              viewerUserId: it.viewerUserId,
              poolId: it.poolId,
            },
          },
        });
        if (!row) {
          throw new Error("PairwisePoolFinalizeMeta row missing after finalize");
        }
        lines.push(`- db: PairwisePoolFinalizeMeta id=\`${row.id}\` frozen=\`${row.frozen}\``);
        const meta = row.meta;
        assertMetaChecks(meta, it.poolId);
        lines.push(`- checks: meta.frozen=true, selectedCandidateUserId set, appliedToFinalScore=false, appliedToWorkerRanking=false`);
        lines.push(``);
      } catch (e) {
        failed += 1;
        lines.push(`- **error**: ${e instanceof Error ? e.message : String(e)}`);
        lines.push(``);
      }
    }
    frozenTotal = await prisma.pairwisePoolFinalizeMeta.count({ where: { frozen: true } });
  } finally {
    await app.close();
  }

  lines.push(`---`);
  lines.push(``);
  lines.push(`## Summary`);
  lines.push(``);
  lines.push(`| metric | value |`);
  lines.push(`|--------|------:|`);
  lines.push(`| attempted | ${attempted} |`);
  lines.push(`| finalized | ${finalized} |`);
  lines.push(`| already_finalized | ${already} |`);
  lines.push(`| failed | ${failed} |`);
  lines.push(`| pairwise_pool_finalize_meta (frozen=true) total | ${frozenTotal} |`);
  lines.push(``);
  lines.push(
    `**M4.2 batch regression**: ${frozenTotal >= 1 ? "Yes — re-run \`m4-2-batch-regression-report.mjs\` to refresh sampleCount / metrics." : "No rows."}`,
  );
  lines.push(``);

  fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
  fs.writeFileSync(args.outPath, lines.join("\n"), "utf8");
  console.log(`Wrote ${path.relative(MONOREPO_ROOT, args.outPath)}`);
  console.log(JSON.stringify({ attempted, finalized, already_finalized: already, failed, frozenMetaTotal: frozenTotal }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
