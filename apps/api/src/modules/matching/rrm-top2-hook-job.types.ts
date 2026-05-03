/**
 * M5.6-B1 — hook job row `status` + contract `sourceVersion` (no service/repository yet).
 * DB enum is string; keep literals aligned with `MatchResultRrmTop2DisplayHookJob.status` writes.
 */

export const RRM_TOP2_HOOK_JOB_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  PROCESSED: "processed",
  SKIPPED: "skipped",
  FAILED: "failed",
} as const;

export type RrmTop2HookJobStatus =
  (typeof RRM_TOP2_HOOK_JOB_STATUS)[keyof typeof RRM_TOP2_HOOK_JOB_STATUS];

/** Hook-job table `sourceVersion` / contract era for M5.6-B1 migration slice. */
export const RRM_TOP2_HOOK_JOB_CONTRACT_SOURCE_VERSION = "m5.6-b1-rrm-top2-hook-job-v1" as const;

/**
 * Row shape for `match_result_rrm_top2_display_hook_jobs` (M5.6-B1).
 * After `pnpm prisma generate`, aligns with `MatchResultRrmTop2DisplayHookJob` from `@peima/database`.
 */
export type RrmTop2HookJobRow = {
  id: string;
  matchResultId: string;
  viewerUserId: string;
  sourceVersion: string;
  status: string;
  staticTop2Snapshot: unknown;
  top2Fingerprint: string;
  rrmSourceType: string;
  rrmSourceId: string | null;
  rrmSummarySourceVersion: string | null;
  guardrails: unknown;
  noOpReasonCode: string | null;
  attempts: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lockedAt: Date | null;
  processedAt: Date | null;
  metaWriteResult: unknown;
  auditMeta: unknown;
  aiSimulationJobId: string | null;
  pairwiseJobId: string | null;
  poolId: string | null;
  batchId: string | null;
  createdAt: Date;
  updatedAt: Date;
};
