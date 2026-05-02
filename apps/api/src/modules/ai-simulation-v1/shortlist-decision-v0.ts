import { ITEM_STATUS, SHORTLIST_DECISION_V0_SCHEMA } from "./ai-simulation-v1.constants";
import type {
  EvaluatorV1,
  ShortlistContractBindingV0,
  ShortlistDecisionV0,
  ShortlistFourDimV0,
} from "./ai-simulation-v1.types";
import { computeShortlistFingerprint } from "./shortlist-contract-binding";

type ItemRow = {
  candidateUserId: string;
  status: string;
  evaluator: unknown;
};

function isBindingV0(x: unknown): x is ShortlistContractBindingV0 {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.previewPoolId === "string" &&
    typeof o.shortlistSchemaVersion === "string" &&
    Array.isArray(o.shortlistCandidateUserIds) &&
    o.shortlistCandidateUserIds.every((id) => typeof id === "string") &&
    typeof o.shortlistFingerprint === "string"
  );
}

function setsEqualAsMultisets(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x.localeCompare(y));
  const sb = [...b].sort((x, y) => x.localeCompare(y));
  return sa.every((v, i) => v === sb[i]);
}

function readEvaluatorScore(ev: unknown): number | null {
  if (typeof ev !== "object" || ev === null) return null;
  const srs = (ev as Record<string, unknown>).simulationRankScore;
  if (typeof srs !== "number" || !Number.isFinite(srs)) return null;
  return srs;
}

function readConfidenceTier(ev: unknown): EvaluatorV1["confidence"] | null {
  if (typeof ev !== "object" || ev === null) return null;
  const c = (ev as Record<string, unknown>).confidence;
  if (c === "high" || c === "medium" || c === "low") return c;
  return null;
}

/**
 * Phase C 第二步：从 binding + 全量 item 行聚合 shortlist 内决胜（仅侧车）。
 * 仅当 shortlist 全员 SUCCEEDED、evaluator 可排序、且与 binding fingerprint 一致时返回非 null。
 */
export function tryBuildShortlistDecisionV0(
  shortlistBinding: unknown,
  items: ItemRow[],
): ShortlistDecisionV0 | null {
  if (!isBindingV0(shortlistBinding)) return null;
  const binding = shortlistBinding;
  const expectedIds = binding.shortlistCandidateUserIds;
  if (expectedIds.length < 2 || expectedIds.length > 3) return null;

  if (computeShortlistFingerprint(expectedIds) !== binding.shortlistFingerprint) {
    return null;
  }

  const byId = new Map(items.map((it) => [it.candidateUserId, it]));
  const scored: { candidateUserId: string; score: number }[] = [];

  for (const id of expectedIds) {
    const it = byId.get(id);
    if (!it || it.status !== ITEM_STATUS.SUCCEEDED) return null;
    const score = readEvaluatorScore(it.evaluator);
    if (score === null) return null;
    scored.push({ candidateUserId: id, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.candidateUserId.localeCompare(b.candidateUserId);
  });

  const rankedCandidateUserIds = scored.map((s) => s.candidateUserId);
  if (new Set(rankedCandidateUserIds).size !== rankedCandidateUserIds.length) return null;
  if (!setsEqualAsMultisets(rankedCandidateUserIds, expectedIds)) return null;

  if (computeShortlistFingerprint(rankedCandidateUserIds) !== binding.shortlistFingerprint) {
    return null;
  }

  const chosenCandidateUserId = rankedCandidateUserIds[0];

  const winner = byId.get(chosenCandidateUserId);
  const confidenceTier = winner ? readConfidenceTier(winner.evaluator) : null;

  const out: ShortlistDecisionV0 = {
    schemaVersion: SHORTLIST_DECISION_V0_SCHEMA,
    chosenCandidateUserId,
    rankedCandidateUserIds,
    shortlistFingerprint: binding.shortlistFingerprint,
  };
  if (confidenceTier) {
    out.confidenceTier = confidenceTier;
  }
  return out;
}

/**
 * M0.7.1 — shortlist 决胜排序与 `shortlistFourDimV0.comparison` 对齐（用于 v2 模拟路径），
 * `confidenceTier` 仍取自该候选 item 的 legacy evaluator shim。
 */
export function tryBuildShortlistDecisionV0FromFourDim(
  shortlistBinding: unknown,
  fourDim: ShortlistFourDimV0 | null,
  items: ItemRow[],
): ShortlistDecisionV0 | null {
  if (!fourDim || !isBindingV0(shortlistBinding)) return null;
  const binding = shortlistBinding;
  const expectedIds = binding.shortlistCandidateUserIds;
  if (expectedIds.length < 2 || expectedIds.length > 3) return null;
  if (computeShortlistFingerprint(expectedIds) !== binding.shortlistFingerprint) return null;

  const ranked = fourDim.comparison.rankedCandidateUserIds;
  if (ranked.length !== expectedIds.length) return null;
  if (!setsEqualAsMultisets(ranked, expectedIds)) return null;
  if (computeShortlistFingerprint(ranked) !== binding.shortlistFingerprint) return null;

  const chosenCandidateUserId = ranked[0];
  const byId = new Map(items.map((it) => [it.candidateUserId, it]));
  for (const id of ranked) {
    const it = byId.get(id);
    if (!it || it.status !== ITEM_STATUS.SUCCEEDED) return null;
  }

  const winner = byId.get(chosenCandidateUserId);
  const confidenceTier = winner ? readConfidenceTier(winner.evaluator) : null;

  const out: ShortlistDecisionV0 = {
    schemaVersion: SHORTLIST_DECISION_V0_SCHEMA,
    chosenCandidateUserId,
    rankedCandidateUserIds: ranked,
    shortlistFingerprint: binding.shortlistFingerprint,
  };
  if (confidenceTier) {
    out.confidenceTier = confidenceTier;
  }
  return out;
}
