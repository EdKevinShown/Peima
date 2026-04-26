import type {
  ShortlistScenariosV0,
  ShortlistFourDimCandidateV0,
  ShortlistFourDimV0,
} from "./ai-simulation-v1.types";
import {
  SHORTLIST_FOUR_DIM_RANKING_FORMULA_V0,
  SHORTLIST_FOUR_DIM_V0_SCHEMA,
  SHORTLIST_SCENE_KEYS_V0,
} from "./ai-simulation-v1.constants";

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return Math.round(n * 10_000) / 10_000;
}

/**
 * Phase C v1.0 freeze — reads only numeric `score` (+ per-row `status` gate) from `ShortlistScenariosV0.scenes`;
 * never reads `reason` / `riskPoint` / `evidenceSnippet` / `reviewStatus`.
 * 10 scenes → `continuation`: pace + repair + re_engagement only (unchanged).
 * `longTermStability`: lifestyle + values + pace + emotional_support + friends_family + **future_planning_tradeoff** (6-way mean).
 * `conflictRisk` does not consume `friends_family_integration_boundary` nor `future_planning_tradeoff`.
 * `rankingFormulaVersion` is `SHORTLIST_FOUR_DIM_RANKING_FORMULA_V0` (`shortlist_four_dim_formula_v6`).
 * Ranking tie-break: candidateUserId lex asc when aggregate ties.
 */
export function tryBuildShortlistFourDimV0(
  scenarios: ShortlistScenariosV0 | null,
): ShortlistFourDimV0 | null {
  if (!scenarios || scenarios.schemaVersion === undefined) return null;
  const shortlistFingerprint = scenarios.shortlistFingerprint;
  if (!shortlistFingerprint || !Array.isArray(scenarios.scenes) || scenarios.scenes.length === 0) return null;

  const byCandidate = new Map<string, Map<string, { score: number; status: string }>>();
  for (const row of scenarios.scenes) {
    if (!row || typeof row !== "object") return null;
    const candidateUserId = row.candidateUserId;
    const sceneKey = row.sceneKey;
    if (typeof candidateUserId !== "string" || typeof sceneKey !== "string") return null;
    if (!SHORTLIST_SCENE_KEYS_V0.includes(sceneKey as (typeof SHORTLIST_SCENE_KEYS_V0)[number])) return null;
    const score = clamp01(Number(row.score));
    const status = row.status;
    if (status !== "succeeded" && status !== "failed") return null;
    if (!byCandidate.has(candidateUserId)) byCandidate.set(candidateUserId, new Map());
    byCandidate.get(candidateUserId)!.set(sceneKey, { score, status });
  }

  const candidateDimensions: ShortlistFourDimCandidateV0[] = [];
  const rankedSource: { candidateUserId: string; aggregate: number }[] = [];
  for (const [candidateUserId, sceneMap] of byCandidate) {
    const opening = sceneMap.get("first_message_opening");
    const pace = sceneMap.get("pace_negotiation");
    const boundary = sceneMap.get("boundary_conflict_response");
    const repair = sceneMap.get("misunderstanding_repair");
    const lifestyle = sceneMap.get("long_term_lifestyle_alignment");
    const valuesCommitment = sceneMap.get("values_commitment_conflict");
    const reEngagementAfterLull = sceneMap.get("re_engagement_after_lull");
    const emotionalSupportUnderStress = sceneMap.get("emotional_support_under_stress");
    const friendsFamilyIntegrationBoundary = sceneMap.get("friends_family_integration_boundary");
    const futurePlanningTradeoff = sceneMap.get("future_planning_tradeoff");
    if (
      !opening ||
      !pace ||
      !boundary ||
      !repair ||
      !lifestyle ||
      !valuesCommitment ||
      !reEngagementAfterLull ||
      !emotionalSupportUnderStress ||
      !friendsFamilyIntegrationBoundary ||
      !futurePlanningTradeoff
    )
      return null;
    if (
      opening.status !== "succeeded" ||
      pace.status !== "succeeded" ||
      boundary.status !== "succeeded" ||
      repair.status !== "succeeded" ||
      lifestyle.status !== "succeeded" ||
      valuesCommitment.status !== "succeeded" ||
      reEngagementAfterLull.status !== "succeeded" ||
      emotionalSupportUnderStress.status !== "succeeded" ||
      friendsFamilyIntegrationBoundary.status !== "succeeded" ||
      futurePlanningTradeoff.status !== "succeeded"
    ) {
      return null;
    }
    const openingSmoothness = opening.score;
    const continuation = clamp01((pace.score + repair.score + reEngagementAfterLull.score) / 3);
    const conflictRisk = clamp01(1 - (boundary.score + repair.score + valuesCommitment.score) / 3);
    const longTermStability = clamp01(
      (lifestyle.score +
        valuesCommitment.score +
        pace.score +
        emotionalSupportUnderStress.score +
        friendsFamilyIntegrationBoundary.score +
        futurePlanningTradeoff.score) /
        6,
    );
    candidateDimensions.push({
      candidateUserId,
      openingSmoothness,
      continuation,
      conflictRisk,
      longTermStability,
    });
    const aggregate = clamp01((openingSmoothness + continuation + (1 - conflictRisk) + longTermStability) / 4);
    rankedSource.push({ candidateUserId, aggregate });
  }
  if (candidateDimensions.length < 2 || candidateDimensions.length > 3) return null;

  rankedSource.sort((a, b) => (b.aggregate !== a.aggregate ? b.aggregate - a.aggregate : a.candidateUserId.localeCompare(b.candidateUserId)));
  const rankedCandidateUserIds = rankedSource.map((r) => r.candidateUserId);
  if (new Set(rankedCandidateUserIds).size !== candidateDimensions.length) return null;

  return {
    schemaVersion: SHORTLIST_FOUR_DIM_V0_SCHEMA,
    shortlistFingerprint,
    rankingFormulaVersion: SHORTLIST_FOUR_DIM_RANKING_FORMULA_V0,
    candidateDimensions,
    comparison: {
      rankedCandidateUserIds,
    },
  };
}
