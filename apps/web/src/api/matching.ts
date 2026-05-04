import { authHeaders, baseUrl, handleJson } from "./auth";

export type MatchingStatus =
  | "not_queued"
  | "waiting"
  | "processing"
  | "ready";

export type MatchingStatusResponse = {
  status: MatchingStatus;
};

/** M6.0-E：worker 写入的 shadow（旧行可能无）。 */
export type MatchingMatchInsightsScoreShadowM60 = {
  finalScoreV1: number;
  relationshipProfileScore: number;
  scoringVersion: "m6.0-profile-score-shadow-v1";
};

/** P1-1 optional JSON on MatchResult; keys are API contract. */
export type MatchInsights = {
  explanation: {
    whyMatch: string;
    strengths: string[];
    cautions: string[];
    rhythmPrediction: string;
  };
  riskFlags: string[];
  openingTopics: string[];
  chatSimulationSummary: string;
  scoreShadow?: MatchingMatchInsightsScoreShadowM60;
};

/** M6.0-B：从 `reasonSummary` 解析的 v1 分项；不含 raw 文本。 */
export type MatchingScoreBreakdownSource = "reason_summary_v1" | "missing" | "parse_failed";

export type MatchingScoreBreakdown = {
  previewPoolScore: number | null;
  preferenceScore: number | null;
  styleScore: number | null;
  profileScore: number | null;
  source: MatchingScoreBreakdownSource;
};

/** M6.0-C / M6.0-r10：关系画像适配度 shadow；优先 V2 shadow，其次 reasonSummary 分解。 */
export type RelationshipProfileScoreShadowSource =
  | "match_insights_score_shadow"
  | "match_insights_score_shadow_v2"
  | "score_breakdown_profile_score"
  | "missing";

export type MatchingRelationshipProfileScoreShadow = {
  score: number | null;
  source: RelationshipProfileScoreShadowSource;
};

/** M6.0-J4：服务端从 `matchInsights.scoreShadowV2` 解析；viewer-safe。 */
export type MatchingRelationshipProfileScoreV2Band =
  | "strong_conflict"
  | "low"
  | "medium"
  | "good"
  | "high"
  | "missing";

export type MatchingRelationshipProfileScoreV2Source =
  | "match_insights_score_shadow_v2"
  | "missing"
  | "invalid";

export type MatchingRelationshipProfileScoreV2 = {
  scoringVersion: string;
  rawCompatibilityScore: number | null;
  weightedBaseScore: number | null;
  penaltyTotal: number | null;
  cappedRawScore: number | null;
  displayScore100: number | null;
  band: MatchingRelationshipProfileScoreV2Band;
  capApplied: number | null;
  coreConflictCount: number | null;
  strongConflictCount: number | null;
  redFlagConflictCount: number | null;
  validAxisCount: number | null;
  skippedAxisCount: number | null;
  source: MatchingRelationshipProfileScoreV2Source;
};

/** M3.8-M13: viewer-safe finalize 摘要（无 raw pairwise / dimensions / strongRisk）。 */
export type ViewerSafeFinalMatchDecisionMeta = {
  sourceType: string;
  mode: string;
  pairwiseProposalRecommendation: string;
  selectedCandidateUserId: string;
  staticTop1CandidateUserId: string;
  pairwiseWinnerCandidateUserId: string | null;
  wouldChangeStaticResult: boolean;
  fallbackReason: string | null;
  frozen: boolean;
  frozenAt: string | null;
  appliedToFinalScore: boolean;
  appliedToWorkerRanking: boolean;
};

/**
 * GET `/matching/result/:userId` 的 JSON 形状。
 * M4.3：最终匹配页仅重组展示与折叠策略；不改变本响应字段含义或服务端决策。
 */
