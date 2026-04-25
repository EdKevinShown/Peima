export const PRESCREEN_V0_SCHEMA = "prescreen_v0" as const;

export type PrescreenV0Purpose =
  | "shadow"
  | "preview_pool_hint"
  | "batch_order_hint";

export type PrescreenV0Bucket = "promote" | "neutral" | "demote";

/** Short enums for logs / triage; not user-facing prose. */
export type PrescreenV0ReasonCode =
  | "static_compat_high"
  | "static_compat_mid"
  | "static_compat_low"
  | "interaction_verdict_explore"
  | "interaction_verdict_cautious"
  | "interaction_verdict_pause"
  | "interaction_risk_cold_high"
  | "interaction_risk_mis_high"
  | "interaction_pickup_low"
  | "interaction_cont_low";

export type PrescreenV0StaticTier = "up" | "mid" | "down";

export type PrescreenV0VerdictTier = "up" | "mid" | "down";

export type PrescreenV0DropReason = "profile_not_found";

export type PrescreenV0BatchInputDto = {
  schemaVersion: string;
  viewerUserId: string;
  candidateUserIds: string[];
  purpose?: PrescreenV0Purpose;
};

export type PrescreenV0CandidateResultDto = {
  candidateUserId: string;
  bucket: PrescreenV0Bucket;
  prescreenScore: number;
  reasonCodes: PrescreenV0ReasonCode[];
  debug: {
    reviewStaticScore: number;
    staticTier: PrescreenV0StaticTier;
    verdict: "worth_exploring" | "cautious" | "pause";
    verdictTier: PrescreenV0VerdictTier;
    bandB: number;
  };
};

export type PrescreenV0DroppedCandidateDto = {
  candidateUserId: string;
  dropReason: PrescreenV0DropReason;
};

export type PrescreenV0BatchOutputDto = {
  schemaVersion: typeof PRESCREEN_V0_SCHEMA;
  viewerUserId: string;
  purpose: PrescreenV0Purpose;
  results: PrescreenV0CandidateResultDto[];
  debug: {
    ruleVersion: string;
    droppedCandidates: PrescreenV0DroppedCandidateDto[];
  };
};
