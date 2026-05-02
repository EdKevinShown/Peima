/**
 * M4.2-M3 — Read-only finalize candidate inventory (no DB writes, no finalize).
 *
 * Run from monorepo root:
 *   node packages/database/scripts/m4-2-m3-finalize-candidates-readonly.mjs
 *   node --env-file=.env packages/database/scripts/m4-2-m3-finalize-candidates-readonly.mjs --out docs/M4/M4.2-m3-finalize-candidate-list.local.md
 *
 * Output path default: docs/M4/M4.2-m3-finalize-candidate-list.local.md (gitignored).
 */
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  let outPath = path.join(MONOREPO_ROOT, "docs", "M4", "M4.2-m3-finalize-candidate-list.local.md");
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--out" && argv[i + 1]) {
      outPath = path.isAbsolute(argv[++i]) ? argv[i] : path.join(MONOREPO_ROOT, argv[i]);
    } else if (a.startsWith("--out=")) {
      const v = a.slice("--out=".length);
      outPath = path.isAbsolute(v) ? v : path.join(MONOREPO_ROOT, v);
    }
  }
  return { outPath };
}

/** Single primary readiness for succeeded-pairwise + no-finalize rows. */
function readinessSucceededNoFinalize({ hasPreview, hasCompletedSim, hasMatchResult }) {
  if (!hasPreview) return "MISSING_PREVIEW_POOL";
  if (!hasCompletedSim) return "NEED_SIMULATION_JOB";
  if (!hasMatchResult) return "MISSING_MATCH_RESULT";
  return "READY_TO_FINALIZE";
}

function rankReadiness(r) {
  const order = {
    READY_TO_FINALIZE: 0,
    MISSING_MATCH_RESULT: 1,
    NEED_SIMULATION_JOB: 2,
    MISSING_PREVIEW_POOL: 3,
  };
  return order[r] ?? 99;
}

const prisma = new PrismaClient();

