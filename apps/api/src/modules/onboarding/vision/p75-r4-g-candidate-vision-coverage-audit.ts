/**
 * P7.5-r4-g: pure helpers for onboarding pool candidate vision coverage audit (read-only).
 */

import { isUserImagePassingForOnboarding } from "../onboarding-photo-passing";
import {
  firstUsableVisionByUserId,
  pickViewerPassingPhotoVision,
  type UserImageVisionSourceRow,
} from "./visual-ranking-shadow-vision-input";
import type { OnboardingVisionProfileV1 } from "./onboarding-vision.types";

export const P75_R4_G_VISUAL_COVERAGE_SCHEMA_VERSION =
  "p7.5-r4-g-candidate-vision-coverage-audit-v1" as const;

/** Same gate as `extractUsableVisionFromDetectionScoreJson`. */
export const VISION_GATE_BLOCKED_REVIEW_STATUSES = [
  "rejected",
  "needs_reupload",
  "appealed",
  "appeal_rejected",
] as const;

export type VisionCoverageImageRow = {
  id?: string;
  userId?: string;
  createdAt: Date;
  detectionStatus: string;
  reviewStatus: string;
  detectionScoreJson: unknown;
};

export type CandidateVisionPrimaryGap =
  | "usable_ok"
  | "missing_user_image"
  | "missing_detection_score_json"
  | "vision_skipped_present"
  | "blocked_review_present"
  | "missing_usable_vision";

export type CandidateVisionBreakdownExclusive = {
  candidatesUsableVisionOk: number;
  candidatesMissingUserImage: number;
  candidatesMissingDetectionScoreJson: number;
  candidatesMissingVision: number;
  candidatesVisionSkipped: number;
  candidatesBlockedReview: number;
};

export type AccumulatePoolsInput = {
  pools: Array<{ userId: string; items: Array<{ candidateUserId: string }> }>;
  viewerImagesByUserId: Map<string, VisionCoverageImageRow[]>;
  candidateImagesByUserId: Map<string, VisionCoverageImageRow[]>;
};

export function detectionScoreJsonIsPersistableForAudit(
  json: unknown,
): boolean {
  return (
    json != null &&
    typeof json === "object" &&
    !Array.isArray(json)
  );
}

export function detectionScoreJsonHasVisionKey(
  json: unknown,
): boolean {
  if (!detectionScoreJsonIsPersistableForAudit(json)) return false;
  return (
    typeof (json as Record<string, unknown>).vision !== "undefined" &&
    (json as Record<string, unknown>).vision != null &&
    typeof (json as Record<string, unknown>).vision === "object" &&
    !Array.isArray((json as Record<string, unknown>).vision)
  );
}

function isVisionStatusSkipped(detectionScoreJson: unknown): boolean {
  if (!detectionScoreJsonIsPersistableForAudit(detectionScoreJson)) return false;
  const vision = (detectionScoreJson as Record<string, unknown>).vision;
  if (!vision || typeof vision !== "object" || Array.isArray(vision)) {
    return false;
  }
  return (vision as OnboardingVisionProfileV1).visionStatus === "skipped";
}

export function visionReviewBlockedForGate(reviewStatus: string): boolean {
  const r = String(reviewStatus ?? "").trim();
  return (
    VISION_GATE_BLOCKED_REVIEW_STATUSES as readonly string[]
  ).includes(r);
}

export function classifyCandidateVisionPrimaryGap(
  images: VisionCoverageImageRow[],
): CandidateVisionPrimaryGap {
  const rows = sortImagesAsc(images);
  const userRows: UserImageVisionSourceRow[] = rows.map((r, i) => ({
    id: r.id ?? `synthetic-${i}`,
    userId: r.userId ?? "user",
    createdAt: r.createdAt,
    detectionScoreJson: r.detectionScoreJson,
    detectionStatus: r.detectionStatus,
    reviewStatus: r.reviewStatus,
  }));

  if (firstUsableVisionByUserId(userRows).size > 0) {
    return "usable_ok";
  }

  if (rows.length === 0) {
    return "missing_user_image";
  }

  const hasPersistableDetection = rows.some((r) =>
    detectionScoreJsonIsPersistableForAudit(r.detectionScoreJson),
  );
  if (!hasPersistableDetection) {
    return "missing_detection_score_json";
  }

  const hasSkippedVision = rows.some((r) =>
    isVisionStatusSkipped(r.detectionScoreJson),
  );
  if (hasSkippedVision) {
    return "vision_skipped_present";
  }

  const hasBlockedGate = rows.some((r) =>
    visionReviewBlockedForGate(r.reviewStatus),
  );
  if (hasBlockedGate) {
    return "blocked_review_present";
  }

  return "missing_usable_vision";
}

