import type { PrescreenV0BatchOutputDto } from "../prescreen-v0/prescreen-v0.types";

export type PostPoolDeepScreenRunDto = {
  /** Viewer (pool owner); must match `PreviewPool.userId` for `poolId`. */
  viewerUserId: string;
  /**
   * Active preview pool row id (`PreviewPool.id`). Treated as the stable pool artifact handle
   * (product “poolRunId” equivalent until a dedicated run table exists).
   */
  poolId: string;
  /** If non-empty after trim/dedupe: use instead of pool item `candidateUserId`s (debug only). */
  candidateUserIdsOverride?: string[];
};

export type PostPoolOrchestrationRunMode = "shadow" | "hint_only" | "mvp";

/** Phase C v0: explicit skip when shortlist cannot drive AI simulation (no silent fallback to full pool). */
export type PostPoolOrchestrationMvpAiSimulationSkipReason =
  | "not_in_a2_mode"
  | "no_hint_for_enqueue"
  | "shortlist_contract_missing"
  | "shortlist_size_lt_2"
  | "shortlist_not_subset_of_pool"
  | "shortlist_dimension_ineligible"
  | "shortlist_prescreen_incomplete"
  | "shortlist_prescreen_demoted";

export type PostPoolOrchestrationMvpRunDto = {
  viewerUserId: string;
  poolId: string;
  candidateUserIdsOverride?: string[];
  runMode: PostPoolOrchestrationRunMode;
};

export type PostPoolOrchestrationStageStatus = "pending" | "skipped" | "done" | "failed";

export type PostPoolOrchestrationMvpEnvelopeDto = {
  schemaVersion: "post_pool_orchestration_mvp_v0";
  viewerUserId: string;
  poolId: string;
  runMode: PostPoolOrchestrationRunMode;
  stages: {
    previewPool: {
      status: PostPoolOrchestrationStageStatus;
      candidateCount: number;
    };
    deepScreen: {
      status: PostPoolOrchestrationStageStatus;
      passedCount: number;
      droppedCount: number;
    };
    prescreen: {
      status: PostPoolOrchestrationStageStatus;
      candidateCount: number;
      bucketCounts: {
        promote: number;
        neutral: number;
        demote: number;
      };
    };
    aiSimulation: {
      status: PostPoolOrchestrationStageStatus;
      reason?: PostPoolOrchestrationMvpAiSimulationSkipReason | "not_in_a1";
      simulationJobId?: string;
      acceptedCandidateCount?: number;
      runTriggered: boolean;
    };
  };
  simulationQueueHint: PostPoolSimulationQueueHintEntry[];
  simulationQueueActual: string[];
  deeplink: {
    finalMatchPath: "/final-match";
    finalMatchUrl: string;
    query: {
      userId: string;
      aiSimJobId: string | null;
    };
    ready: boolean;
  };
  finalMatchConsumptionHint: {
    ready: boolean;
    source: "orchestrator_a2";
    poolId: string;
    runMode: PostPoolOrchestrationRunMode;
    prescreen: {
      candidateCount: number;
      bucketCounts: {
        promote: number;
        neutral: number;
        demote: number;
      };
    };
    aiSimulation: {
      enqueued: boolean;
      simulationJobId?: string;
      acceptedCandidateCount?: number;
    };
    notes?: string[];
  };
  debug: {
    usedCandidateOverride: boolean;
    candidateUserIdsSource: "preview_pool_items" | "override";
    prescreenSkippedReason: "no_candidates_passed_dimension" | null;
    /** Phase C v0: when `runMode=mvp` and AI simulation skipped due to shortlist gate. */
    shortlistPhaseCV0SkipReason?: PostPoolOrchestrationMvpAiSimulationSkipReason | null;
  };
};

export type PostPoolDimensionRow = {
  candidateUserId: string;
  profileScore: number | null;
  dimensionHardFail: boolean;
  dimensionHardFailReason: "missing_profile" | "low_profile_score" | null;
};

export type PostPoolDimensionMatchSummary = {
  ruleVersion: string;
  profileScoreHardFailBelow: number;
  rows: PostPoolDimensionRow[];
  passedCandidateUserIds: string[];
};

export type PostPoolSimulationQueueHintEntry = {
  rankHint: number;
  candidateUserId: string;
  bucket: "promote" | "neutral" | "demote";
  prescreenScore: number;
};

export type PostPoolDeepScreenShadowResultDto = {
  schemaVersion: "post_pool_deep_screen_shadow_v0";
  shadow: true;
  viewerUserId: string;
  poolId: string;
  candidateUserIdsSource: "preview_pool_items" | "override";
  dimensionMatchSummary: PostPoolDimensionMatchSummary;
  /** Full Prescreen batch output when at least one candidate passed dimension gate; otherwise `null`. */
  prescreen: PrescreenV0BatchOutputDto | null;
  /** Shadow-only: suggested AI simulation order (excludes `demote`); not enqueued. */
  simulationQueueHint: PostPoolSimulationQueueHintEntry[];
  /** Placeholder until a real simulation queue exists; always empty in v0 shadow. */
  simulationQueueActual: string[];
  debug: {
    /** True when `candidateUserIdsOverride` was applied. */
    usedCandidateOverride: boolean;
    /** When prescreen was skipped (no dimension-passed ids). */
    prescreenSkippedReason: "no_candidates_passed_dimension" | null;
  };
};
