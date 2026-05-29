/**
 * P7.6-r7g3: read-only Route C Stage1 adapter — clean active onboarding pool items.
 */

import type { PrismaClient } from "@peima/database";
import { isUserImagePassingForOnboarding } from "../onboarding-photo-passing";
import {
  countNonNullP76ProfileDims,
  hasMeaningfulRouteCCore20D,
} from "./p76-route-c-stage1-profile";
import {
  extractP76UsableVisionFromImageRow,
  type P76UserImageVisionRow,
} from "./p76-photovisual-first-pool-db-adapter";
import {
  BLOCKING_REVIEW_FOR_VISION,
} from "./visual-ranking-shadow-vision-input";
import type {
  RouteCStage1AdapterCliInput,
  RouteCStage1AdapterReportV1,
  RouteCStage1CandidatePairV1,
  RouteCStage1IneligibleReason,
} from "./p76-route-c-stage1-adapter.types";
import {
  P76_ROUTE_C_SOURCE_POOL_TYPE,
  P76_ROUTE_C_STAGE1_ADAPTER_SCHEMA_VERSION,
} from "./p76-route-c-stage1-adapter.types";

export const P76_ROUTE_C_SYNTHETIC_POOL_PREFIXES = [
  "dev-p76-r7c5-",
  "dev-p76-r7c3-",
] as const;

const SENSITIVE_JSON_KEYS = new Set([
  "apiKey",
  "base64",
  "prompt",
  "imageUrl",
  "detectionScoreJson",
  "rawBody",
  "vendorRaw",
  "effectiveProfileChatOverlayV1",
  "dimensionBranchChatHints",
]);

export type RouteCCandidateEligibilityInput = {
  viewerUserId: string;
  candidateUserId: string;
  rankInPool: number;
  images: P76UserImageVisionRow[];
  hasPreference: boolean;
  nonNull20DCount: number;
  hasTwentyDProfile: boolean;
};

export function isSyntheticRouteCPoolId(poolId: string): boolean {
  return P76_ROUTE_C_SYNTHETIC_POOL_PREFIXES.some((p) => poolId.startsWith(p));
}

export function buildRouteCStage1IneligibleReasons(
  input: RouteCCandidateEligibilityInput,
): RouteCStage1IneligibleReason[] {
  const reasons: RouteCStage1IneligibleReason[] = [];

  if (
    input.candidateUserId === input.viewerUserId ||
    !input.candidateUserId.trim()
  ) {
    reasons.push("SELF");
  }

  const blockingReview = input.images.some((img) =>
    BLOCKING_REVIEW_FOR_VISION.has((img.reviewStatus || "").trim()),
  );
  if (blockingReview) {
    reasons.push("REVIEW_BLOCKED");
  }

  const detectionUsable = input.images.some((img) =>
    isUserImagePassingForOnboarding(img),
  );
  if (!detectionUsable) {
    reasons.push("DETECTION_UNAVAILABLE");
  }

  let hasVision = false;
  let photoVisualTagsCount = 0;
  for (const img of input.images) {
    const usable = extractP76UsableVisionFromImageRow(img);
    if (!usable) continue;
    hasVision = true;
    photoVisualTagsCount = Math.max(
      photoVisualTagsCount,
      usable.photoVisualTags.length,
    );
  }

  if (!hasVision) {
    reasons.push("VISION_NOT_OK");
  } else if (photoVisualTagsCount === 0) {
    reasons.push("EMPTY_PHOTO_VISUAL_TAGS");
  }

  if (!input.hasTwentyDProfile) {
    reasons.push("PROFILE_MISSING");
  }

  if (!input.hasPreference) {
    reasons.push("PREFERENCE_MISSING");
  }

  return reasons;
}

export function evaluateRouteCCandidatePair(
  input: RouteCCandidateEligibilityInput,
): RouteCStage1CandidatePairV1 {
  const ineligibleReasons = buildRouteCStage1IneligibleReasons(input);

  let hasVision = false;
  let photoVisualTagsCount = 0;
  for (const img of input.images) {
    const usable = extractP76UsableVisionFromImageRow(img);
    if (!usable) continue;
    hasVision = true;
    photoVisualTagsCount = Math.max(
      photoVisualTagsCount,
      usable.photoVisualTags.length,
    );
  }

  return {
    candidateUserId: input.candidateUserId,
    rankInPool: input.rankInPool,
    eligible: ineligibleReasons.length === 0,
    ineligibleReasons,
    hasVision,
    photoVisualTagsCount,
    hasTwentyDProfile: input.hasTwentyDProfile,
    nonNull20DCount: input.nonNull20DCount,
    hasPreference: input.hasPreference,
  };
}

export function countRouteCIneligibleReasonDistribution(
  pairs: RouteCStage1CandidatePairV1[],
): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const pair of pairs) {
    for (const reason of pair.ineligibleReasons) {
      dist[reason] = (dist[reason] ?? 0) + 1;
    }
  }
  return dist;
}

