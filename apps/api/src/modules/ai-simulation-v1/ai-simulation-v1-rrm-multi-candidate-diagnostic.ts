import type { RrmSimResult } from "./rrm-sim.types";
import { isFullRrmSimEvaluatorInput } from "./rrm-sim.evaluator";

export type RrmSimDiagnosticJobResultItem = {
  candidateUserId: string;
  status: string;
  attemptCount: number;
  transcriptLite: unknown;
  evaluator: unknown;
  failureDetail: unknown | null;
  errorCode: string | null;
  rrmSimResult?: RrmSimResult;
};

export type RrmSimDiagnosticItem = {
  candidateUserId: string;
  status: string;
  existingRank: number | null;
  simulationRankScore: number | null;
  aiSimulationV2Full: boolean;
  simulatedRhythmScore: number | null;
  suggestedAction: string | null;
  progressionWindow: string | null;
  fallbackUsed: boolean | null;
  rrmUnavailableReason: string | null;
};

export type RrmSimMultiCandidateDiagnostic = {
  jobId: string;
  viewerUserId: string;
  sourceVersion: string;
  items: RrmSimDiagnosticItem[];
  rankings: {
    existingSimulationRank: string[];
    rrmRhythmRank: string[];
  };
  diagnostics: {
    rrmAvailableCount: number;
    fallbackCount: number;
    scoreRange: { min: number; max: number; spread: number };
    scoreDistributionFlag: "ok" | "too_narrow" | "too_many_fallbacks";
    topCandidateChangedIfRrmOnly: boolean;
  };
};

function readSimulationRankScore(evaluator: unknown): number | null {
  if (evaluator == null || typeof evaluator !== "object" || Array.isArray(evaluator)) return null;
  const s = (evaluator as Record<string, unknown>).simulationRankScore;
  if (typeof s === "number" && Number.isFinite(s)) return s;
  return null;
}

function parseRankedCandidateIds(job: {
  shortlistDecisionV0?: unknown;
  shortlistFourDimV0?: unknown;
  shortlistBinding?: unknown;
}): string[] | null {
  const d = job.shortlistDecisionV0;
  if (d && typeof d === "object" && !Array.isArray(d)) {
    const r = (d as Record<string, unknown>).rankedCandidateUserIds;
    if (Array.isArray(r) && r.length > 0 && r.every((x) => typeof x === "string")) return r as string[];
  }
  const f = job.shortlistFourDimV0;
  if (f && typeof f === "object" && !Array.isArray(f)) {
    const cmp = (f as Record<string, unknown>).comparison;
    if (cmp && typeof cmp === "object" && !Array.isArray(cmp)) {
      const r = (cmp as Record<string, unknown>).rankedCandidateUserIds;
      if (Array.isArray(r) && r.length > 0 && r.every((x) => typeof x === "string")) return r as string[];
    }
  }
  const b = job.shortlistBinding;
  if (b && typeof b === "object" && !Array.isArray(b)) {
    const r = (b as Record<string, unknown>).shortlistCandidateUserIds;
    if (Array.isArray(r) && r.length > 0 && r.every((x) => typeof x === "string")) return r as string[];
  }
  return null;
}

function buildExistingSimulationRank(
  results: RrmSimDiagnosticJobResultItem[],
  rankedHint: string[] | null,
): string[] {
  const ids = new Set(results.map((r) => r.candidateUserId));
  const ordered: string[] = [];
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

function inferJobSourceVersion(results: RrmSimDiagnosticJobResultItem[]): string {
  for (const r of results) {
    const tl = r.transcriptLite;
    if (tl && typeof tl === "object" && !Array.isArray(tl)) {
      const sv = (tl as Record<string, unknown>).sourceVersion;
      if (typeof sv === "string" && sv.trim()) return sv;
    }
  }
  return "unknown";
}

function rhythmSortKey(rrm: RrmSimResult | undefined): { nonFallback: boolean; score: number } {
  if (!rrm || typeof rrm !== "object") {
    return { nonFallback: false, score: -1 };
  }
  const fb = rrm.fallbackUsed === true;
  const raw = rrm.scores?.simulatedRhythmScore;
  const score = typeof raw === "number" && Number.isFinite(raw) ? raw : -1;
  return { nonFallback: !fb, score };
}

/** 只读：不写入、不参与真实排序；供 admin / diagnostic 使用。 */
export function buildRrmSimMultiCandidateDiagnostic(params: {
  jobId: string;
  viewerUserId: string;
  shortlistDecisionV0?: unknown;
  shortlistFourDimV0?: unknown;
  shortlistBinding?: unknown;
  results: RrmSimDiagnosticJobResultItem[];
}): RrmSimMultiCandidateDiagnostic {
  const { jobId, viewerUserId, results } = params;
  const rankedHint = parseRankedCandidateIds(params);
  const existingSimulationRank = buildExistingSimulationRank(results, rankedHint);
  const rankIndex = new Map(existingSimulationRank.map((id, i) => [id, i + 1]));

  const items: RrmSimDiagnosticItem[] = results.map((r) => {
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
      aiSimulationV2Full: isFullRrmSimEvaluatorInput(r.transcriptLite),
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
  const ratioFallback = fallbackCount / total;

  const availableRhythms = items
    .filter((i) => i.fallbackUsed === false && typeof i.simulatedRhythmScore === "number")
    .map((i) => i.simulatedRhythmScore as number);
  let min = 0;
  let max = 0;
  let spread = 0;
  if (availableRhythms.length > 0) {
    min = Math.min(...availableRhythms);
    max = Math.max(...availableRhythms);
    spread = max - min;
  }

  let scoreDistributionFlag: RrmSimMultiCandidateDiagnostic["diagnostics"]["scoreDistributionFlag"] = "ok";
  if (ratioFallback >= 0.5) {
    scoreDistributionFlag = "too_many_fallbacks";
  } else if (rrmAvailableCount >= 3 && spread < 8) {
    scoreDistributionFlag = "too_narrow";
  }

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
