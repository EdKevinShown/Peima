/**
 * P7.5-r4-f: pure helpers for dev-only UserImage vision sidecar backfill.
 */

import type { OnboardingVisionEnv } from "./onboarding-vision-env";
import { readOnboardingVisionEnv } from "./onboarding-vision-env";
import { buildOnboardingVisionProfileForPersist } from "./onboarding-vision-persist";
import {
  detectionScoreJsonBase,
  detectionScoreJsonHasVision,
  mergeVisionIntoDetectionScoreJson,
} from "./onboarding-vision-score-json.merge";
import type { OnboardingVisionProfileV1 } from "./onboarding-vision.types";

export type VisionBackfillRunOptions = {
  onlyMissingVision: boolean;
  includeBlocked: boolean;
};

export type VisionBackfillRunInput = VisionBackfillRunOptions & {
  limit: number;
  userId?: string;
  provider: "rules" | "stub";
  dryRun: boolean;
};

export const P75_R4_F_VISION_BACKFILL_SCHEMA_VERSION =
  "p7.5-r4-f-vision-backfill-v1" as const;

/** Default skip when includeBlocked=false (matches signoff + onboarding gate blockers). */
export const VISION_BACKFILL_BLOCKED_REVIEW_STATUSES = [
  "rejected",
  "needs_reupload",
  "appeal_rejected",
] as const;

export type VisionBackfillImageRow = {
  id: string;
  userId: string;
  detectionStatus: string;
  reviewStatus: string;
  detectionScoreJson: unknown;
  createdAt?: Date;
};

export type VisionBackfillSkipReason =
  | "no_detection_score_json"
  | "non_object_detection_score_json"
  | "existing_vision"
  | "blocked_review";

export type VisionBackfillClassifyResult =
  | { action: "skip"; reason: VisionBackfillSkipReason }
  | { action: "eligible" };

export type VisionBackfillSummary = {
  scanned: number;
  eligible: number;
  wouldUpdate: number;
  updated: number;
  skippedExistingVision: number;
  skippedBlockedReview: number;
  skippedNoDetectionJson: number;
  failed: number;
};

export type VisionBackfillTagCount = { tag: string; count: number };

export type VisionBackfillReport = {
  schemaVersion: typeof P75_R4_F_VISION_BACKFILL_SCHEMA_VERSION;
  generatedAt: string;
  input: {
    limit: number;
    userIdFilterPresent: boolean;
    provider: string;
    dryRun: boolean;
    onlyMissingVision: boolean;
    includeBlocked: boolean;
  };
  summary: VisionBackfillSummary;
  sampleTags: VisionBackfillTagCount[];
};

const DETECTION_STATUS_PRIORITY: Record<string, number> = {
  passed: 0,
  skipped: 1,
  failed: 2,
};

export function isVisionBackfillBlockedReview(
  reviewStatus: string,
  includeBlocked: boolean,
): boolean {
  if (includeBlocked) return false;
  const s = (reviewStatus || "not_required").trim() || "not_required";
  return (VISION_BACKFILL_BLOCKED_REVIEW_STATUSES as readonly string[]).includes(
    s,
  );
}

export function detectionScoreJsonIsPersistableObject(
  detectionScoreJson: unknown,
): boolean {
  return (
    detectionScoreJson != null &&
    typeof detectionScoreJson === "object" &&
    !Array.isArray(detectionScoreJson)
  );
}

export function classifyUserImageForVisionBackfill(
  row: Pick<
    VisionBackfillImageRow,
    "reviewStatus" | "detectionScoreJson"
  >,
  options: VisionBackfillRunOptions,
): VisionBackfillClassifyResult {
  if (row.detectionScoreJson == null) {
    return { action: "skip", reason: "no_detection_score_json" };
  }
  if (!detectionScoreJsonIsPersistableObject(row.detectionScoreJson)) {
    return { action: "skip", reason: "non_object_detection_score_json" };
  }
  if (
    isVisionBackfillBlockedReview(row.reviewStatus, options.includeBlocked)
  ) {
    return { action: "skip", reason: "blocked_review" };
  }
  if (
    options.onlyMissingVision &&
    detectionScoreJsonHasVision(row.detectionScoreJson)
  ) {
    return { action: "skip", reason: "existing_vision" };
  }
  return { action: "eligible" };
}