function sortImagesAsc(images: VisionCoverageImageRow[]): VisionCoverageImageRow[] {
  return [...images].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

export function incrementExclusiveCandidateBreakdown(
  acc: CandidateVisionBreakdownExclusive,
  gap: CandidateVisionPrimaryGap,
): void {
  switch (gap) {
    case "usable_ok":
      acc.candidatesUsableVisionOk += 1;
      break;
    case "missing_user_image":
      acc.candidatesMissingUserImage += 1;
      break;
    case "missing_detection_score_json":
      acc.candidatesMissingDetectionScoreJson += 1;
      break;
    case "vision_skipped_present":
      acc.candidatesVisionSkipped += 1;
      break;
    case "blocked_review_present":
      acc.candidatesBlockedReview += 1;
      break;
    default:
      acc.candidatesMissingVision += 1;
  }
}

export type ViewerVisionAuditFlags = {
  hasUserImage: boolean;
  hasPassingPhoto: boolean;
  hasDetectionScoreJsonAny: boolean;
  hasVisionKeyAny: boolean;
  usableVisionViaPassingPhotos: boolean;
  hasVisionBlockingGateReviewAny: boolean;
};

export function analyzeViewerVisionFlags(
  images: VisionCoverageImageRow[],
): ViewerVisionAuditFlags {
  const rows = sortImagesAsc(images);
  const userRows: UserImageVisionSourceRow[] = rows.map((r, i) => ({
    id: r.id ?? `v-${i}`,
    userId: r.userId ?? "viewer",
    createdAt: r.createdAt,
    detectionScoreJson: r.detectionScoreJson,
    detectionStatus: r.detectionStatus,
    reviewStatus: r.reviewStatus,
  }));

  const hasUserImage = rows.length > 0;
  const hasPassingPhoto = rows.some((r) =>
    isUserImagePassingForOnboarding({
      detectionStatus: r.detectionStatus,
      reviewStatus: r.reviewStatus,
    }),
  );
  const hasDetectionScoreJsonAny = rows.some((r) =>
    detectionScoreJsonIsPersistableForAudit(r.detectionScoreJson),
  );
  const hasVisionKeyAny = rows.some((r) =>
    detectionScoreJsonHasVisionKey(r.detectionScoreJson),
  );
  const usablePick = pickViewerPassingPhotoVision(userRows);
  const usableVisionViaPassingPhotos = usablePick != null;
  const hasVisionBlockingGateReviewAny = rows.some((r) =>
    visionReviewBlockedForGate(r.reviewStatus),
  );

  return {
    hasUserImage,
    hasPassingPhoto,
    hasDetectionScoreJsonAny,
    hasVisionKeyAny,
    usableVisionViaPassingPhotos,
    hasVisionBlockingGateReviewAny,
  };
}

export type VisionCoverageRecommendation = {
  nextAction:
    | "backfill_candidate_images_missing"
    | "backfill_candidate_detection_scores"
    | "run_r4_f_vision_backfill"
    | "investigate_skipped_provider_signals"
    | "investigate_blocked_review_overlap"
    | "reconcile_pool_sample_then_r4_e_audit"
    | "no_major_gap_seen";
  reasons: string[];
};

/** Heuristic from exclusive candidate breakdown totals. */
export function suggestVisionCoverageNextAction(
  breakdown: CandidateVisionBreakdownExclusive,
  uniqueCandidates: number,
): VisionCoverageRecommendation {
  const reasons: string[] = [];
  const u = Math.max(uniqueCandidates, 1);
  const mImg = breakdown.candidatesMissingUserImage / u;
  const mDet = breakdown.candidatesMissingDetectionScoreJson / u;
  const mVis = breakdown.candidatesMissingVision / u;
  const skip = breakdown.candidatesVisionSkipped / u;
  const blk = breakdown.candidatesBlockedReview / u;

  if (
    breakdown.candidatesUsableVisionOk === uniqueCandidates &&
    uniqueCandidates > 0
  ) {
    reasons.push("all pooled candidates expose usable onboarding vision signals");
    return {
      nextAction: "reconcile_pool_sample_then_r4_e_audit",
      reasons,
    };
  }

  type GapChoice = Exclude<
    VisionCoverageRecommendation["nextAction"],
    "no_major_gap_seen" | "reconcile_pool_sample_then_r4_e_audit"
  >;

  const gapRank: Array<[keyof CandidateVisionBreakdownExclusive, GapChoice]> = [
    [
      "candidatesMissingUserImage",
      "backfill_candidate_images_missing",
    ],
    [
      "candidatesMissingDetectionScoreJson",
      "backfill_candidate_detection_scores",
    ],
    ["candidatesMissingVision", "run_r4_f_vision_backfill"],
    [
      "candidatesVisionSkipped",
      "investigate_skipped_provider_signals",
    ],
    ["candidatesBlockedReview", "investigate_blocked_review_overlap"],
  ];

  let best: { count: number; action: GapChoice; key: string } | null = null;

  for (const [bk, action] of gapRank) {
    const c = breakdown[bk];
    if (best === null || c > best.count) {
      best = { count: c, action, key: bk };
    }
  }

  if (best && best.count > 0) {
    reasons.push(
      `largest gap: ${best.key}=${best.count} (${((best.count / u) * 100).toFixed(1)}% of pooled candidates)`,
    );
    if (mImg > 0.3) reasons.push("high fraction missing user images");
    if (mDet > 0.3)
      reasons.push("high fraction missing detectionScoreJson payload");
    if (mVis > 0.3) reasons.push("high fraction missing usable vision merge");
    if (skip > 0.25) reasons.push("many onboarding-vision skipped profiles");
    if (blk > 0.25) reasons.push("vision gate blocked review overlap elevated");

    return { nextAction: best.action, reasons };
  }

  if (mImg > 0.3) reasons.push("high fraction missing user images");
  if (mDet > 0.3)
    reasons.push("high fraction missing detectionScoreJson payload");
  if (mVis > 0.3) reasons.push("high fraction missing usable vision merge");
  if (skip > 0.25) reasons.push("many onboarding-vision skipped profiles");
  if (blk > 0.25) reasons.push("vision gate blocked review overlap elevated");
  if (reasons.length === 0) {
    reasons.push("no candidates in pooled sample or ambiguous gap totals");
  }
  return {
    nextAction: "no_major_gap_seen",
    reasons,
  };
}

export function accumulateVisionCoverageFromPools(
  input: AccumulatePoolsInput,
): {
  poolsScanned: number;
  poolItemsScanned: number;
  uniqueViewerUsers: number;
  uniqueCandidateUsers: number;
  viewersWithPassingPhoto: number;
  viewersWithUsableVision: number;
  viewersWithVisionBlockingGate: number;
  summary: {
    viewerVisionAvailableRate: number;
    candidateUsableVisionRate: number;
    candidateDetectionCoverageRate: number;
    candidateImageCoverageRate: number;
  };
  breakdown: CandidateVisionBreakdownExclusive;
  perViewerFlags: ViewerVisionAuditFlags[];
} {
  let poolItemsScanned = 0;
  const viewerIdsSeen = new Set<string>();
  const candidateIdsSeen = new Set<string>();
  const breakdown: CandidateVisionBreakdownExclusive = {
    candidatesUsableVisionOk: 0,
    candidatesMissingUserImage: 0,
    candidatesMissingDetectionScoreJson: 0,
    candidatesMissingVision: 0,
    candidatesVisionSkipped: 0,
    candidatesBlockedReview: 0,
  };

  const perViewerFlags: ViewerVisionAuditFlags[] = [];

  for (const pool of input.pools) {
    if (!viewerIdsSeen.has(pool.userId)) {
      viewerIdsSeen.add(pool.userId);
      const imgs = input.viewerImagesByUserId.get(pool.userId) ?? [];
      perViewerFlags.push(analyzeViewerVisionFlags(imgs));
    }

    for (const it of pool.items) {
      poolItemsScanned += 1;
      candidateIdsSeen.add(it.candidateUserId);
    }
  }

  for (const cid of candidateIdsSeen) {
    const imgs = input.candidateImagesByUserId.get(cid) ?? [];
    const gap = classifyCandidateVisionPrimaryGap(imgs);
    incrementExclusiveCandidateBreakdown(breakdown, gap);
  }

  const uniqueCandidateUsers = candidateIdsSeen.size;
  const uniqueViewerUsers = viewerIdsSeen.size;

  const viewersWithPassingPhoto = perViewerFlags.filter((f) => f.hasPassingPhoto)
    .length;
  const viewersWithUsableVision = perViewerFlags.filter(
    (f) => f.usableVisionViaPassingPhotos,
  ).length;
  const viewersWithVisionBlockingGate = perViewerFlags.filter(
    (f) => f.hasVisionBlockingGateReviewAny,
  ).length;

  let candidatesWithDetection = 0;
  let candidatesWithImage = 0;
  for (const cid of candidateIdsSeen) {
    const imgs = input.candidateImagesByUserId.get(cid) ?? [];
    if (imgs.length > 0) candidatesWithImage += 1;
    if (imgs.some((r) => detectionScoreJsonIsPersistableForAudit(r.detectionScoreJson))) {
      candidatesWithDetection += 1;
    }
  }

  const vDenom = Math.max(uniqueViewerUsers, 1);
  const cDenom = Math.max(uniqueCandidateUsers, 1);

  return {
    poolsScanned: input.pools.length,
    poolItemsScanned,
    uniqueViewerUsers,
    uniqueCandidateUsers,
    viewersWithPassingPhoto,
    viewersWithUsableVision,
    viewersWithVisionBlockingGate,
    summary: {
      viewerVisionAvailableRate: viewersWithUsableVision / vDenom,
      candidateUsableVisionRate: breakdown.candidatesUsableVisionOk / cDenom,
      candidateDetectionCoverageRate: candidatesWithDetection / cDenom,
      candidateImageCoverageRate: candidatesWithImage / cDenom,
    },
    breakdown,
    perViewerFlags,
  };
}

const FORBIDDEN_SUBSTRINGS = [
  "imageUrl",
  "reviewNote",
  "phone",
  "email",
  '"detectionScoreJson":',
] as const;

export function assertR4GVisionCoverageReportPrivacySafe(json: string): void {
  for (const s of FORBIDDEN_SUBSTRINGS) {
    if (json.includes(s)) {
      throw new Error(`r4-g coverage audit report leaked forbidden field: ${s}`);
    }
  }
}
