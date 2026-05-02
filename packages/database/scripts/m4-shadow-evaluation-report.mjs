/**
 * M4.1-M0 — Shadow evaluation report (read-only).
 * - Lists completed ai_simulation_v1 jobs via Prisma (read-only).
 * - Fetches per-job admin JSON to reuse buildRrmSimMultiCandidateDiagnostic + buildRrmRankingProposal from API (mode: api_readonly).
 * - No POST /run, no LLM, no DB writes, no MatchResult / finalScore changes.
 *
 * Run from monorepo root (Node 20+; recommended on Windows so CLI args reach this script):
 *   node --env-file=.env packages/database/scripts/m4-shadow-evaluation-report.mjs --jobId <id> --pretty
 *
 * If DATABASE_URL is unset, the script will try to load monorepo `.env` once (no values printed).
 * Alternate: `pnpm exec dotenv -e .env -- node ...` (on some Windows shells, prefer `--jobId=<id>` or env `M4_SHADOW_JOB_ID`).
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = path.join(__dirname, "..", "..", "..");

const SCHEMA_VERSION = 1;
const SOURCE_VERSION = "m4.1-shadow-evaluation-report-v1";
const MODE = "api_readonly";

/** Load KEY=VAL from monorepo `.env` only for keys not already set (never logs values). */
function tryLoadMonorepoDotEnv() {
  if (process.env.DATABASE_URL) return;
  const p = path.join(MONOREPO_ROOT, ".env");
  if (!fs.existsSync(p)) return;
  const raw = fs.readFileSync(p, "utf8");
  for (const line of raw.split(/\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    if (!key || key.includes(" ")) continue;
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function parseArgs(argv) {
  let limit = 20;
  let jobId = (process.env.M4_SHADOW_JOB_ID ?? "").trim();
  let outPath = "";
  let pretty = false;
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--limit" && argv[i + 1]) {
      limit = Math.max(1, Math.min(500, parseInt(String(argv[++i]), 10) || 20));
    } else if (a === "--jobId" && argv[i + 1]) {
      jobId = String(argv[++i]).trim();
    } else if (a.startsWith("--jobId=")) {
      jobId = a.slice("--jobId=".length).trim();
    } else if (a === "--out" && argv[i + 1]) {
      outPath = String(argv[++i]).trim();
    } else if (a.startsWith("--out=")) {
      outPath = a.slice("--out=".length).trim();
    } else if (a === "--pretty") {
      pretty = true;
    }
  }
  return { limit, jobId, outPath, pretty };
}

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function mean(nums) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function loadJsonwebtoken() {
  const require = createRequire(path.join(MONOREPO_ROOT, "apps", "api", "package.json"));
  return require("jsonwebtoken");
}

function firstAdminSub() {
  const raw = (process.env.PEIMA_ADMIN_USER_IDS ?? "")
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return raw[0] ?? "";
}

function signAdminJwt() {
  const jwt = loadJsonwebtoken();
  const secret = process.env.JWT_SECRET ?? "change-me-in-production";
  const sub = firstAdminSub();
  if (!sub) throw new Error("PEIMA_ADMIN_USER_IDS must list at least one admin user id (for admin GET only).");
  return jwt.sign({ sub, phone: "+8613800000000" }, secret, { expiresIn: "2h" });
}

function apiBaseUrl() {
  const u = (process.env.VITE_API_BASE_URL ?? process.env.API_PUBLIC_BASE_URL ?? "http://localhost:3000")
    .trim()
    .replace(/\/+$/, "");
  return u;
}

async function fetchAdminJob(jobId, token) {
  const url = `${apiBaseUrl()}/admin/ai-simulation/v1/jobs/${encodeURIComponent(jobId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, status: res.status, body: null, rawSnippet: text.slice(0, 200) };
  }
  return { ok: res.ok, status: res.status, body };
}

function pickExamples(rows, predicate, max = 10) {
  return rows.filter(predicate).slice(0, max).map((j) => ({
    jobId: j.jobId,
    existingTopCandidateUserId: j.existingTopCandidateUserId,
    rrmTopCandidateUserId: j.rrmTopCandidateUserId,
    scoreSpread: j.scoreRange?.spread ?? null,
    recommendation: j.recommendation,
    scoreDistributionFlag: j.scoreDistributionFlag,
  }));
}

function buildSummary(jobsRows) {
  const usableJobCount = jobsRows.length;
  const totalCandidateCount = jobsRows.reduce((a, j) => a + (j.candidateCount ?? 0), 0);
  const rrmAvailableCount = jobsRows.reduce((a, j) => a + (j.rrmAvailableCount ?? 0), 0);
  const fallbackCount = jobsRows.reduce((a, j) => a + (j.fallbackCount ?? 0), 0);
  const fallbackRate = totalCandidateCount > 0 ? fallbackCount / totalCandidateCount : 0;
  const changedTopCount = jobsRows.filter((j) => j.topCandidateChanged === true).length;
  const changedTopRate = usableJobCount > 0 ? changedTopCount / usableJobCount : 0;
  const spreads = jobsRows.map((j) => Number(j.scoreRange?.spread ?? 0)).filter((n) => Number.isFinite(n));
  const avgScoreSpread = mean(spreads);
  const medianScoreSpread = median(spreads);

  const scoreFlagDistribution = { ok: 0, too_narrow: 0, too_many_fallbacks: 0 };
  const recommendationDistribution = {
    do_not_use_for_ranking: 0,
    insufficient_separation: 0,
    review_manually: 0,
    supports_existing_rank: 0,
    diagnostic_only: 0,
  };
  for (const j of jobsRows) {
    const f = j.scoreDistributionFlag;
    if (f === "ok" || f === "too_narrow" || f === "too_many_fallbacks") {
      scoreFlagDistribution[f] += 1;
    }
    const r = j.recommendation;
    if (r && Object.prototype.hasOwnProperty.call(recommendationDistribution, r)) {
      recommendationDistribution[r] += 1;
    }
  }

  return {
    usableJobCount,
    skippedJobCount: 0,
    totalCandidateCount,
    rrmAvailableCount,
    fallbackCount,
    fallbackRate,
    changedTopCount,
    changedTopRate,
    avgScoreSpread,
    medianScoreSpread,
    scoreFlagDistribution,
    recommendationDistribution,
    changedTopExamples: pickExamples(jobsRows, (j) => j.topCandidateChanged === true),
    doNotUseForRankingExamples: pickExamples(jobsRows, (j) => j.recommendation === "do_not_use_for_ranking"),
    insufficientSeparationExamples: pickExamples(jobsRows, (j) => j.recommendation === "insufficient_separation"),
  };
}

async function main() {
  tryLoadMonorepoDotEnv();
  const { limit, jobId, outPath, pretty } = parseArgs(process.argv);

  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL is required. From repo root: node --env-file=.env packages/database/scripts/m4-shadow-evaluation-report.mjs ...",
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const skipped = [];
  const jobs = [];
  /** Total jobs returned from the initial Prisma scan (for list mode: up to capped window). */
  let scanTotal = 0;

  try {
    const token = signAdminJwt();

    let candidates = [];
    if (jobId) {
      const one = await prisma.aiSimulationV1Job.findFirst({
        where: { id: jobId },
        include: { items: { orderBy: { createdAt: "asc" } } },
      });
      scanTotal = one ? 1 : 0;
      candidates = one ? [one] : [];
      if (!one) {
        skipped.push({ jobId, skippedReason: "malformed_payload", detail: "job not found" });
      }
    } else {
      const rows = await prisma.aiSimulationV1Job.findMany({
        where: { jobStatus: "completed" },
        include: { items: { orderBy: { createdAt: "asc" } } },
        orderBy: { updatedAt: "desc" },
        take: Math.min(500, limit * 25),
      });
      scanTotal = rows.length;
      candidates = rows.filter((r) => r.items.length >= 3).slice(0, limit);
      for (const r of rows) {
        if (r.items.length < 3 && skipped.length < 200) {
          skipped.push({ jobId: r.id, skippedReason: "too_few_items", detail: `items=${r.items.length}` });
        }
      }
    }

    for (const row of candidates) {
      if (row.jobStatus !== "completed") {
        skipped.push({ jobId: row.id, skippedReason: "not_completed", detail: String(row.jobStatus) });
        continue;
      }
      if (row.items.length < 3) {
        skipped.push({ jobId: row.id, skippedReason: "too_few_items", detail: `items=${row.items.length}` });
        continue;
      }

      const fr = await fetchAdminJob(row.id, token);
      if (!fr.ok || !fr.body) {
        skipped.push({
          jobId: row.id,
          skippedReason: "no_diagnostic",
          detail: `http ${fr.status}`,
        });
        continue;
      }
      const diag = fr.body.rrmSimMultiCandidateDiagnostic;
      const prop = fr.body.rrmRankingProposal;
      if (!diag || !prop) {
        skipped.push({ jobId: row.id, skippedReason: "no_diagnostic", detail: "missing diagnostic or proposal in response" });
        continue;
      }

      /**
       * Batch mode: require rrmAvailableCount >= 3 for stable shadow cohort (no_rrm_ready_items).
       * Single --jobId: always include if API returned diagnostic+proposal (e.g. too_narrow / insufficient_separation).
       */
      const rrmAvail = Number(diag.diagnostics?.rrmAvailableCount ?? 0);
      if (!jobId && rrmAvail < 3) {
        skipped.push({
          jobId: row.id,
          skippedReason: "no_rrm_ready_items",
          detail: `rrmAvailableCount=${rrmAvail} (batch mode requires >=3 non-fallback)`,
        });
        continue;
      }

      jobs.push({
        jobId: row.id,
        viewerUserId: row.viewerUserId,
        candidateCount: row.items.length,
        rrmAvailableCount: diag.diagnostics.rrmAvailableCount,
        fallbackCount: diag.diagnostics.fallbackCount,
        scoreRange: diag.diagnostics.scoreRange,
        scoreDistributionFlag: diag.diagnostics.scoreDistributionFlag,
        recommendation: prop.recommendation,
        existingTopCandidateUserId: prop.existingTopCandidateUserId,
        rrmTopCandidateUserId: prop.rrmTopCandidateUserId,
        topCandidateChanged: prop.topCandidateChanged,
        confidenceLevel: prop.confidenceLevel,
        warnings: Array.isArray(prop.warnings) ? prop.warnings : [],
      });
    }

    const summary = buildSummary(jobs);
    summary.jobCount = scanTotal;
    summary.skippedJobCount = skipped.length;
    summary.usableJobCount = jobs.length;

    const report = {
      schemaVersion: SCHEMA_VERSION,
      sourceVersion: SOURCE_VERSION,
      generatedAt: new Date().toISOString(),
      mode: MODE,
      summary,
      jobs,
      skipped,
    };

    const text = JSON.stringify(report, null, pretty ? 2 : undefined);
    if (outPath) {
      fs.writeFileSync(path.resolve(outPath), text, "utf8");
    } else {
      process.stdout.write(text + "\n");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
