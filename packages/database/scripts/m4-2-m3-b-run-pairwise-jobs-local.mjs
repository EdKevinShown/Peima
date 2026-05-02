/**
 * M4.2-M3-B — Run pairwise jobs for first N NEED_PAIRWISE_JOB rows from local candidate list (no finalize, no MatchResult writes).
 *
 * Uses Nest `AiPairwiseDecisionJobService` (same persistence + LLM path as API create + **sync** run used in tests/worker),
 * not raw SQL. HTTP `POST .../run` only enqueues for worker; this script runs **`runPairwiseDecisionJobSync`** so jobs
 * complete without a separate worker process.
 *
 * From monorepo root:
 *   cd apps/api && pnpm exec nest build
 *   node --env-file=.env packages/database/scripts/m4-2-m3-b-run-pairwise-jobs-local.mjs
 *   node --env-file=.env packages/database/scripts/m4-2-m3-b-run-pairwise-jobs-local.mjs --offset 5 --limit 2 --out docs/M4/M4.2-m3-pairwise-run-2.local.md
 *
 * `--offset` skips the first N rows of the **第二节** NEED_PAIRWISE_JOB 表（按 `#` 升序，0-based）.
 *
 * Env: `DATABASE_URL`, `JWT_SECRET`, pairwise LLM (`AI_PAIRWISE_DECISION_ENABLED`, `AI_PAIRWISE_DECISION_API_KEY`, …).
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = path.join(__dirname, "..", "..", "..");

function tryLoadMonorepoDotEnv() {
  if (process.env.DATABASE_URL && process.env.JWT_SECRET) return;
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
  let limit = 5;
  let offset = 0;
  let candidatesPath = path.join(MONOREPO_ROOT, "docs", "M4", "M4.2-m3-finalize-candidate-list.local.md");
  let outPath = path.join(MONOREPO_ROOT, "docs", "M4", "M4.2-m3-pairwise-run.local.md");
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--offset" && argv[i + 1]) offset = Math.max(0, parseInt(String(argv[++i]), 10) || 0);
    else if (a.startsWith("--offset=")) offset = Math.max(0, parseInt(a.slice("--offset=".length), 10) || 0);
    else if (a === "--limit" && argv[i + 1]) limit = Math.max(1, parseInt(String(argv[++i]), 10) || 5);
    else if (a.startsWith("--limit=")) limit = Math.max(1, parseInt(a.slice("--limit=".length), 10) || 5);
    else if (a === "--candidates" && argv[i + 1]) {
      const v = String(argv[++i]);
      candidatesPath = path.isAbsolute(v) ? v : path.join(MONOREPO_ROOT, v);
    } else if (a.startsWith("--candidates=")) {
      const v = a.slice("--candidates=".length);
      candidatesPath = path.isAbsolute(v) ? v : path.join(MONOREPO_ROOT, v);
    } else if (a === "--out" && argv[i + 1]) {
      const v = String(argv[++i]);
      outPath = path.isAbsolute(v) ? v : path.join(MONOREPO_ROOT, v);
    } else if (a.startsWith("--out=")) {
      const v = a.slice("--out=".length);
      outPath = path.isAbsolute(v) ? v : path.join(MONOREPO_ROOT, v);
    }
  }
  return { limit, offset, candidatesPath, outPath };
}

/** Rows: | # | NEED_PAIRWISE_JOB | `viewer` | `pool` | `simJob` | ... */
function parseNeedPairwiseRowsFromLocalMd(text) {
  const idx = text.indexOf("## 第二节");
  const slice = idx >= 0 ? text.slice(idx) : text;
  const rows = [];
  const re = /^\|\s*(\d+)\s*\|\s*NEED_PAIRWISE_JOB\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/gm;
  let m;
  while ((m = re.exec(slice)) !== null) {
    rows.push({
      index: parseInt(m[1], 10),
      viewerUserId: m[2],
      poolId: m[3],
      simulationJobId: m[4],
    });
  }
  return rows.sort((a, b) => a.index - b.index);
}

function assertApiDistBuilt() {
  const appModuleJs = path.join(MONOREPO_ROOT, "apps", "api", "dist", "app.module.js");
  if (!fs.existsSync(appModuleJs)) {
    console.error("Missing apps/api/dist. Run: cd apps/api && pnpm exec nest build");
    process.exit(1);
  }
}

function pairwiseLlmConfigured() {
  const en = process.env.AI_PAIRWISE_DECISION_ENABLED?.trim().toLowerCase();
  const enabled = en === "1" || en === "true" || en === "yes";
  const key = (process.env.AI_PAIRWISE_DECISION_API_KEY ?? "").trim();
  return { enabled, hasKey: key.length > 0 };
}