async function main() {
  tryLoadMonorepoDotEnv();
  const { outPath } = parseArgs(process.argv);
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required (use --env-file=.env from repo root).");
    process.exit(1);
  }

  const succeededJobs = await prisma.aiPairwiseDecisionJob.findMany({
    where: { status: "succeeded" },
    select: {
      id: true,
      viewerUserId: true,
      poolId: true,
      completedAt: true,
      updatedAt: true,
    },
    orderBy: [{ completedAt: "desc" }, { updatedAt: "desc" }],
  });

  /** @type {Map<string, { viewerUserId: string, poolId: string, pairwiseJobId: string, sortKey: number }>} */
  const bestPairwiseByPair = new Map();
  for (const j of succeededJobs) {
    const key = `${j.viewerUserId}\t${j.poolId}`;
    if (bestPairwiseByPair.has(key)) continue;
    const t = j.completedAt?.getTime() ?? j.updatedAt.getTime();
    bestPairwiseByPair.set(key, {
      viewerUserId: j.viewerUserId,
      poolId: j.poolId,
      pairwiseJobId: j.id,
      sortKey: t,
    });
  }

  const sectionA = [];
  for (const row of bestPairwiseByPair.values()) {
    const meta = await prisma.pairwisePoolFinalizeMeta.findUnique({
      where: {
        viewerUserId_poolId: {
          viewerUserId: row.viewerUserId,
          poolId: row.poolId,
        },
      },
      select: { id: true },
    });
    if (meta) continue;

    const preview = await prisma.previewPool.findFirst({
      where: { id: row.poolId, userId: row.viewerUserId },
      select: { id: true },
    });
    const sim = await prisma.aiSimulationV1Job.findFirst({
      where: {
        viewerUserId: row.viewerUserId,
        poolId: row.poolId,
        jobStatus: "completed",
      },
      select: { id: true },
    });
    const mr = await prisma.matchResult.findFirst({
      where: { userId: row.viewerUserId },
      select: { id: true },
    });

    const hasPreview = Boolean(preview);
    const hasCompletedSim = Boolean(sim);
    const hasMatchResult = Boolean(mr);
    const readiness = readinessSucceededNoFinalize({ hasPreview, hasCompletedSim, hasMatchResult });

    sectionA.push({
      ...row,
      hasPreview,
      hasCompletedSim,
      hasMatchResult,
      readiness,
    });
  }

  sectionA.sort((a, b) => {
    const d = rankReadiness(a.readiness) - rankReadiness(b.readiness);
    if (d !== 0) return d;
    return b.sortKey - a.sortKey;
  });

  /** Section B: completed sim + preview, no succeeded pairwise for (v,p). */
  const completedSims = await prisma.aiSimulationV1Job.findMany({
    where: { jobStatus: "completed" },
    select: { viewerUserId: true, poolId: true, id: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  const bestSimByPair = new Map();
  for (const j of completedSims) {
    const key = `${j.viewerUserId}\t${j.poolId}`;
    if (bestSimByPair.has(key)) continue;
    bestSimByPair.set(key, {
      viewerUserId: j.viewerUserId,
      poolId: j.poolId,
      simulationJobId: j.id,
    });
  }

  const sectionB = [];
  for (const sim of bestSimByPair.values()) {
    const preview = await prisma.previewPool.findFirst({
      where: { id: sim.poolId, userId: sim.viewerUserId },
      select: { id: true },
    });
    if (!preview) continue;

    const succ = await prisma.aiPairwiseDecisionJob.findFirst({
      where: {
        viewerUserId: sim.viewerUserId,
        poolId: sim.poolId,
        status: "succeeded",
      },
      select: { id: true },
    });
    if (succ) continue;

    const meta = await prisma.pairwisePoolFinalizeMeta.findUnique({
      where: {
        viewerUserId_poolId: {
          viewerUserId: sim.viewerUserId,
          poolId: sim.poolId,
        },
      },
      select: { id: true },
    });
    if (meta) continue;

    const mr = await prisma.matchResult.findFirst({
      where: { userId: sim.viewerUserId },
      select: { id: true },
    });

    const anyPw = await prisma.aiPairwiseDecisionJob.findFirst({
      where: { viewerUserId: sim.viewerUserId, poolId: sim.poolId },
      select: { id: true, status: true },
    });

    let readiness = "NEED_PAIRWISE_JOB";
    if (anyPw && anyPw.status !== "succeeded") {
      readiness = "NEED_PAIRWISE_JOB";
    }

    sectionB.push({
      viewerUserId: sim.viewerUserId,
      poolId: sim.poolId,
      simulationJobId: sim.simulationJobId,
      hasMatchResult: Boolean(mr),
      pairwiseJobStatus: anyPw?.status ?? null,
      readiness,
    });
  }

  sectionB.sort((a, b) => {
    if (a.hasMatchResult !== b.hasMatchResult) return a.hasMatchResult ? -1 : 1;
    return 0;
  });

  const pickReady = sectionA.filter((r) => r.readiness === "READY_TO_FINALIZE").slice(0, 5);
  const topIds = new Set(pickReady.map((r) => `${r.viewerUserId}\t${r.poolId}`));
  /** @type {Array<Record<string, unknown>>} */
  let suggested = [...pickReady];
  if (suggested.length < 5) {
    for (const r of sectionA) {
      if (suggested.length >= 5) break;
      const k = `${r.viewerUserId}\t${r.poolId}`;
      if (topIds.has(k)) continue;
      if (r.readiness === "MISSING_PREVIEW_POOL") continue;
      suggested.push(r);
      topIds.add(k);
    }
  }
  suggested = suggested.slice(0, 5);

  /** When no finalize-ready rows: recommend first pools to run pairwise (Section B). */
  let suggestedPairwise = [];
  if (suggested.length === 0 && sectionB.length > 0) {
    suggestedPairwise = sectionB.slice(0, 5);
  }

  const lines = [];
  lines.push(`# M4.2-M3 — Finalize 候选池（只读生成，含 cuid）`);
  lines.push(``);
  lines.push(`- **生成时间**: ${new Date().toISOString()}`);
  lines.push(`- **说明**: 不含手机号/昵称等；仅 **内部 cuid** 供本地 finalize 前对照。`);
  lines.push(`- **勿提交**: 本文件默认路径已在根 \`.gitignore\`。`);
  lines.push(``);
  lines.push(`## Readiness 含义`);
  lines.push(``);
  lines.push(`| 标签 | 含义 |`);
  lines.push(`|------|------|`);
  lines.push(`| READY_TO_FINALIZE | pairwise \`succeeded\`、无 finalize meta、preview 归属一致、有 completed simulation、viewer 有 MatchResult |`);
  lines.push(`| MISSING_PREVIEW_POOL | pairwise 已成功但 **无** 对应 \`preview_pools(id,userId)\` → finalize 后 **仍进不了** M4.2 样本定义 |`);
  lines.push(`| NEED_SIMULATION_JOB | 缺 **completed** 的 \`ai_simulation_v1_jobs\`（该 viewer+pool）→ M4.1 RRM 腿可能缺；finalize API 本身仍可能可调用 |`);
  lines.push(`| MISSING_MATCH_RESULT | viewer **无** 任意 \`match_results\` 行 → M4.1 对照可能标 MATCH_RESULT_MISSING |`);
  lines.push(`| NEED_PAIRWISE_JOB | 第二节：有 preview + completed sim，但 **尚无** pairwise \`succeeded\` → 需先跑 pairwise worker / 任务 |`);
  lines.push(``);
  lines.push(`## 建议优先处理（目标 sampleCount ≥ 5）`);
  lines.push(``);
  if (suggested.length > 0) {
    lines.push(`下列 **${suggested.length}** 条按「先 READY，再其余第一节行（排除 MISSING_PREVIEW_POOL）」截取（最多 5 条），**下一步可 finalize**（本轮不执行）：`);
    lines.push(``);
    let i = 1;
    for (const r of suggested) {
      lines.push(
        `${i}. **${r.readiness}** — \`viewerUserId\`=\`${r.viewerUserId}\` \`poolId\`=\`${r.poolId}\` \`pairwiseJobId\`=\`${r.pairwiseJobId}\``,
      );
      i += 1;
    }
  } else if (suggestedPairwise.length > 0) {
    lines.push(
      `当前 **第一节** 无「pairwise succeeded 且未 finalize」行（常见原因：唯一 succeeded 对已 finalize，或尚无其它 succeeded）。`,
    );
    lines.push(`要抬升 M4.2 \`sampleCount\`，需先对下列 **${suggestedPairwise.length}** 个 **(viewer, pool)** 跑 pairwise 至 **\`succeeded\`**，再进入 finalize（本轮只读，不执行）：`);
    lines.push(``);
    let i = 1;
    for (const r of suggestedPairwise) {
      lines.push(
        `${i}. **${r.readiness}** — \`viewerUserId\`=\`${r.viewerUserId}\` \`poolId\`=\`${r.poolId}\` \`simulationJobId\`=\`${r.simulationJobId}\`（pairwiseStatus=${r.pairwiseJobStatus ?? "null"}）`,
      );
      i += 1;
    }
  } else {
    lines.push(`当前 **第一节、第二节** 均无候选；请检查 preview / simulation / pairwise 流水线。`);
  }
  lines.push(``);
  lines.push(`---`);
  lines.push(``);
  lines.push(`## 第一节 — pairwise succeeded 且尚无 finalize meta`);
  lines.push(``);
  lines.push(`**条数**: ${sectionA.length}`);
  lines.push(``);
  lines.push(`| # | readiness | viewerUserId | poolId | pairwiseJobId | preview | completedSim | matchResult |`);
  lines.push(`|---|-----------|----------------|--------|---------------|---------|----------------|-------------|`);
  let n = 1;
  for (const r of sectionA) {
    lines.push(
      `| ${n} | ${r.readiness} | \`${r.viewerUserId}\` | \`${r.poolId}\` | \`${r.pairwiseJobId}\` | ${r.hasPreview} | ${r.hasCompletedSim} | ${r.hasMatchResult} |`,
    );
    n += 1;
  }
  lines.push(``);
  lines.push(`---`);
  lines.push(``);
  lines.push(`## 第二节 — completed simulation + preview 齐，但无 pairwise succeeded（需先 pairwise）`);
  lines.push(``);
  lines.push(`**条数**: ${sectionB.length}`);
  lines.push(``);
  lines.push(`| # | readiness | viewerUserId | poolId | simulationJobId | pairwiseStatus | matchResult |`);
  lines.push(`|---|-----------|----------------|--------|-----------------|----------------|-------------|`);
  n = 1;
  for (const r of sectionB) {
    lines.push(
      `| ${n} | ${r.readiness} | \`${r.viewerUserId}\` | \`${r.poolId}\` | \`${r.simulationJobId}\` | ${r.pairwiseJobStatus ?? "null"} | ${r.hasMatchResult} |`,
    );
    n += 1;
  }
  lines.push(``);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`Wrote ${path.relative(MONOREPO_ROOT, outPath)} (${sectionA.length} section-A, ${sectionB.length} section-B rows)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