export type MatchingResultResponse = {
  id: string;
  userId: string;
  candidateUserId: string;
  batchId: string;
  finalScore: number | null;
  reasonSummary: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  matchInsights?: MatchInsights | null;
  /** M6.0-B：服务端从 `reasonSummary` 解析；旧客户端未升级时可缺省。 */
  scoreBreakdown?: MatchingScoreBreakdown;
  /** M6.0-C：shadow；旧客户端未升级时可缺省。 */
  relationshipProfileScore?: MatchingRelationshipProfileScoreShadow;
  /** M6.0-J4：V2 shadow；旧客户端未升级时可缺省。 */
  relationshipProfileScoreV2?: MatchingRelationshipProfileScoreV2;
  /** M3.8-M13：与 `candidateUserId` 可能不同；Final 页应优先用于展示与对端资料。 */
  displayCandidateUserId?: string;
  displaySourceType?:
    | "match_result_original"
    | "static_final"
    | "pairwise_final"
    | "static_fallback"
    /** M5.3-C1: reserved for M5.3-C2; GET still returns M3.8 values until resolver branch lands. */
    | "rrm_top2_bounded_selector"
    /** M6.0-r6: readonly display from `matchInsights` (server-resolved only; no client-side RRM). */
    | "rrm_top2_v2_selector_readonly";
  /**
   * Optional future / side-channel flag; current `GET /matching/result` may omit.
   * When true, UI may show baseline-path copy (R8); do not infer from matchInsights on the client.
   */
  fallbackUsed?: boolean;
  finalMatchDecisionMeta?: ViewerSafeFinalMatchDecisionMeta | null;
  /**
   * M5.1 / M5.2-M0: multi-source sidecar + optional shadow **contract** (`PEIMA_M5_FINAL_DECISION_SHADOW_ENABLED`).
   * Does not participate in display resolution — never overrides `displayCandidateUserId`.
   */
  multiSourceFinalDecision?: {
    schemaVersion: 1;
    sourceVersion: "m5.2-m3-multi-source-final-decision-shadow-proposal-v1";
    mode: "readonly" | "shadow";
    baseline: {
      matchResultCandidateUserId: string;
      finalScore: number | null;
      sourceType: "match_result_baseline";
    };
    currentDisplayCandidateUserId: string;
    currentDisplaySourceType:
      | "match_result_original"
      | "static_final"
      | "pairwise_final"
      | "static_fallback"
      | "rrm_top2_bounded_selector"
      | "rrm_top2_v2_selector_readonly";
    m5ProposedDisplayCandidateUserId: string | null;
    m5AppliedToDisplay: false;
    wouldChangeCurrentDisplay: boolean;
    decisionRule:
      | "current_display_preserved_readonly"
      | "shadow_no_change_due_to_insufficient_m5_sources"
      | "shadow_pairwise_unavailable_current_display_preserved"
      | "shadow_rrm_sim_unavailable_current_display_preserved"
      | "shadow_guardrail_block_current_display_preserved"
      | "shadow_guardrail_not_evaluated_current_display_preserved"
      | "shadow_pairwise_rrm_conflict_current_display_preserved"
      | "shadow_pairwise_rrm_consensus";
    sources: {
      static: { available: true; candidateUserId: string; summary: string };
      pairwise:
        | { available: false; summary: string }
        | {
            available: true;
            selectedCandidateUserId: string;
            pairwiseWinnerCandidateUserId: string | null;
            staticTop1CandidateUserId: string;
            sourceType: string;
            mode: string;
            pairwiseProposalRecommendation: string;
            fallbackReason: string | null;
            wouldChangeStaticResult: boolean;
            appliedToFinalScore: boolean;
            appliedToWorkerRanking: boolean;
            frozen: boolean;
            frozenAt: string | null;
          };
      rrmSim:
        | {
            available: false;
            summary: string;
            unavailableReason:
              | "no_viewer_safe_rrm_sim_summary_in_match_result_payload"
              | "rrm_sim_exists_only_in_observability_or_batch_context"
              | "rrm_sim_requires_shadow_or_m5_2_wiring";
          }
        | {
            available: true;
            summary: string;
            candidateUserId: string | null;
            sourceType: string;
            sourceVersion: string;
            fallbackUsed: boolean;
            unavailableReason: string | null;
            recommendation: string | null;
            suggestedAction: string | null;
            progressionWindow: string | null;
            simulatedRhythmScore: number | null;
            cautionFlags: string[];
            confidenceBucket: "low" | "medium" | "high" | "unknown";
            scenarioKey: string | null;
            generatedAt: string | null;
            frozenAt: string | null;
          };
      guardrails: {
        status: "pass" | "not_evaluated" | "caution" | "block";
        blockReasons: string[];
        cautionReasons: string[];
        sourceSummary: string;
      };
    };
    shadow: {
      shadowModeRequested: boolean;
      shadowContractEvaluated: boolean;
      shadowDisplayProposalComputed: boolean;
      proposedDisplayCandidateUserId: string | null;
      wouldChangeCurrentDisplay: boolean;
      appliedToDisplay: false;
      noProposalReason: string | null;
      sourcesBlockingShadowProposal: string[];
      reason: string | null;
      availableSources: string[];
      missingSources: string[];
      decisionRule: string | null;
      shadowCautionReasonsEcho: string[];
      nextMilestonesNote: string;
    };
    admin: {
      decisionTrace: Array<{
        step:
          | "source_hydration_readonly"
          | "rrm_sim_source_discovery_readonly"
          | "shadow_contract_readonly";
        detail: string;
      }>;
      missingSources: string[];
      notes: string[];
    };
  };
};

export async function enqueueMatching(userId: string) {
  const res = await fetch(`${baseUrl}/matching/enqueue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ userId }),
  });
  return handleJson<unknown>(res);
}

export async function getMatchingStatus(userId: string) {
  const url = `${baseUrl}/matching/status/${encodeURIComponent(userId)}`;
  const res = await fetch(url, { headers: authHeaders() });
  return handleJson<MatchingStatusResponse>(res);
}

export async function getMatchingResult(userId: string) {
  const url = `${baseUrl}/matching/result/${encodeURIComponent(userId)}`;
  const res = await fetch(url, { headers: authHeaders() });
  return handleJson<MatchingResultResponse>(res);
}

/** M3.8-M11/M12A: finalize sidecar — server never mutates `MatchResult.candidateUserId` / `finalScore`. */
export type FinalizeWithPairwiseApiStatus = "pending" | "finalized" | "already_frozen" | "disabled";

export type FinalizeWithPairwiseResponse = {
  ok: true;
  status: FinalizeWithPairwiseApiStatus;
  /** Opaque server meta; do not log or render raw fields to users. */
  finalMatchDecisionMeta: Record<string, unknown> | null;
};

export async function finalizeWithPairwise(params: { poolId: string; pairwiseJobId: string }) {
  const poolId = params.poolId.trim();
  const pairwiseJobId = params.pairwiseJobId.trim();
  if (!poolId || !pairwiseJobId) {
    throw new Error("缺少 poolId 或 pairwiseJobId。");
  }
  const res = await fetch(`${baseUrl}/matching/finalize-with-pairwise`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ poolId, pairwiseJobId }),
  });
  return handleJson<FinalizeWithPairwiseResponse>(res);
}