export function compareVisionBackfillDetectionPriority(
  a: Pick<VisionBackfillImageRow, "detectionStatus" | "createdAt"> & {
    createdAt?: Date;
  },
  b: Pick<VisionBackfillImageRow, "detectionStatus" | "createdAt"> & {
    createdAt?: Date;
  },
): number {
  const pa =
    DETECTION_STATUS_PRIORITY[a.detectionStatus] ?? 99;
  const pb =
    DETECTION_STATUS_PRIORITY[b.detectionStatus] ?? 99;
  if (pa !== pb) return pa - pb;
  const ta = a.createdAt?.getTime() ?? 0;
  const tb = b.createdAt?.getTime() ?? 0;
  return tb - ta;
}

export function visionEnvForBackfill(
  provider: VisionBackfillRunInput["provider"],
  env: NodeJS.ProcessEnv = process.env,
): OnboardingVisionEnv {
  const base = readOnboardingVisionEnv(env);
  return {
    ...base,
    enabled: true,
    provider,
  };
}

export function buildMergedDetectionScoreJsonForBackfill(
  detectionScoreJson: unknown,
  visionEnv: OnboardingVisionEnv,
): { merged: Record<string, unknown>; vision: OnboardingVisionProfileV1 } | null {
  const vision = buildOnboardingVisionProfileForPersist(
    detectionScoreJson,
    visionEnv,
  );
  if (!vision) {
    return null;
  }
  return {
    vision,
    merged: mergeVisionIntoDetectionScoreJson(detectionScoreJson, vision),
  };
}

export function createEmptyVisionBackfillSummary(): VisionBackfillSummary {
  return {
    scanned: 0,
    eligible: 0,
    wouldUpdate: 0,
    updated: 0,
    skippedExistingVision: 0,
    skippedBlockedReview: 0,
    skippedNoDetectionJson: 0,
    failed: 0,
  };
}

export function recordVisionBackfillSkip(
  summary: VisionBackfillSummary,
  reason: VisionBackfillSkipReason,
): void {
  switch (reason) {
    case "existing_vision":
      summary.skippedExistingVision += 1;
      break;
    case "blocked_review":
      summary.skippedBlockedReview += 1;
      break;
    case "no_detection_score_json":
    case "non_object_detection_score_json":
      summary.skippedNoDetectionJson += 1;
      break;
  }
}

export function recordVisionBackfillSampleTags(
  tagCounts: Map<string, number>,
  vision: OnboardingVisionProfileV1,
): void {
  for (const tag of vision.photoVisualTags ?? []) {
    if (!tag) continue;
    tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }
}

export function finalizeVisionBackfillSampleTags(
  tagCounts: Map<string, number>,
  topN = 12,
): VisionBackfillTagCount[] {
  return [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topN)
    .map(([tag, count]) => ({ tag, count }));
}

/** Privacy-safe report (no imageUrl, user ids, reviewNote, raw detectionScoreJson). */
export function buildVisionBackfillReport(
  args: VisionBackfillRunInput | (VisionBackfillRunOptions & {
    limit: number;
    userId?: string;
    provider: string;
    dryRun: boolean;
  }),
  summary: VisionBackfillSummary,
  sampleTags: VisionBackfillTagCount[],
  generatedAt: Date = new Date(),
): VisionBackfillReport {
  return {
    schemaVersion: P75_R4_F_VISION_BACKFILL_SCHEMA_VERSION,
    generatedAt: generatedAt.toISOString(),
    input: {
      limit: args.limit,
      userIdFilterPresent: Boolean(args.userId),
      provider: args.provider,
      dryRun: args.dryRun,
      onlyMissingVision: args.onlyMissingVision,
      includeBlocked: args.includeBlocked,
    },
    summary,
    sampleTags,
  };
}

/** Ensures serialized report never leaks forbidden fields (dev CLI guard). */
export function assertVisionBackfillReportPrivacySafe(json: string): void {
  const forbidden = [
    "imageUrl",
    "reviewNote",
    "candidateUserId",
    "viewerUserId",
    "phone",
    "email",
    '"detectionScoreJson":',
  ];
  for (const key of forbidden) {
    if (json.includes(key)) {
      throw new Error(`vision backfill report leaked forbidden field: ${key}`);
    }
  }
}

/** Preserve quality/face/warnings/pipeline after merge (test helper). */
export function visionBackfillPreservesDetectionSidecar(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): boolean {
  for (const k of ["quality", "face", "warnings", "pipeline"] as const) {
    if (k in before && JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      return false;
    }
  }
  return detectionScoreJsonHasVision(after);
}