export function buildRouteCStage1AdapterReport(input: {
  cli: RouteCStage1AdapterCliInput;
  sourcePoolId: string | null;
  pairs: RouteCStage1CandidatePairV1[];
  generatedAt: string;
}): RouteCStage1AdapterReportV1 {
  const eligiblePairs = input.pairs.filter((p) => p.eligible);
  const selectedCandidateIds = eligiblePairs
    .map((p) => p.candidateUserId)
    .slice(0, input.cli.selectionLimit);

  return {
    schemaVersion: P76_ROUTE_C_STAGE1_ADAPTER_SCHEMA_VERSION,
    generatedAt: input.generatedAt,
    viewerUserId: input.cli.viewerUserId,
    sourcePoolType: P76_ROUTE_C_SOURCE_POOL_TYPE,
    sourcePoolId: input.sourcePoolId,
    poolSourceVersion: input.cli.poolSourceVersion,
    selectionLimit: input.cli.selectionLimit,
    dryRun: true,
    scannedCandidates: input.pairs.length,
    eligibleCandidates: eligiblePairs.length,
    selectedCandidateIds,
    ineligibleReasonDistribution: countRouteCIneligibleReasonDistribution(
      input.pairs,
    ),
    pairs: input.pairs,
    applied: false,
  };
}

export function assertRouteCStage1AdapterPrivacySafe(
  value: unknown,
  path = "root",
): void {
  if (value == null || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      assertRouteCStage1AdapterPrivacySafe(value[i], `${path}[${i}]`);
    }
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_JSON_KEYS.has(key)) {
      throw new Error(`sensitive field at ${path}.${key}`);
    }
    assertRouteCStage1AdapterPrivacySafe(child, `${path}.${key}`);
  }
}

export async function runRouteCStage1AdapterAuditFromDb(
  prisma: PrismaClient,
  cli: RouteCStage1AdapterCliInput,
): Promise<RouteCStage1AdapterReportV1> {
  const generatedAt = new Date().toISOString();

  const pool = await prisma.onboardingPhotoPreviewPool.findFirst({
    where: {
      userId: cli.viewerUserId,
      status: "active",
      sourceVersion: cli.poolSourceVersion,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (!pool || isSyntheticRouteCPoolId(pool.id)) {
    return buildRouteCStage1AdapterReport({
      cli,
      sourcePoolId: null,
      pairs: [],
      generatedAt,
    });
  }

  const items = await prisma.onboardingPhotoPreviewPoolItem.findMany({
    where: { poolId: pool.id },
    orderBy: { rankInPool: "asc" },
    select: {
      candidateUserId: true,
      rankInPool: true,
    },
  });

  const candidateIds = [
    ...new Set(
      items
        .map((i) => i.candidateUserId)
        .filter((id) => id && id !== cli.viewerUserId),
    ),
  ];

  const [imagesRaw, profiles, prefs] = await Promise.all([
    candidateIds.length === 0
      ? Promise.resolve([])
      : prisma.userImage.findMany({
          where: { userId: { in: candidateIds } },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            userId: true,
            createdAt: true,
            detectionScoreJson: true,
            detectionStatus: true,
            reviewStatus: true,
          },
        }),
    candidateIds.length === 0
      ? Promise.resolve([])
      : prisma.userProfile.findMany({
          where: { userId: { in: candidateIds } },
        }),
    candidateIds.length === 0
      ? Promise.resolve([])
      : prisma.userPreference.findMany({
          where: { userId: { in: candidateIds } },
          select: { userId: true },
        }),
  ]);

  const imagesByUserId = new Map<string, P76UserImageVisionRow[]>();
  for (const img of imagesRaw as P76UserImageVisionRow[]) {
    const list = imagesByUserId.get(img.userId) ?? [];
    list.push(img);
    imagesByUserId.set(img.userId, list);
  }

  const profileByUserId = new Map(
    profiles.map((p) => [p.userId, p] as const),
  );
  const prefUserIds = new Set(prefs.map((p) => p.userId));

  const pairs: RouteCStage1CandidatePairV1[] = items.map((item) => {
    const profileRow = profileByUserId.get(item.candidateUserId) as
      | Record<string, unknown>
      | undefined;
    const nonNull20DCount = countNonNullP76ProfileDims(profileRow);
    const hasTwentyDProfile = hasMeaningfulRouteCCore20D(profileRow);

    return evaluateRouteCCandidatePair({
      viewerUserId: cli.viewerUserId,
      candidateUserId: item.candidateUserId,
      rankInPool: item.rankInPool,
      images: imagesByUserId.get(item.candidateUserId) ?? [],
      hasPreference: prefUserIds.has(item.candidateUserId),
      nonNull20DCount,
      hasTwentyDProfile,
    });
  });

  return buildRouteCStage1AdapterReport({
    cli,
    sourcePoolId: pool.id,
    pairs,
    generatedAt,
  });
}
