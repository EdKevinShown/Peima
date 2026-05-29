/**
 * M1.3-M0/M2 — Offline calibration simulator (run via `npx tsx` from m13-m0-calibration-simulator.mjs).
 * @ts-nocheck
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PRODUCTION_TOO_NARROW_LT,
  classifyScoreDistribution,
  buildProposalRecommendation,
  expandRhythmScore,
  mean,
  median,
} from "./lib/m13-calibration-aggregate.mjs";
import {
  whatIfLowerDPrePenalty,
  whatIfLowerFCapEffect,
  whatIfCPredWeightingVariant,
  whatIfPerScenarioWeightVariant,
  whatIfDPreStaticCapProxy,
  whatIfDPreMajorRiskDedupProxy,
  whatIfDPreSoftCapProxy,
  canRunRrmWhatIf,
  debugSummaryFromAdminResults,
  debugSummaryProxyInputs,
  debugSummaryDPreProxyFromMapped,
  transcriptOnlyDPre,
  everyUsableRowHasTranscriptOnlyDPre,
} from "../apps/api/src/modules/ai-simulation-v1/rrm-sim-calibration-whatif.ts";
import {
  readDPreCalibrationEnvFromProcess,
  buildDPreStaticLiftCapShadowResult,
} from "../apps/api/src/modules/ai-simulation-v1/rrm-sim-d-pre-calibration-shadow.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = path.join(__dirname, "..");

const requireDb = createRequire(path.join(MONOREPO_ROOT, "packages", "database", "package.json"));
const { PrismaClient } = requireDb("@prisma/client");

const SCHEMA_VERSION = 1;
const SOURCE_VERSION = "m1.3-m5-calibration-simulator-v1";
const RRM_READY_V2 = "ai-match-simulation-rrm-ready-v2";

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
  const jobIds = [];
  let outPath = "";
  let pretty = false;
  let mode = "whatIf";
  let includeDebug = false;
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--limit" && argv[i + 1]) {
      limit = Math.max(1, Math.min(500, parseInt(String(argv[++i]), 10) || 20));
    } else if (a === "--jobId" && argv[i + 1]) {
      const raw = String(argv[++i]).trim();
      raw.split(/[\s,;]+/).forEach((x) => x && jobIds.push(x));
    } else if (a.startsWith("--jobId=")) {
      a.slice("--jobId=".length)
        .trim()
        .split(/[\s,;]+/)
        .forEach((x) => x && jobIds.push(x));
    } else if (a === "--out" && argv[i + 1]) {
      outPath = String(argv[++i]).trim();
    } else if (a.startsWith("--out=")) {
      outPath = a.slice("--out=".length).trim();
    } else if (a === "--pretty") {
      pretty = true;
    } else if (a === "--includeDebug") {
      includeDebug = true;
    } else if (a === "--mode" && argv[i + 1]) {
      const m = String(argv[++i]).trim().toLowerCase();
      if (m === "currentonly" || m === "whatif") mode = m === "currentonly" ? "currentOnly" : "whatIf";
    } else if (a.startsWith("--mode=")) {
      const m = a.slice("--mode=".length).trim().toLowerCase();
      mode = m === "currentonly" ? "currentOnly" : "whatIf";
    }
  }
  return { limit, jobIds, outPath, pretty, mode, includeDebug };
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

function readSimulationRankScore(evaluator) {
  if (evaluator == null || typeof evaluator !== "object" || Array.isArray(evaluator)) return null;
  const s = evaluator.simulationRankScore;
  if (typeof s === "number" && Number.isFinite(s)) return s;
  return null;
}

function parseRankedCandidateIds(job) {
  const d = job.shortlistDecisionV0;
  if (d && typeof d === "object" && !Array.isArray(d)) {
    const r = d.rankedCandidateUserIds;
    if (Array.isArray(r) && r.length > 0 && r.every((x) => typeof x === "string")) return r;
  }
  const f = job.shortlistFourDimV0;
  if (f && typeof f === "object" && !Array.isArray(f)) {
    const cmp = f.comparison;
    if (cmp && typeof cmp === "object" && !Array.isArray(cmp)) {
      const r = cmp.rankedCandidateUserIds;
      if (Array.isArray(r) && r.length > 0 && r.every((x) => typeof x === "string")) return r;
    }
  }
  const b = job.shortlistBinding;
  if (b && typeof b === "object" && !Array.isArray(b)) {
    const r = b.shortlistCandidateUserIds;
    if (Array.isArray(r) && r.length > 0 && r.every((x) => typeof x === "string")) return r;
  }
  return null;
}

function buildExistingSimulationRank(results, rankedHint) {
  const ids = new Set(results.map((r) => r.candidateUserId));
  const ordered = [];
  if (rankedHint) {
    for (const id of rankedHint) {
      if (ids.has(id) && !ordered.includes(id)) ordered.push(id);
    }
  }
  const rest = results
    .map((r) => r.candidateUserId)
    .filter((id) => !ordered.includes(id))
    .sort((a, b) => {
      const sa = readSimulationRankScore(results.find((x) => x.candidateUserId === a)?.evaluator ?? null);
      const sb = readSimulationRankScore(results.find((x) => x.candidateUserId === b)?.evaluator ?? null);
      if (sa != null && sb != null && sa !== sb) return sb - sa;
      if (sa != null && sb == null) return -1;
      if (sa == null && sb != null) return 1;
      return a.localeCompare(b);
    });
  for (const id of rest) ordered.push(id);
  return ordered;
}

function rhythmSortKey(rrm) {
  if (!rrm || typeof rrm !== "object") {
    return { nonFallback: false, score: -1 };
  }
  const fb = rrm.fallbackUsed === true;
  const raw = rrm.scores?.simulatedRhythmScore;
  const score = typeof raw === "number" && Number.isFinite(raw) ? raw : -1;
  return { nonFallback: !fb, score };
}

function inferJobSourceVersion(results) {
  for (const r of results) {
    const tl = r.transcriptLite;
    if (tl && typeof tl === "object" && !Array.isArray(tl)) {
      const sv = tl.sourceVersion;
      if (typeof sv === "string" && sv.trim()) return sv;
    }
  }
  return "unknown";
}

function buildMultiCandidateDiagnostic(params, tooNarrowSpreadLt) {
  const { jobId, viewerUserId, results, shortlistDecisionV0, shortlistFourDimV0, shortlistBinding } = params;
  const rankedHint = parseRankedCandidateIds({
    shortlistDecisionV0,
    shortlistFourDimV0,
    shortlistBinding,
  });
  const existingSimulationRank = buildExistingSimulationRank(results, rankedHint);
  const rankIndex = new Map(existingSimulationRank.map((id, i) => [id, i + 1]));

  const items = results.map((r) => {
    const rrm = r.rrmSimResult;
    const rhythm =
      rrm && typeof rrm === "object" && typeof rrm.scores?.simulatedRhythmScore === "number"
        ? rrm.scores.simulatedRhythmScore
        : null;
    return {
      candidateUserId: r.candidateUserId,
      status: r.status,
      existingRank: rankIndex.get(r.candidateUserId) ?? null,
      simulationRankScore: readSimulationRankScore(r.evaluator),
      aiSimulationV2Full: Boolean(
        r.transcriptLite &&
          typeof r.transcriptLite === "object" &&
          r.transcriptLite.schemaVersion === 2 &&
          r.transcriptLite.sourceVersion === RRM_READY_V2,
      ),
      simulatedRhythmScore: rhythm,
      suggestedAction: rrm && typeof rrm.suggestedAction === "string" ? rrm.suggestedAction : null,
      progressionWindow: rrm && typeof rrm.progressionWindow === "string" ? rrm.progressionWindow : null,
      fallbackUsed: rrm ? rrm.fallbackUsed === true : null,
      rrmUnavailableReason:
        rrm && (rrm.rrmUnavailableReason === null || typeof rrm.rrmUnavailableReason === "string")
          ? rrm.rrmUnavailableReason
          : null,
    };
  });

  const withId = results.map((r) => ({
    id: r.candidateUserId,
    rrm: r.rrmSimResult,
  }));

  const rrmRhythmRank = withId
    .slice()
    .sort((a, b) => {
      const ka = rhythmSortKey(a.rrm);
      const kb = rhythmSortKey(b.rrm);
      if (ka.nonFallback !== kb.nonFallback) return ka.nonFallback ? -1 : 1;
      if (ka.score !== kb.score) return kb.score - ka.score;
      return a.id.localeCompare(b.id);
    })
    .map((x) => x.id);

  const rrmAvailableCount = items.filter((i) => i.fallbackUsed === false).length;
  const fallbackCount = items.filter((i) => i.fallbackUsed === true).length;
  const total = results.length || 1;

  const availableRhythms = items
    .filter((i) => i.fallbackUsed === false && typeof i.simulatedRhythmScore === "number")
    .map((i) => i.simulatedRhythmScore);
  let min = 0;
  let max = 0;
  let spread = 0;
  if (availableRhythms.length > 0) {
    min = Math.min(...availableRhythms);
    max = Math.max(...availableRhythms);
    spread = max - min;
  }

  const narrowLt = tooNarrowSpreadLt == null ? PRODUCTION_TOO_NARROW_LT : tooNarrowSpreadLt;
  const scoreDistributionFlag = classifyScoreDistribution({
    spread,
    tooNarrowSpreadLt: narrowLt,
    rrmAvailableCount,
    fallbackCount,
    totalItemCount: total,
  });

  const topExisting = existingSimulationRank[0] ?? null;
  const topRrm = rrmRhythmRank[0] ?? null;
  const topCandidateChangedIfRrmOnly =
    topExisting != null && topRrm != null && topExisting.length > 0 && topRrm.length > 0 && topExisting !== topRrm;

  return {
    jobId,
    viewerUserId,
    sourceVersion: inferJobSourceVersion(results),
    items,
    rankings: {
      existingSimulationRank,
      rrmRhythmRank,
    },
    diagnostics: {
      rrmAvailableCount,
      fallbackCount,
      scoreRange: { min, max, spread },
      scoreDistributionFlag,
      topCandidateChangedIfRrmOnly,
    },
  };
}

function buildRankingProposalMinimal(diag) {
  const d = diag.diagnostics;
  const rankings = diag.rankings;
  const { recommendation, confidenceLevel } = buildProposalRecommendation({
    scoreDistributionFlag: d.scoreDistributionFlag,
    topChanged: d.topCandidateChangedIfRrmOnly === true,
    spread: d.scoreRange.spread,
    existingTop: rankings.existingSimulationRank[0] ?? null,
    rrmTop: rankings.rrmRhythmRank[0] ?? null,
  });
  const existingTop = diag.rankings.existingSimulationRank[0] ?? null;
  const rrmTop = diag.rankings.rrmRhythmRank[0] ?? null;
  return {
    recommendation,
    confidenceLevel,
    existingTopCandidateUserId: existingTop,
    rrmTopCandidateUserId: rrmTop,
    topCandidateChanged: diag.diagnostics.topCandidateChangedIfRrmOnly,
    scoreDistributionFlag: diag.diagnostics.scoreDistributionFlag,
  };
}

function cloneResultsWithRhythmMap(results) {
  return results.map((r) => {
    const rrm = r.rrmSimResult;
    if (!rrm || typeof rrm !== "object" || rrm.fallbackUsed === true) return r;
    const raw = rrm.scores?.simulatedRhythmScore;
    if (typeof raw !== "number" || !Number.isFinite(raw)) return r;
    const next = JSON.parse(JSON.stringify(r));
    const nextRrm = next.rrmSimResult;
    if (nextRrm && nextRrm.scores && typeof nextRrm.scores === "object") {
      const before = nextRrm.scores.simulatedRhythmScore;
      const after = expandRhythmScore(before);
      nextRrm.scores.simulatedRhythmScore = after;
    }
    return next;
  });
}

function applyWhatIfToResults(results, fn) {
  return results.map((r) => {
    const rrm = r.rrmSimResult;
    if (!rrm || rrm.fallbackUsed !== false || !canRunRrmWhatIf(rrm)) {
      return r;
    }
    const out = fn(rrm, r);
    if (!out) return r;
    const next = JSON.parse(JSON.stringify(r));
    if (next.rrmSimResult?.scores) {
      next.rrmSimResult.scores.simulatedRhythmScore = out.simulatedRhythmScore;
      next.rrmSimResult.scores.RFI_sim = out.RFI_sim;
      if (typeof out.dPreAfter === "number") {
        next.rrmSimResult.scores.D_pre = out.dPreAfter;
      }
    }
    if (out.suggestedAction && out.progressionWindow) {
      next.rrmSimResult.suggestedAction = out.suggestedAction;
      next.rrmSimResult.progressionWindow = out.progressionWindow;
    }
    return next;
  });
}

function accumulateDPreProxyGlobals(acc, results, mapped) {
  if (!acc._dPreBeforeVals) acc._dPreBeforeVals = [];
  if (!acc._dPreAfterVals) acc._dPreAfterVals = [];
  if (!acc._staticLiftVals) acc._staticLiftVals = [];
  for (let i = 0; i < results.length; i += 1) {
    const r = results[i];
    const m = mapped[i];
    if (r.status !== "succeeded" || !r.rrmSimResult || r.rrmSimResult.fallbackUsed !== false) continue;
    if (!m?.rrmSimResult || m.rrmSimResult.fallbackUsed !== false) continue;
    const br = r.rrmSimResult.scores?.D_pre;
    const ar = m.rrmSimResult.scores?.D_pre;
    if (typeof br === "number") acc._dPreBeforeVals.push(br);
    if (typeof ar === "number") acc._dPreAfterVals.push(ar);
    const dt = transcriptOnlyDPre(r.transcriptLite);
    acc._staticLiftVals.push(dt != null ? Math.max(0, br - dt) : 0);
  }
}

function buildM5PerJobExtras(jobParams, diagCurrent, results, mapped) {
  const spreadBefore = diagCurrent.diagnostics.scoreRange.spread;
  const diagAfter = buildMultiCandidateDiagnostic({ ...jobParams, results: mapped }, null);
  const spreadAfter = diagAfter.diagnostics.scoreRange.spread;
  const beforeList = [];
  const afterList = [];
  let saChange = 0;
  let pwChange = 0;
  for (let i = 0; i < results.length; i += 1) {
    const r = results[i];
    const m = mapped[i];
    if (r.status !== "succeeded" || !r.rrmSimResult || r.rrmSimResult.fallbackUsed !== false) continue;
    if (!m?.rrmSimResult) continue;
    const db = r.rrmSimResult.scores?.D_pre;
    const da = m.rrmSimResult.scores?.D_pre;
    if (typeof db === "number") beforeList.push(db);
    if (typeof da === "number") afterList.push(da);
    const os = r.rrmSimResult.suggestedAction;
    const ns = m.rrmSimResult.suggestedAction;
    if (typeof os === "string" && typeof ns === "string" && os !== ns) saChange += 1;
    const opw = r.rrmSimResult.progressionWindow;
    const npw = m.rrmSimResult.progressionWindow;
    if (typeof opw === "string" && typeof npw === "string" && opw !== npw) pwChange += 1;
  }
  const safeMin = (arr) => (arr.length ? Math.min(...arr) : 0);
  const safeMax = (arr) => (arr.length ? Math.max(...arr) : 0);
  const safeMean = (arr) => (arr.length ? mean(arr) : 0);
  const dPreItemBeforeAfter = [];
  for (let i = 0; i < results.length; i += 1) {
    const r = results[i];
    const m = mapped[i];
    dPreItemBeforeAfter.push({
      candidateUserId: r.candidateUserId,
      status: r.status,
      dPreBefore: r.rrmSimResult?.scores?.D_pre ?? null,
      dPreAfter: m?.rrmSimResult?.scores?.D_pre ?? null,
    });
  }
  return {
    spreadBefore,
    spreadAfter,
    dPreAggregate: {
      minBefore: safeMin(beforeList),
      maxBefore: safeMax(beforeList),
      meanBefore: safeMean(beforeList),
      minAfter: safeMin(afterList),
      maxAfter: safeMax(afterList),
      meanAfter: safeMean(afterList),
    },
    dPreItemBeforeAfter,
    suggestedActionChangeCount: saChange,
    progressionWindowChangeCount: pwChange,
  };
}

function isDbM0PreusableItem(it) {
  if (it.status !== "succeeded") return false;
  const tl = it.transcriptLite;
  if (!tl || typeof tl !== "object") return false;
  if (tl.schemaVersion !== 2) return false;
  if (tl.sourceVersion !== RRM_READY_V2) return false;
  return true;
}

function countAdminUsableNonFallback(results) {
  return results.filter((r) => {
    if (r.status !== "succeeded") return false;
    const tl = r.transcriptLite;
    if (!tl || typeof tl !== "object" || tl.schemaVersion !== 2 || tl.sourceVersion !== RRM_READY_V2) return false;
    const fb = r.rrmSimResult?.fallbackUsed;
    return fb === false;
  }).length;
}

function emptyPerConfigSummary() {
  return {
    scoreFlagDistribution: { ok: 0, too_narrow: 0, too_many_fallbacks: 0 },
    recommendationDistribution: {
      do_not_use_for_ranking: 0,
      insufficient_separation: 0,
      review_manually: 0,
      supports_existing_rank: 0,
      diagnostic_only: 0,
    },
    avgSpread: 0,
    medianSpread: 0,
    changedTopRate: 0,
    okCount: 0,
    tooNarrowCount: 0,
    insufficientSeparationCount: 0,
  };
}

function accumulateJobSummary(acc, diag, prop) {
  const flag = diag.diagnostics.scoreDistributionFlag;
  if (flag === "ok" || flag === "too_narrow" || flag === "too_many_fallbacks") {
    acc.scoreFlagDistribution[flag] += 1;
  }
  const rec = prop.recommendation;
  if (rec && Object.prototype.hasOwnProperty.call(acc.recommendationDistribution, rec)) {
    acc.recommendationDistribution[rec] += 1;
  }
  const sp = Number(diag.diagnostics.scoreRange.spread ?? 0);
  if (Number.isFinite(sp)) acc.spreads.push(sp);
  if (flag === "ok") acc.okCount += 1;
  if (flag === "too_narrow") acc.tooNarrowCount += 1;
  if (prop.recommendation === "insufficient_separation") acc.insufficientSeparationCount += 1;
}

function finalizePerConfigSummary(partial, jobCount, changedTopVsCurrent) {
  const acc = partial;
  const spreads = acc.spreads;
  delete acc.spreads;
  acc.avgSpread = mean(spreads);
  acc.medianSpread = median(spreads);
  acc.changedTopRate = jobCount > 0 ? changedTopVsCurrent / jobCount : 0;
  return acc;
}

function calibrationConfigMeta(includeDebug) {
  return [
    { id: "current", description: "Production-equivalent baseline from admin GET (enriched rrmSimResult).", status: "active" },
    {
      id: "threshold_spread_5",
      description: "Diagnostic only: too_narrow when spread < 5 (production uses < 8). Rhythm unchanged.",
      status: "active",
    },
    {
      id: "threshold_spread_3",
      description: "Diagnostic only: too_narrow when spread < 3.",
      status: "active",
    },
    {
      id: "rhythm_mapping_expanded",
      description:
        "Offline proxy: score' = round(clamp(50 + (score-50)*1.5, 0, 100)) per non-fallback rrmSimResult; then full diagnostic recompute. Not formal RFI mapping.",
      status: "active",
    },
    {
      id: "lower_d_pre_penalty",
      description: includeDebug
        ? "Offline proxy (M1.3-M2): D_pre' = clamp01(D_pre * 0.75) inside per-scenario RFI recompute from stored scenarioScores; not production."
        : "Pass --includeDebug to enable M1.3-M2 offline what-if.",
      status: includeDebug ? "active" : "not_available_in_m0",
      ...(includeDebug ? {} : { reason: "requires --includeDebug" }),
    },
    {
      id: "lower_f_cap_effect",
      description: includeDebug
        ? "Offline proxy: F' = min(0.95, clamp01(F_sim+0.07)) in RFI recompute from admin scores + scenarioScores."
        : "Pass --includeDebug to enable M1.3-M2 offline what-if.",
      status: includeDebug ? "active" : "not_available_in_m0",
      ...(includeDebug ? {} : { reason: "requires --includeDebug" }),
    },
    {
      id: "c_pred_weighting_variant",
      description: includeDebug
        ? "Offline proxy: C_pred' = clamp01(C_pred + 0.05) in RFI recompute (tools-only)."
        : "Pass --includeDebug to enable M1.3-M2 offline what-if.",
      status: includeDebug ? "active" : "not_available_in_m0",
      ...(includeDebug ? {} : { reason: "requires --includeDebug" }),
    },
    {
      id: "per_scenario_weight_variant",
      description: includeDebug
        ? "Offline proxy: re-weight stored RFI_scenario with boosted personal_sharing / emotional_support_light (renormalized); not production weights."
        : "Pass --includeDebug to enable M1.3-M2 offline what-if.",
      status: includeDebug ? "active" : "not_available_in_m0",
      ...(includeDebug ? {} : { reason: "requires --includeDebug" }),
    },
    {
      id: "d_pre_static_cap_proxy",
      description: includeDebug
        ? "M1.3-M5 offline: D'=clamp01(D_tx+min(D_admin−D_tx,0.25)); D_tx=extractDPre(tl,null). Not production."
        : "Pass --includeDebug for M1.3-M5 D_pre proxies.",
      status: includeDebug ? "active" : "not_available_in_m0",
      ...(includeDebug ? {} : { reason: "requires --includeDebug" }),
    },
    {
      id: "d_pre_major_risk_dedup_proxy",
      description: includeDebug
        ? "M1.3-M5 offline: D'=clamp01(D_tx+min(staticLift,0.18)); proxyBasis=static_lift_capped_as_dedup_proxy. Not precise dedup."
        : "Pass --includeDebug for M1.3-M5 D_pre proxies.",
      status: includeDebug ? "active" : "not_available_in_m0",
      ...(includeDebug ? {} : { reason: "requires --includeDebug" }),
    },
    {
      id: "d_pre_soft_cap_proxy",
      description: includeDebug
        ? "M1.3-M5 offline: above 0.8, D'=0.8+(D−0.8)*0.35 then clamp01. Not production."
        : "Pass --includeDebug for M1.3-M5 D_pre proxies.",
      status: includeDebug ? "active" : "not_available_in_m0",
      ...(includeDebug ? {} : { reason: "requires --includeDebug" }),
    },
    {
      id: "d_pre_score_gate_split_proxy",
      description: "Deferred (M1.3-M4): RFI vs gate D split — safety review required before simulator.",
      status: "deferred",
      reason: "M1.3-M4 decision — not implemented in M1.3-M5",
    },
    {
      id: "d_pre_viewer_relative_proxy",
      description: "Deferred (M1.3-M4): viewer cohort normalization — risk of relaxing real hazards.",
      status: "deferred",
      reason: "M1.3-M4 decision — not implemented in M1.3-M5",
    },
  ];
}

async function main() {
  tryLoadMonorepoDotEnv();
  const { limit, jobIds, outPath, pretty, mode, includeDebug } = parseArgs(process.argv);

  let evaluateRrmSimDebugFromSimulationV2;
  if (includeDebug) {
    const m = await import("../apps/api/src/modules/ai-simulation-v1/rrm-sim.evaluator-debug.ts");
    evaluateRrmSimDebugFromSimulationV2 = m.evaluateRrmSimDebugFromSimulationV2;
  }

  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL is required. From repo root: node --env-file=.env tools/m13-m0-calibration-simulator.mjs ...",
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const skipped = [];
  const perJobDiff = [];
  const token = signAdminJwt();

  let configIdsActive =
    mode === "currentOnly" ? ["current"] : ["current", "threshold_spread_5", "threshold_spread_3", "rhythm_mapping_expanded"];
  if (includeDebug && mode === "whatIf") {
    configIdsActive = [
      ...configIdsActive,
      "lower_d_pre_penalty",
      "lower_f_cap_effect",
      "c_pred_weighting_variant",
      "per_scenario_weight_variant",
      "d_pre_static_cap_proxy",
      "d_pre_major_risk_dedup_proxy",
      "d_pre_soft_cap_proxy",
    ];
  }

  const perConfigAccum = {};
  for (const id of configIdsActive) {
    perConfigAccum[id] = { ...emptyPerConfigSummary(), spreads: [], _changedTop: 0 };
  }

  try {
    let candidates = [];
    if (jobIds.length > 0) {
      for (const jid of jobIds) {
        const one = await prisma.aiSimulationV1Job.findFirst({
          where: { id: jid },
          include: { items: { orderBy: { createdAt: "asc" } } },
        });
        if (!one) {
          skipped.push({ jobId: jid, reason: "job_not_found", detail: "" });
        } else {
          candidates.push(one);
        }
      }
    } else {
      const rows = await prisma.aiSimulationV1Job.findMany({
        where: { jobStatus: "completed" },
        include: { items: { orderBy: { createdAt: "asc" } } },
        orderBy: { updatedAt: "desc" },
        take: Math.min(500, limit * 25),
      });
      candidates = rows.filter((r) => r.items.filter(isDbM0PreusableItem).length >= 3).slice(0, limit);
      for (const r of rows) {
        if (r.items.filter(isDbM0PreusableItem).length < 3 && skipped.length < 200) {
          skipped.push({
            jobId: r.id,
            reason: "too_few_db_rrm_ready_items",
            detail: `succeeded+v2 items=${r.items.filter(isDbM0PreusableItem).length}`,
          });
        }
      }
    }

    const scanTotal = candidates.length;

    for (const row of candidates) {
      if (row.jobStatus !== "completed") {
        skipped.push({ jobId: row.id, reason: "not_completed", detail: String(row.jobStatus) });
        continue;
      }

      const fr = await fetchAdminJob(row.id, token);
      if (!fr.ok || !fr.body) {
        skipped.push({
          jobId: row.id,
          reason: "admin_get_failed",
          detail: `http ${fr.status} ${(fr.rawSnippet ?? "").slice(0, 120)}`,
        });
        continue;
      }
      const body = fr.body;
      const apiDiag = body.rrmSimMultiCandidateDiagnostic;
      const apiProp = body.rrmRankingProposal;
      if (!apiDiag || !apiProp) {
        skipped.push({
          jobId: row.id,
          reason: "missing_diagnostic",
          detail: "no rrmSimMultiCandidateDiagnostic or rrmRankingProposal",
        });
        continue;
      }

      const results = Array.isArray(body.results) ? body.results : [];
      const usableCount = countAdminUsableNonFallback(results);
      if (usableCount < 3) {
        skipped.push({
          jobId: row.id,
          reason: "too_few_usable_non_fallback",
          detail: `usableNonFallback=${usableCount}`,
        });
        continue;
      }

      const jobParams = {
        jobId: row.id,
        viewerUserId: row.viewerUserId,
        results,
        shortlistDecisionV0: body.shortlistDecisionV0,
        shortlistFourDimV0: body.shortlistFourDimV0,
        shortlistBinding: body.shortlistBinding,
      };

      const diagCurrent = apiDiag;
      const propCurrent = {
        recommendation: apiProp.recommendation,
        confidenceLevel: apiProp.confidenceLevel,
        existingTopCandidateUserId: apiProp.existingTopCandidateUserId ?? null,
        rrmTopCandidateUserId: apiProp.rrmTopCandidateUserId ?? null,
        topCandidateChanged: apiProp.topCandidateChanged === true,
        scoreDistributionFlag: apiProp.scoreDistributionFlag ?? diagCurrent.diagnostics.scoreDistributionFlag,
      };

      const itemScoresRhythmMapProbe = results.map((r) => {
        const rrm = r.rrmSimResult;
        const before =
          rrm && typeof rrm === "object" && typeof rrm.scores?.simulatedRhythmScore === "number"
            ? rrm.scores.simulatedRhythmScore
            : null;
        const after = before != null && Number.isFinite(before) ? expandRhythmScore(before) : null;
        return {
          candidateUserId: r.candidateUserId,
          status: r.status,
          simulatedRhythmScoreBefore: before,
          simulatedRhythmScoreAfterRhythmMapProxy: after,
        };
      });

      const perConfig = {};

      const pack = (id, diag, prop, mappedResultsForItems, proxyKind, m5Extras = null) => {
        if (m5Extras?.notAvailable) {
          const spread = diag.diagnostics.scoreRange.spread;
          const row = {
            notAvailable: true,
            reason: m5Extras.notAvailableReason ?? "d_pre_tx_proxy_unavailable",
            spread,
            scoreRange: { ...diag.diagnostics.scoreRange },
            scoreDistributionFlag: diag.diagnostics.scoreDistributionFlag,
            recommendation: prop.recommendation,
            rrmTopCandidateUserId: prop.rrmTopCandidateUserId,
            topCandidateChanged: prop.topCandidateChanged,
            itemScoresBeforeAfter: results.map((r) => {
              const rrm = r.rrmSimResult;
              const b =
                rrm && typeof rrm === "object" && typeof rrm.scores?.simulatedRhythmScore === "number"
                  ? rrm.scores.simulatedRhythmScore
                  : null;
              return {
                candidateUserId: r.candidateUserId,
                status: r.status,
                simulatedRhythmScoreBefore: b,
                simulatedRhythmScoreAfter: b,
              };
            }),
            proxyNotes: m5Extras.proxyNotes ?? [],
          };
          if (includeDebug) {
            const ds = debugSummaryFromAdminResults(results);
            row.debugSummary = {
              avgDPreBefore: ds.avgDPre,
              avgDPreAfter: ds.avgDPre,
              avgStaticLift: 0,
              avgFSim: ds.avgFSim,
              avgCPred: ds.avgCPred,
              avgRPre: ds.avgRPre,
            };
            row.avgDPreBefore = ds.avgDPre;
            row.avgDPreAfter = ds.avgDPre;
            row.avgStaticLift = 0;
            row.spreadBefore = spread;
            row.spreadAfter = spread;
            row.dPreAggregate = null;
          }
          perConfig[id] = row;
          return;
        }
        const spread = diag.diagnostics.scoreRange.spread;
        const itemScoresBeforeAfter = results.map((r, i) => {
          const rrm = r.rrmSimResult;
          const before =
            rrm && typeof rrm === "object" && typeof rrm.scores?.simulatedRhythmScore === "number"
              ? rrm.scores.simulatedRhythmScore
              : null;
          const afterSrc = mappedResultsForItems ? mappedResultsForItems[i] : r;
          const ar = afterSrc?.rrmSimResult?.scores?.simulatedRhythmScore;
          const after = typeof ar === "number" && Number.isFinite(ar) ? ar : before;
          return {
            candidateUserId: r.candidateUserId,
            status: r.status,
            simulatedRhythmScoreBefore: before,
            simulatedRhythmScoreAfter: after,
          };
        });
        const row = {
          spread,
          scoreRange: { ...diag.diagnostics.scoreRange },
          scoreDistributionFlag: diag.diagnostics.scoreDistributionFlag,
          recommendation: prop.recommendation,
          rrmTopCandidateUserId: prop.rrmTopCandidateUserId,
          topCandidateChanged: prop.topCandidateChanged,
          itemScoresBeforeAfter,
        };
        if (includeDebug) {
          if (m5Extras) {
            row.debugSummary = debugSummaryDPreProxyFromMapped(results, mappedResultsForItems);
            row.avgDPreBefore = row.debugSummary.avgDPreBefore;
            row.avgDPreAfter = row.debugSummary.avgDPreAfter;
            row.avgStaticLift = row.debugSummary.avgStaticLift;
            row.spreadBefore = m5Extras.spreadBefore;
            row.spreadAfter = m5Extras.spreadAfter;
            row.dPreAggregate = m5Extras.dPreAggregate;
            row.proxyNotes = m5Extras.proxyNotes;
            row.suggestedActionChangeCount = m5Extras.suggestedActionChangeCount;
            row.progressionWindowChangeCount = m5Extras.progressionWindowChangeCount;
            if (m5Extras.dPreItemBeforeAfter) row.dPreItemBeforeAfter = m5Extras.dPreItemBeforeAfter;
          } else {
            row.debugSummary = proxyKind
              ? debugSummaryProxyInputs(proxyKind, results)
              : debugSummaryFromAdminResults(results);
          }
        }
        perConfig[id] = row;
      };

      pack("current", diagCurrent, propCurrent, null, null);
      accumulateJobSummary(perConfigAccum.current, diagCurrent, propCurrent);

      let includeDebugProbe = null;
      if (includeDebug && evaluateRrmSimDebugFromSimulationV2) {
        let checked = 0;
        let matchesAdminRhythm = 0;
        for (const r of results) {
          if (r.status !== "succeeded") continue;
          const tl = r.transcriptLite;
          if (!tl || typeof tl !== "object" || tl.schemaVersion !== 2 || tl.sourceVersion !== RRM_READY_V2) continue;
          if (r.rrmSimResult?.fallbackUsed !== false) continue;
          checked += 1;
          const dbg = evaluateRrmSimDebugFromSimulationV2(tl, null);
          const adminRhythm = r.rrmSimResult?.scores?.simulatedRhythmScore;
          if (dbg.ok && dbg.debug && typeof adminRhythm === "number" && dbg.debug.mapping.finalRhythmScore === adminRhythm) {
            matchesAdminRhythm += 1;
          }
        }
        includeDebugProbe = {
          transcriptOnlyItemsChecked: checked,
          debugFinalRhythmMatchesAdminRhythm: matchesAdminRhythm,
          note:
            "evaluateRrmSimDebugFromSimulationV2(transcriptLite, null) vs admin rrmSimResult; mismatch expected when production used staticContext.",
        };
      }

      if (mode === "whatIf") {
        const diag5 = buildMultiCandidateDiagnostic(jobParams, 5);
        const prop5 = buildRankingProposalMinimal(diag5);
        pack("threshold_spread_5", diag5, prop5, null, null);
        accumulateJobSummary(perConfigAccum.threshold_spread_5, diag5, prop5);
        if (prop5.rrmTopCandidateUserId !== propCurrent.rrmTopCandidateUserId) {
          perConfigAccum.threshold_spread_5._changedTop += 1;
        }

        const diag3 = buildMultiCandidateDiagnostic(jobParams, 3);
        const prop3 = buildRankingProposalMinimal(diag3);
        pack("threshold_spread_3", diag3, prop3, null, null);
        accumulateJobSummary(perConfigAccum.threshold_spread_3, diag3, prop3);
        if (prop3.rrmTopCandidateUserId !== propCurrent.rrmTopCandidateUserId) {
          perConfigAccum.threshold_spread_3._changedTop += 1;
        }

        const mappedResults = cloneResultsWithRhythmMap(results);
        const diagMap = buildMultiCandidateDiagnostic({ ...jobParams, results: mappedResults }, null);
        const propMap = buildRankingProposalMinimal(diagMap);
        pack("rhythm_mapping_expanded", diagMap, propMap, mappedResults, null);
        accumulateJobSummary(perConfigAccum.rhythm_mapping_expanded, diagMap, propMap);
        if (propMap.rrmTopCandidateUserId !== propCurrent.rrmTopCandidateUserId) {
          perConfigAccum.rhythm_mapping_expanded._changedTop += 1;
        }

        if (includeDebug) {
          const specs = [
            { id: "lower_d_pre_penalty", fn: (rrm) => whatIfLowerDPrePenalty(rrm), proxyKind: "lower_d_pre_penalty" },
            { id: "lower_f_cap_effect", fn: (rrm) => whatIfLowerFCapEffect(rrm), proxyKind: "lower_f_cap_effect" },
            { id: "c_pred_weighting_variant", fn: (rrm) => whatIfCPredWeightingVariant(rrm), proxyKind: "c_pred_weighting_variant" },
            {
              id: "per_scenario_weight_variant",
              fn: (rrm) => whatIfPerScenarioWeightVariant(rrm),
              proxyKind: "per_scenario_weight_variant",
            },
          ];
          for (const { id, fn, proxyKind } of specs) {
            const mapped = applyWhatIfToResults(results, (rrm, row) => fn(rrm, row));
            const diagW = buildMultiCandidateDiagnostic({ ...jobParams, results: mapped }, null);
            const propW = buildRankingProposalMinimal(diagW);
            pack(id, diagW, propW, mapped, proxyKind, null);
            accumulateJobSummary(perConfigAccum[id], diagW, propW);
            if (propW.rrmTopCandidateUserId !== propCurrent.rrmTopCandidateUserId) {
              perConfigAccum[id]._changedTop += 1;
            }
          }

          const m5Specs = [
            {
              id: "d_pre_static_cap_proxy",
              requiresTranscriptDPre: true,
              fn: (rrm, row) => whatIfDPreStaticCapProxy(rrm, row.transcriptLite),
              proxyNotes: [
                "D'=clamp01(D_tx+min(D_admin−D_tx,0.25)); D_tx=extractDPre(transcriptLite,null).",
                "See docs/M1/M1.3-d-pre-calibration-proposal.md",
              ],
            },
            {
              id: "d_pre_major_risk_dedup_proxy",
              requiresTranscriptDPre: true,
              fn: (rrm, row) => whatIfDPreMajorRiskDedupProxy(rrm, row.transcriptLite),
              proxyNotes: [
                "proxyBasis=static_lift_capped_as_dedup_proxy (max +0.18 on static lift); not exact majorRisks dedup.",
                "See docs/M1/M1.3-d-pre-calibration-proposal.md",
              ],
            },
            {
              id: "d_pre_soft_cap_proxy",
              requiresTranscriptDPre: false,
              fn: (rrm, _row) => whatIfDPreSoftCapProxy(rrm),
              proxyNotes: ["D'=0.8+(D−0.8)*0.35 for D>0.8, then clamp01.", "See docs/M1/M1.3-d-pre-calibration-proposal.md"],
            },
          ];
          for (const spec of m5Specs) {
            if (spec.requiresTranscriptDPre && !everyUsableRowHasTranscriptOnlyDPre(results)) {
              pack(spec.id, diagCurrent, propCurrent, null, null, {
                notAvailable: true,
                notAvailableReason: "missing_transcript_d_pre_for_one_or_more_candidates",
                proxyNotes: [
                  ...spec.proxyNotes,
                  "NOT APPLIED: D_tx=extractDPre(transcriptLite,null) unavailable for at least one usable candidate.",
                ],
              });
              continue;
            }
            const mapped = applyWhatIfToResults(results, spec.fn);
            const diagW = buildMultiCandidateDiagnostic({ ...jobParams, results: mapped }, null);
            const propW = buildRankingProposalMinimal(diagW);
            accumulateDPreProxyGlobals(perConfigAccum[spec.id], results, mapped);
            const agg = buildM5PerJobExtras(jobParams, diagCurrent, results, mapped);
            pack(spec.id, diagW, propW, mapped, null, { ...agg, proxyNotes: spec.proxyNotes });
            accumulateJobSummary(perConfigAccum[spec.id], diagW, propW);
            if (propW.rrmTopCandidateUserId !== propCurrent.rrmTopCandidateUserId) {
              perConfigAccum[spec.id]._changedTop += 1;
            }
          }
        }
      }

      const jobRow = {
        jobId: row.id,
        viewerUserId: row.viewerUserId,
        candidateCount: results.length,
        current: {
          spread: diagCurrent.diagnostics.scoreRange.spread,
          scoreRange: { ...diagCurrent.diagnostics.scoreRange },
          scoreDistributionFlag: diagCurrent.diagnostics.scoreDistributionFlag,
          recommendation: propCurrent.recommendation,
          rrmTopCandidateUserId: propCurrent.rrmTopCandidateUserId,
          topCandidateChanged: propCurrent.topCandidateChanged,
          itemScoresBeforeAfter: results.map((r) => {
            const rrm = r.rrmSimResult;
            const b =
              rrm && typeof rrm === "object" && typeof rrm.scores?.simulatedRhythmScore === "number"
                ? rrm.scores.simulatedRhythmScore
                : null;
            return {
              candidateUserId: r.candidateUserId,
              status: r.status,
              simulatedRhythmScoreBefore: b,
              simulatedRhythmScoreAfter: b,
            };
          }),
        },
        perConfig,
        itemScoresBeforeAfter: itemScoresRhythmMapProbe,
      };
      if (includeDebugProbe) jobRow.includeDebugProbe = includeDebugProbe;

      const dPreCalEnv = readDPreCalibrationEnvFromProcess();
      if (includeDebug && dPreCalEnv.enabled) {
        const shadowItems = [];
        for (const r of results) {
          if (r.status !== "succeeded" || !r.rrmSimResult || r.rrmSimResult.fallbackUsed !== false) continue;
          const tl = r.transcriptLite;
          if (!tl || typeof tl !== "object" || tl.schemaVersion !== 2 || tl.sourceVersion !== RRM_READY_V2) continue;
          const sh = buildDPreStaticLiftCapShadowResult({
            transcriptLite: tl,
            rrmSimResult: r.rrmSimResult,
            staticLiftCap: dPreCalEnv.staticLiftCap,
            calibrationVersion: dPreCalEnv.calibrationVersion,
            calibrationMode: dPreCalEnv.mode,
          });
          if (sh) shadowItems.push({ candidateUserId: r.candidateUserId, dPreCalibrationShadow: sh });
        }
        if (shadowItems.length) {
          jobRow.dPreCalibrationShadow = {
            env: {
              enabled: dPreCalEnv.enabled,
              mode: dPreCalEnv.mode,
              staticLiftCap: dPreCalEnv.staticLiftCap,
              calibrationVersion: dPreCalEnv.calibrationVersion,
            },
            items: shadowItems,
          };
        }
      }

      perJobDiff.push(jobRow);
    }

    const usableJobCount = perJobDiff.length;
    const summary = {
      jobCount: scanTotal,
      usableJobCount,
      perConfig: {},
    };

    for (const id of configIdsActive) {
      const raw = perConfigAccum[id];
      const changedTop = raw._changedTop ?? 0;
      const {
        _changedTop: _ctDel,
        _dPreBeforeVals: dpb,
        _dPreAfterVals: dpa,
        _staticLiftVals: dsl,
        ...rest
      } = raw;
      summary.perConfig[id] = finalizePerConfigSummary(rest, usableJobCount, changedTop);
      if (dpb?.length) {
        summary.perConfig[id].avgDPreBefore = mean(dpb);
        summary.perConfig[id].avgDPreAfter = mean(dpa);
        summary.perConfig[id].avgStaticLift = mean(dsl);
      }
    }

    const report = {
      schemaVersion: SCHEMA_VERSION,
      sourceVersion: SOURCE_VERSION,
      generatedAt: new Date().toISOString(),
      appliedToFinalScore: false,
      appliedToWorkerRanking: false,
      inputMode: "api_readonly_baseline",
      mode,
      includeDebug,
      calibrationConfigs: calibrationConfigMeta(includeDebug),
      summary,
      perJobDiff,
      skipped,
    };

    const text = JSON.stringify(report, null, pretty ? 2 : undefined);
    if (outPath) {
      fs.writeFileSync(path.resolve(MONOREPO_ROOT, outPath), text, "utf8");
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
