export {
  AI_PAIRWISE_DECISION_SCHEMA_VERSION,
  AI_PAIRWISE_DECISION_SOURCE_VERSION,
  PROGRESSION_WINDOW_VALUES,
  RELATIONSHIP_SHORTLIST_TOP2_SCHEMA_VERSION,
  RELATIONSHIP_SHORTLIST_TOP2_SOURCE_VERSION,
  SUGGESTED_ACTION_VALUES,
} from "./ai-pairwise-decision.schema";
export type { ProgressionWindowValue, SuggestedActionValue } from "./ai-pairwise-decision.schema";
export type {
  AiPairwiseDecision,
  AiPairwiseDecisionCandidateBlock,
  AiPairwiseDecisionDimensions,
  AiPairwiseDecisionSchemaFailureDetail,
  AxisScoresSummary,
  ParseValidateAiPairwiseDecisionResult,
  ParseValidateRelationshipShortlistTop2Result,
  RelationshipShortlistTop2,
  RelationshipShortlistTop2Candidate,
} from "./ai-pairwise-decision.types";
export { parseAndValidateAiPairwiseDecision, parseAndValidateRelationshipShortlistTop2 } from "./ai-pairwise-decision.validate";
export {
  buildRrmLitePairwiseDecisionPromptDraft,
  buildRrmLitePairwiseDecisionSystemPrompt,
  buildRrmLitePairwiseDecisionUserMessage,
  RRM_LITE_PAIRWISE_DECISION_JSON_SCHEMA_HINT,
} from "./ai-pairwise-decision.prompt";
export { AiPairwiseDecisionConfigService } from "./ai-pairwise-decision.config.service";
export {
  AiPairwiseDecisionLlmClient,
  type AiPairwiseDecisionChatResult,
  type AiPairwiseDecisionChatFailureKind,
} from "./ai-pairwise-decision-llm.client";
export { extractJsonObjectFromText, type ExtractJsonObjectFromTextResult } from "./ai-pairwise-decision-json-extract";
export {
  normalizeAiPairwiseDecisionDraftFromShortlist,
  type NormalizeAiPairwiseDecisionDraftFailure,
  type NormalizeAiPairwiseDecisionDraftFailureCode,
} from "./ai-pairwise-decision-normalize-draft";
export {
  AiPairwiseDecisionService,
  type GenerateAiPairwiseDecisionResult,
  type GenerateAiPairwiseDecisionFailureDetail,
} from "./ai-pairwise-decision.service";
export { AiPairwiseDecisionModule } from "./ai-pairwise-decision.module";
export { AiPairwiseDecisionAdminController } from "./ai-pairwise-decision-admin.controller";
export { AiPairwiseDecisionViewerController } from "./ai-pairwise-decision-viewer.controller";
export { mapPairwiseJobPublicToViewerDto } from "./ai-pairwise-decision-viewer.mapper";
export type {
  ViewerPairwiseJobResponseDto,
  ViewerPairwiseDecisionSliceDto,
  ViewerPairwiseFailureDto,
} from "./ai-pairwise-decision-viewer.mapper";
export {
  buildPairwiseFinalMatchProposal,
  mapPairwiseFinalMatchProposalToViewerDto,
  PAIRWISE_FINAL_MATCH_PROPOSAL_SCHEMA_VERSION,
  PAIRWISE_FINAL_MATCH_PROPOSAL_SOURCE_VERSION,
} from "./ai-pairwise-final-match-proposal";
export type {
  BuildPairwiseFinalMatchProposalInput,
  PairwiseFinalMatchJobStatusGate,
  PairwiseFinalMatchProposal,
  PairwiseFinalMatchRecommendation,
  PairwiseFinalMatchStrongRiskPolicy,
  ViewerPairwiseFinalMatchProposalDto,
} from "./ai-pairwise-final-match-proposal";
export {
  buildPairwiseFinalSourceShadowRecord,
  parseStoredFinalSourceShadowRecord,
  PAIRWISE_FINAL_SOURCE_SHADOW_SCHEMA_VERSION,
  PAIRWISE_FINAL_SOURCE_SHADOW_SOURCE_VERSION,
} from "./ai-pairwise-final-source-shadow";
export type {
  BuildPairwiseFinalSourceShadowRecordInput,
  PairwiseFinalSourceShadowJobStatus,
  PairwiseFinalSourceShadowRecord,
} from "./ai-pairwise-final-source-shadow";
export { ViewerPairwiseDecisionCreateJobDto } from "./dto/viewer-pairwise-decision-create-job.dto";
export {
  AiPairwiseDecisionJobService,
  type AiPairwiseDecisionJobRow,
  type CreateOrReusePairwiseDecisionJobResult,
  type PairwiseDecisionJobPublicDto,
  type RequestAdminRunPairwiseDecisionJobReason,
  type RequestAdminRunPairwiseDecisionJobResponse,
  type RunPairwiseDecisionJobOutcome,
  type RunPairwiseDecisionJobResult,
} from "./ai-pairwise-decision-job.service";
export {
  AI_PAIRWISE_DECISION_JOB_REUSABLE_STATUSES,
  AI_PAIRWISE_DECISION_JOB_STATUS,
  type AiPairwiseDecisionJobStatus,
} from "./ai-pairwise-decision-job.constants";
export { AdminAiPairwiseDecisionCreateJobDto } from "./dto/admin-ai-pairwise-decision-create-job.dto";
export {
  AiPairwiseTop2ShortlistService,
  RelationshipShortlistTop2Error,
  type RelationshipShortlistTop2ErrorCode,
} from "./ai-pairwise-top2-shortlist.service";
export {
  buildEligibleRowsForTop2,
  buildG1rAxisScoresSummary,
  buildReasonSummaryTop2,
  compareEligibleForTop2,
  computeRelationshipShortlistFingerprint,
  dedupePoolItemsByCandidate,
  deriveStrengthAndRiskTags,
  staticCompatibilityScoreFromG1r,
  toPreferenceGatePref,
  toPreferenceGateCandidate,
  type EligiblePoolRow,
} from "./ai-pairwise-top2-shortlist.builder";
