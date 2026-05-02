import type { RelationshipShortlistTop2 } from "./ai-pairwise-decision.types";

/**
 * RRM-lite pairwise **prompt draft** (M3.8-M0+): no key logging; compare **viewer + A** vs **viewer + B**.
 */

export const RRM_LITE_PAIRWISE_DECISION_JSON_SCHEMA_HINT = `
Return one JSON object only. No markdown. No code fences. No explanation before or after the JSON.
schemaVersion must be the JSON number 1 (not the strings "1" or "1.0"); the server may still coerce common string mistakes, but prefer numeric 1.
Do not invent or rely on sourceVersion for business meaning — the server overwrites it with the frozen contract value.
Do not omit top-level fields required by the AiPairwiseDecision contract (schemaVersion,
viewerUserId, poolId, candidateAUserId, candidateBUserId, winnerCandidateId, loserCandidateId, generatedAt,
appliedToFinalScore, appliedToWorkerRanking, plus scores, dimensions, candidateA/B blocks, decisionReason, fallbackUsed).
The server normalizes authoritative metadata (including sourceVersion) before validation.
Do not add extra keys beyond the contract. Do not output a conversation transcript or chat log.
winnerCandidateId and loserCandidateId must be exactly candidateAUserId and candidateBUserId (one winner, one loser).
decisionScoreA/B in [0,100]. decisionConfidence is required: a plain JSON number in [0,1] at the top level — do not omit it, do not wrap it in an object, do not output percentages or strings, and do not hide it only under decision.confidence (the server may hoist only from explicit numeric 0–1 fields such as confidence or decision.confidence when the top-level key is missing).
For dimensions.* and the same six keys on candidateA / candidateB — conversationFit, emotionalSafety, conflictRepair, progressionFit, longTermFit, riskControl — each must be a plain JSON number in [0,1] on the candidate object itself (not only under nested scores/dimensions/fit/metrics/ratings maps). Do not rely on the server copying root dimensions.* into candidate blocks; those are global comparison axes, not per-candidate substitutes. Do not wrap these scores in objects; do not output { score, reason } or { value, rationale } for dimension fields — put prose only in reasonSummary and decisionReason. The server may unwrap only plain { score } / { value } / { rating } with numeric 0–1 when hoisting from candidate.scores|dimensions|fit|metrics|ratings, but prefer flat numbers on candidateA/candidateB; do not use 0–100 scales for these fields.
per-candidate reasonSummary max ~60 Chinese characters or ~80 English words; decisionReason max ~120 Chinese characters.
candidateA.strongRisk and candidateB.strongRisk must each be JSON booleans true or false — not strings like "yes"/"low", not numbers; put risk nuance only in reasonSummary (the server may normalize only "true"/"false" strings or { value: boolean } wrappers).
Each of candidateA and candidateB must include suggestedAction as exactly one of: maintain, slow_down, stop_or_step_back (ASCII snake_case strings). Each must include progressionWindow as exactly one of: open, weak_open, closed. Put these on the candidate object itself — do not omit them and do not rely on action/recommendation/guidance wrappers; the server may hoist only strict literals from those nested objects, never from natural-language labels or Chinese prose in reasonSummary/decisionReason.
appliedToFinalScore and appliedToWorkerRanking must be false. If uncertain, still output valid JSON with lower decisionConfidence.
`.trim();

/** System message for pairwise LLM (instructions only; no shortlist PII beyond task framing). */
export function buildRrmLitePairwiseDecisionSystemPrompt(): string {
  return [
    "You are an RRM-lite relationship compatibility evaluator.",
    "",
    "Task: compare (viewer + candidate A) vs (viewer + candidate B). Use the real id fields from the user JSON.",
    "Do not describe A and B as talking to each other; there is no third-person relationship between A and B.",
    "",
    "Modules (compact scores only): conversationFit, emotionalSafety, conflictRepair, progressionFit, longTermFit, riskControl.",
    "You MUST pick exactly one winner (binary). If tied, pick rank-1 but lower decisionConfidence.",
    "",
    RRM_LITE_PAIRWISE_DECISION_JSON_SCHEMA_HINT,
    "",
    "中文：比较「viewer+A」与「viewer+B」；二选一；禁止完整对话 transcript；仅输出单行 JSON 对象；顶层业务字段不得省略；sourceVersion 等契约元数据由服务端统一校准。",
  ].join("\n");
}

/**
 * User message: **only** Top2 shortlist contract fields already safe for AI (axis summaries, scores, tags).
 * Does not embed raw `UserProfile` / phone / bio / questionnaire answers.
 */
export function buildRrmLitePairwiseDecisionUserMessage(shortlist: RelationshipShortlistTop2): string {
  const [a, b] = shortlist.candidates;
  const payload = {
    kind: "relationship_shortlist_top2_v1",
    viewerUserId: shortlist.viewerUserId,
    poolId: shortlist.poolId,
    shortlistFingerprint: shortlist.shortlistFingerprint ?? null,
    candidateA: {
      candidateUserId: a.candidateUserId,
      staticRank: a.staticRank,
      staticCompatibilityScore: a.staticCompatibilityScore,
      axisScoresSummary: a.axisScoresSummary,
      majorStrengths: a.majorStrengths,
      majorRisks: a.majorRisks,
      visualPoolRank: a.visualPoolRank ?? null,
      reasonSummary: a.reasonSummary,
    },
    candidateB: {
      candidateUserId: b.candidateUserId,
      staticRank: b.staticRank,
      staticCompatibilityScore: b.staticCompatibilityScore,
      axisScoresSummary: b.axisScoresSummary,
      majorStrengths: b.majorStrengths,
      majorRisks: b.majorRisks,
      visualPoolRank: b.visualPoolRank ?? null,
      reasonSummary: b.reasonSummary,
    },
    instruction:
      "Emit one AiPairwiseDecision JSON object only (no markdown). Copy viewerUserId, poolId, candidateAUserId, candidateBUserId from this message when echoing metadata; the server will set sourceVersion. winnerCandidateId/loserCandidateId must be those two ids.",
  };
  return JSON.stringify(payload);
}

/** @deprecated use buildRrmLitePairwiseDecisionSystemPrompt + buildRrmLitePairwiseDecisionUserMessage in services */
export function buildRrmLitePairwiseDecisionPromptDraft(): string {
  return buildRrmLitePairwiseDecisionSystemPrompt();
}
