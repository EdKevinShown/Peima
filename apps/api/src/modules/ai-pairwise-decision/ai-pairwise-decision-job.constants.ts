/** Job row lifecycle (M3.8-M3). */
export const AI_PAIRWISE_DECISION_JOB_STATUS = {
  QUEUED: "queued",
  RUNNING: "running",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
} as const;

export type AiPairwiseDecisionJobStatus =
  (typeof AI_PAIRWISE_DECISION_JOB_STATUS)[keyof typeof AI_PAIRWISE_DECISION_JOB_STATUS];

/** Reuse lookup: same fingerprint + contract era; never reuse `failed` in MVP. */
export const AI_PAIRWISE_DECISION_JOB_REUSABLE_STATUSES: AiPairwiseDecisionJobStatus[] = [
  AI_PAIRWISE_DECISION_JOB_STATUS.QUEUED,
  AI_PAIRWISE_DECISION_JOB_STATUS.RUNNING,
  AI_PAIRWISE_DECISION_JOB_STATUS.SUCCEEDED,
];