async function main() {
  tryLoadMonorepoDotEnv();
  const args = parseArgs(process.argv);
  assertApiDistBuilt();

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required.");
    process.exit(1);
  }

  const cfg = pairwiseLlmConfigured();
  if (!cfg.enabled || !cfg.hasKey) {
    const msg = `Pairwise LLM not configured (AI_PAIRWISE_DECISION_ENABLED truthy + AI_PAIRWISE_DECISION_API_KEY required). Stopping without faking succeeded.`;
    console.error(msg);
    fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
    fs.writeFileSync(
      args.outPath,
      `# M4.2-M3-B pairwise run (aborted)\n\n- **at**: ${new Date().toISOString()}\n- **reason**: ${msg}\n`,
      "utf8",
    );
    process.exit(1);
  }

  if (!fs.existsSync(args.candidatesPath)) {
    console.error(`Candidates file missing: ${args.candidatesPath}`);
    process.exit(1);
  }
  const md = fs.readFileSync(args.candidatesPath, "utf8");
  const parsed = parseNeedPairwiseRowsFromLocalMd(md);
  const picked = parsed.slice(args.offset, args.offset + args.limit);
  if (!parsed.length) {
    console.error("No NEED_PAIRWISE_JOB table rows parsed. Check local candidate list format.");
    process.exit(1);
  }
  if (!picked.length) {
    console.error(
      `No rows in range offset=${args.offset} limit=${args.limit} (parsed ${parsed.length} rows).`,
    );
    process.exit(1);
  }

  const apiRequire = createRequire(path.join(MONOREPO_ROOT, "apps", "api", "package.json"));
  const { NestFactory } = apiRequire("@nestjs/core");
  const { AppModule } = await import(
    pathToFileURL(path.join(MONOREPO_ROOT, "apps", "api", "dist", "app.module.js")).href,
  );
  const { AiPairwiseDecisionJobService } = await import(
    pathToFileURL(
      path.join(
        MONOREPO_ROOT,
        "apps",
        "api",
        "dist",
        "modules",
        "ai-pairwise-decision",
        "ai-pairwise-decision-job.service.js",
      ),
    ).href,
  );

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const jobService = app.get(AiPairwiseDecisionJobService);

  const lines = [];
  lines.push(`# M4.2-M3-B — Pairwise job runs (local, not committed)`);
  lines.push(``);
  lines.push(`- **generatedAt**: ${new Date().toISOString()}`);
  lines.push(`- **source**: \`${path.relative(MONOREPO_ROOT, args.candidatesPath)}\``);
  lines.push(`- **tableSlice**: offset=${args.offset} limit=${args.limit} (第二节 NEED_PAIRWISE_JOB 行，按表 # 升序)`);
  lines.push(`- **mode**: Nest \`createOrReusePairwiseDecisionJob\` + \`runPairwiseDecisionJobSync\` (no HTTP; no finalize)`);
  lines.push(`- **candidatesAttempted**: ${picked.length}`);
  lines.push(``);

  let succeeded = 0;
  let failed = 0;
  let timeout = 0;

  try {
    for (const c of picked) {
      const block = [`## Row ${c.index}: viewer=${c.viewerUserId} pool=${c.poolId}`, `simulationJobId=${c.simulationJobId}`, ``];
      try {
        const created = await jobService.createOrReusePairwiseDecisionJob({
          viewerUserId: c.viewerUserId,
          poolId: c.poolId,
        });
        const jobId = created.job.id;
        block.push(`- create: reused=${created.reused} pairwiseJobId=\`${jobId}\``);
        const run = await jobService.runPairwiseDecisionJobSync(jobId);
        const j = run.job;
        block.push(`- run outcome: \`${run.outcome}\``);
        block.push(`- status: \`${j.status}\``);
        block.push(`- fallbackUsed: ${j.fallbackUsed}`);
        const code =
          j.failureDetail && typeof j.failureDetail === "object" && "code" in j.failureDetail
            ? String(/** @type {{ code?: string }} */ (j.failureDetail).code ?? "")
            : "";
        if (code) block.push(`- failureDetail.code: \`${code}\``);
        if (j.status === "succeeded") succeeded += 1;
        else if (j.status === "failed") failed += 1;
        else block.push(`- note: terminal status not succeeded/failed: ${j.status}`);
      } catch (e) {
        failed += 1;
        block.push(`- **error**: ${e instanceof Error ? e.message : String(e)}`);
      }
      lines.push(block.join("\n"));
      lines.push(``);
    }
  } finally {
    await app.close();
  }

  lines.push(`---`);
  lines.push(``);
  lines.push(`## Summary`);
  lines.push(``);
  lines.push(`| metric | value |`);
  lines.push(`|--------|------:|`);
  lines.push(`| attempted | ${picked.length} |`);
  lines.push(`| succeeded | ${succeeded} |`);
  lines.push(`| failed | ${failed} |`);
  lines.push(`| timeout | ${timeout} |`);
  lines.push(``);
  lines.push(
    `**M4.2-M3-C readiness**: ${succeeded >= 5 ? "Yes: at least 5 succeeded in this batch (finalize backlog next)." : succeeded >= 1 ? "Partial: some succeeded; may run finalize for those or add more pairwise runs." : "No: need LLM/worker fixes before finalize batch."}`,
  );
  lines.push(``);

  fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
  fs.writeFileSync(args.outPath, lines.join("\n"), "utf8");
  console.log(`Wrote ${path.relative(MONOREPO_ROOT, args.outPath)}`);
  console.log(JSON.stringify({ attempted: picked.length, succeeded, failed, timeout }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
