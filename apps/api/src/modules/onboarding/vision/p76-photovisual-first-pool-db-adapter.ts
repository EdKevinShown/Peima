/**
 * P7.6-r3b: read-only DB adapter → PhotoVisualPoolInputV1 (no writes).
 */

import type { PrismaClient } from "@peima/database";
import {
  passesPreferenceHardGate,
  type PreferenceGateCandidate,
  type PreferenceGatePref,
} from "@peima/shared/matching/preference-hard-gate";
import type { UserPreference } from "@peima/database";
import { isUserImagePassingForOnboarding } from "../onboarding-photo-passing";
import { isEligiblePreviewCandidate } from "../onboarding-preview-candidate-eligibility";
import {
  candidatePassesOppositeBinaryGate,
  isStrictBinaryPreviewGender,
  normalizeUserGenderForPreview,
} from "../onboarding-preview-gender";
import { readOnboardingPreviewPoolGateEnv } from "../onboarding-preview-pool-env";
import { ONBOARDING_VISION_SOURCE_CLOUD_ZHIPU } from "./cloud-vision.facade";
import type { OnboardingVisionProfileV1 } from "./onboarding-vision.types";
import { buildPhotoFirstMutualMatchingShadowV1 } from "./p76-photovisual-first-pool-shadow";
import type {
  PhotoFirstMutualMatchingShadowV1,
  PhotoVisualCandidateGatesV1,
  PhotoVisualCandidateInput,
  PhotoVisualPoolInputV1,
  PhotoVisualPoolSourceType,
  UsableVisionInput,
} from "./p76-photovisual-first-pool.types";
import {
  BLOCKING_REVIEW_FOR_VISION,
  type UserImageVisionSourceRow,
} from "./visual-ranking-shadow-vision-input";

export const P76_R3B_AUDIT_SCHEMA_VERSION =
  "p7.6-r3b-photovisual-pool-shadow-audit-v1" as const;

export const P76_PREFERRED_VISION_SOURCE_VERSION =
  ONBOARDING_VISION_SOURCE_CLOUD_ZHIPU;

const PREFERENCE_GATE_BATCH_SIZE = 50;

export type P76UserImageVisionRow = UserImageVisionSourceRow;

export type P76GatedCandidateDbRow = {
  candidateUserId: string;
  candidateStyleTags: string[];
  firstImageReviewStatus: string;
  firstImageDetectionStatus: string;
  gates: PhotoVisualCandidateGatesV1;
  preferenceFields: PreferenceGateCandidate;
};

export type P76LoadedPhotoVisualPoolAuditContext = {
  viewerUserId: string;
  viewerStyleTags: string[];
  viewerVision: UsableVisionInput | null;
  viewerGenderNorm: "male" | "female" | null;
  gatePref: PreferenceGatePref | null;
  candidates: P76GatedCandidateDbRow[];
  candidateImagesByUserId: Map<string, P76UserImageVisionRow[]>;
  viewerImages: P76UserImageVisionRow[];
};

export type PhotoVisualPoolShadowAuditReportV1 = {
  schemaVersion: typeof P76_R3B_AUDIT_SCHEMA_VERSION;
  generatedAt: string;
  viewerUserId: string;
  sourcePoolType: PhotoVisualPoolSourceType;
  limit: number;
  selectionLimit: number;
  dryRun: true;
  scannedCandidates: number;
  eligibleCandidates: number;
  selectedCandidates: number;
  ineligibleReasonDistribution: Record<string, number>;
  selectedCandidateIds: string[];
  shadow: PhotoFirstMutualMatchingShadowV1;
  applied: false;
};

export function normalizeP76StyleTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = String(raw ?? "").trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function isVisionProfileOk(
  vision: unknown,
): vision is OnboardingVisionProfileV1 {
  if (!vision || typeof vision !== "object") return false;
  const v = vision as OnboardingVisionProfileV1;
  return v.visionStatus === "ok" && Array.isArray(v.photoVisualTags);
}

function visionProfileToUsableInput(
  vision: OnboardingVisionProfileV1,
): UsableVisionInput | null {
  const photoVisualTags = normalizeP76StyleTags(vision.photoVisualTags);
  if (photoVisualTags.length === 0) {
    return null;
  }
  return {
    provider: vision.provider,
    sourceVersion: vision.sourceVersion,
    visionStatus: vision.visionStatus,
    photoVisualTags,
    qualityTags: Array.isArray(vision.qualityTags)
      ? normalizeP76StyleTags(vision.qualityTags)
      : undefined,
    sceneTags: Array.isArray(vision.sceneTags)
      ? normalizeP76StyleTags(vision.sceneTags)
      : undefined,
    confidence:
      typeof vision.confidence === "number" && Number.isFinite(vision.confidence)
        ? vision.confidence
        : undefined,
  };
}

export function extractP76UsableVisionFromImageRow(
  image: Pick<
    P76UserImageVisionRow,
    "detectionScoreJson" | "reviewStatus" | "detectionStatus"
  >,
): UsableVisionInput | null {
  if (BLOCKING_REVIEW_FOR_VISION.has((image.reviewStatus || "").trim())) {
    return null;
  }
  if (!isUserImagePassingForOnboarding(image)) {
    return null;
  }
  if (
    image.detectionScoreJson == null ||
    typeof image.detectionScoreJson !== "object" ||
    Array.isArray(image.detectionScoreJson)
  ) {
    return null;
  }
  const vision = (image.detectionScoreJson as Record<string, unknown>).vision;
  if (!isVisionProfileOk(vision)) {
    return null;
  }
  return visionProfileToUsableInput(vision);
}

function pickPreferredVisionFromImages(
  images: P76UserImageVisionRow[],
  order: "viewer_desc" | "candidate_asc",
): UsableVisionInput | null {
  const ordered = [...images].sort((a, b) => {
    const ta = a.createdAt.getTime();
    const tb = b.createdAt.getTime();
    return order === "viewer_desc" ? tb - ta : ta - tb;
  });

  let fallback: UsableVisionInput | null = null;
  for (const img of ordered) {
    const usable = extractP76UsableVisionFromImageRow(img);
    if (!usable) continue;
    if (usable.sourceVersion === P76_PREFERRED_VISION_SOURCE_VERSION) {
      return usable;
    }
    if (!fallback) {
      fallback = usable;
    }
  }
  return fallback;
}

export function pickP76ViewerUsableVision(
  images: P76UserImageVisionRow[],
): UsableVisionInput | null {
  const passing = images.filter((img) =>
    isUserImagePassingForOnboarding(img),
  );
  return pickPreferredVisionFromImages(passing, "viewer_desc");
}

export function pickP76CandidateUsableVision(
  images: P76UserImageVisionRow[],
): UsableVisionInput | null {
  return pickPreferredVisionFromImages(images, "candidate_asc");
}

export function buildP76CandidateGates(input: {
  viewerUserId: string;
  candidateUserId: string;
  genderGatePassed: boolean;
  preferenceGatePassed: boolean;
  firstImageReviewStatus: string;
  firstImageDetectionStatus: string;
  missingProfile: boolean;
}): PhotoVisualCandidateGatesV1 {
  const reviewUsable = !BLOCKING_REVIEW_FOR_VISION.has(
    (input.firstImageReviewStatus || "").trim(),
  );
  const detectionUsable = isUserImagePassingForOnboarding({
    detectionStatus: input.firstImageDetectionStatus,
    reviewStatus: input.firstImageReviewStatus,
  });

  return {
    isSelf: input.candidateUserId === input.viewerUserId,
    genderGatePassed: input.genderGatePassed,
    preferenceGatePassed: input.preferenceGatePassed,
    reviewUsable,
    detectionUsable,
    userBlocked: false,
    missingProfile: input.missingProfile,
  };
}

function toPreferenceGatePref(row: UserPreference | null): PreferenceGatePref | null {
  if (!row) return null;
  return {
    minAge: row.minAge,
    maxAge: row.maxAge,
    preferredCities: row.preferredCities ?? [],
    minHeight: row.minHeight,
    maxHeight: row.maxHeight,
    educationPreferences: row.educationPreferences ?? [],
    occupationPreferences: row.occupationPreferences ?? [],
    relationshipGoalPreferences: row.relationshipGoalPreferences ?? [],
  };
}

export function buildPhotoVisualPoolInputV1FromLoadedContext(
  loaded: P76LoadedPhotoVisualPoolAuditContext,
  options: {
    sourcePoolType: PhotoVisualPoolSourceType;
    poolId: string;
    generatedAt: string;
    selectionLimit: number;
  },
): PhotoVisualPoolInputV1 {
  const candidates: PhotoVisualCandidateInput[] = loaded.candidates.map(
    (row) => ({
      candidateUserId: row.candidateUserId,
      candidateStyleTags: normalizeP76StyleTags(row.candidateStyleTags),
      candidateVision:
        pickP76CandidateUsableVision(
          loaded.candidateImagesByUserId.get(row.candidateUserId) ?? [],
        ) ?? null,
      gates: row.gates,
    }),
  );

  return {
    viewerUserId: loaded.viewerUserId,
    viewerStyleTags: normalizeP76StyleTags(loaded.viewerStyleTags),
    viewerVision: loaded.viewerVision,
    candidates,
    sourcePoolType: options.sourcePoolType,
    poolId: options.poolId,
    generatedAt: options.generatedAt,
    selectionLimit: options.selectionLimit,
  };
}

export function countIneligibleReasonDistribution(
  shadow: PhotoFirstMutualMatchingShadowV1,
): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const pair of shadow.stage1PhotoVisualPool.pairs) {
    for (const reason of pair.ineligibleReasons) {
      dist[reason] = (dist[reason] ?? 0) + 1;
    }
  }
  return dist;
}

export function buildPhotoVisualPoolShadowAuditReport(input: {
  cli: {
    viewerUserId: string;
    sourcePoolType: PhotoVisualPoolSourceType;
    limit: number;
    selectionLimit: number;
    dryRun: true;
  };
  scannedCandidates: number;
  shadow: PhotoFirstMutualMatchingShadowV1;
  generatedAt: string;
}): PhotoVisualPoolShadowAuditReportV1 {
  const { shadow } = input;
  const selectedCandidateIds = shadow.stage1PhotoVisualPool.selectedCandidateIds;

  return {
    schemaVersion: P76_R3B_AUDIT_SCHEMA_VERSION,
    generatedAt: input.generatedAt,
    viewerUserId: input.cli.viewerUserId,
    sourcePoolType: input.cli.sourcePoolType,
    limit: input.cli.limit,
    selectionLimit: input.cli.selectionLimit,
    dryRun: true,
    scannedCandidates: input.scannedCandidates,
    eligibleCandidates: shadow.stage1PhotoVisualPool.eligibleCandidatesCount,
    selectedCandidates: selectedCandidateIds.length,
    ineligibleReasonDistribution: countIneligibleReasonDistribution(shadow),
    selectedCandidateIds,
    shadow,
    applied: false,
  };
}

const SENSITIVE_JSON_KEYS = new Set([
  "apiKey",
  "base64",
  "prompt",
  "imageUrl",
  "detectionScoreJson",
  "rawBody",
  "vendorRaw",
]);

export function assertP76AuditReportPrivacySafe(
  value: unknown,
  path = "root",
): void {
  if (value == null || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      assertP76AuditReportPrivacySafe(value[i], `${path}[${i}]`);
    }
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_JSON_KEYS.has(key)) {
      throw new Error(`sensitive field at ${path}.${key}`);
    }
    assertP76AuditReportPrivacySafe(child, `${path}.${key}`);
  }
}

export async function loadPhotoVisualPoolAuditContext(
  prisma: PrismaClient,
  options: {
    viewerUserId: string;
    limit: number;
  },
): Promise<P76LoadedPhotoVisualPoolAuditContext> {
  const viewerUserId = options.viewerUserId;

  const [viewerUser, prefRow] = await Promise.all([
    prisma.user.findUnique({
      where: { id: viewerUserId },
      select: { id: true, gender: true },
    }),
    prisma.userPreference.findUnique({
      where: { userId: viewerUserId },
    }),
  ]);

  const viewerGenderNorm = viewerUser
    ? normalizeUserGenderForPreview(viewerUser.gender)
    : null;
  const viewerBinary =
    viewerGenderNorm && isStrictBinaryPreviewGender(viewerGenderNorm)
      ? viewerGenderNorm
      : null;

  const gatePref = toPreferenceGatePref(prefRow);

  const viewerImages = (await prisma.userImage.findMany({
    where: { userId: viewerUserId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      userId: true,
      createdAt: true,
      detectionScoreJson: true,
      detectionStatus: true,
      reviewStatus: true,
    },
  })) as P76UserImageVisionRow[];

  const viewerVision = pickP76ViewerUsableVision(viewerImages);

  const gatedRows = await collectGatedCandidatesReadOnly(prisma, {
    viewerUserId,
    gatePref,
    viewerBinary,
    limit: options.limit,
  });

  const candidateIds = gatedRows.map((r) => r.candidateUserId);
  const candidateImagesRaw =
    candidateIds.length === 0
      ? []
      : await prisma.userImage.findMany({
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
        });

  const candidateImagesByUserId = new Map<string, P76UserImageVisionRow[]>();
  for (const img of candidateImagesRaw as P76UserImageVisionRow[]) {
    const list = candidateImagesByUserId.get(img.userId) ?? [];
    list.push(img);
    candidateImagesByUserId.set(img.userId, list);
  }

  return {
    viewerUserId,
    viewerStyleTags: prefRow?.styleTags ?? [],
    viewerVision,
    viewerGenderNorm: viewerBinary,
    gatePref,
    candidates: gatedRows,
    candidateImagesByUserId,
    viewerImages,
  };
}

async function collectGatedCandidatesReadOnly(
  prisma: PrismaClient,
  options: {
    viewerUserId: string;
    gatePref: PreferenceGatePref | null;
    viewerBinary: "male" | "female" | null;
    limit: number;
  },
): Promise<P76GatedCandidateDbRow[]> {
  const { viewerUserId, gatePref, viewerBinary, limit } = options;
  const { relaxProfileGate } = readOnboardingPreviewPoolGateEnv();

  const out: P76GatedCandidateDbRow[] = [];
  let skip = 0;

  while (out.length < limit) {
    const rows = await prisma.user.findMany({
      where: {
        id: { not: viewerUserId },
        images: { some: {} },
        ...(relaxProfileGate ? {} : { relationProfile: { isNot: null } }),
      },
      orderBy: { createdAt: "asc" },
      skip,
      take: PREFERENCE_GATE_BATCH_SIZE,
      select: {
        id: true,
        age: true,
        city: true,
        height: true,
        education: true,
        occupation: true,
        relationshipGoal: true,
        gender: true,
        relationProfile: relaxProfileGate
          ? { select: { id: true } }
          : false,
        images: {
          orderBy: { createdAt: "asc" },
          take: 1,
          select: {
            styleTags: true,
            reviewStatus: true,
            detectionStatus: true,
          },
        },
      },
    });

    if (rows.length === 0) break;

    for (const row of rows) {
      if (out.length >= limit) break;
      if (!isEligiblePreviewCandidate(row.id, viewerUserId)) {
        continue;
      }

      const prefCandidate: PreferenceGateCandidate = {
        age: row.age,
        city: row.city,
        height: row.height,
        education: row.education,
        occupation: row.occupation,
        relationshipGoal: row.relationshipGoal,
      };

      const preferenceGatePassed = passesPreferenceHardGate(
        gatePref,
        prefCandidate,
      );

      const genderGatePassed =
        viewerBinary != null
          ? candidatePassesOppositeBinaryGate(viewerBinary, row.gender)
          : false;

      const first = row.images[0];
      const gates = buildP76CandidateGates({
        viewerUserId,
        candidateUserId: row.id,
        genderGatePassed,
        preferenceGatePassed,
        firstImageReviewStatus: first?.reviewStatus ?? "",
        firstImageDetectionStatus: first?.detectionStatus ?? "",
        missingProfile: !relaxProfileGate && row.relationProfile == null,
      });

      if (!genderGatePassed || !preferenceGatePassed) {
        continue;
      }
      if (!gates.detectionUsable || !gates.reviewUsable) {
        continue;
      }

      out.push({
        candidateUserId: row.id,
        candidateStyleTags: first?.styleTags ?? [],
        firstImageReviewStatus: first?.reviewStatus ?? "",
        firstImageDetectionStatus: first?.detectionStatus ?? "",
        gates,
        preferenceFields: prefCandidate,
      });
    }

    skip += PREFERENCE_GATE_BATCH_SIZE;
    if (rows.length < PREFERENCE_GATE_BATCH_SIZE) break;
  }

  return out;
}

export async function runPhotoVisualPoolShadowAuditFromDb(
  prisma: PrismaClient,
  cli: {
    viewerUserId: string;
    sourcePoolType: PhotoVisualPoolSourceType;
    limit: number;
    selectionLimit: number;
    dryRun: true;
  },
): Promise<PhotoVisualPoolShadowAuditReportV1> {
  const generatedAt = new Date().toISOString();
  const loaded = await loadPhotoVisualPoolAuditContext(prisma, {
    viewerUserId: cli.viewerUserId,
    limit: cli.limit,
  });

  const poolInput = buildPhotoVisualPoolInputV1FromLoadedContext(loaded, {
    sourcePoolType: cli.sourcePoolType,
    poolId: `p76-r3b-audit-${cli.viewerUserId}`,
    generatedAt,
    selectionLimit: cli.selectionLimit,
  });

  const shadow = buildPhotoFirstMutualMatchingShadowV1(poolInput);

  return buildPhotoVisualPoolShadowAuditReport({
    cli,
    scannedCandidates: loaded.candidates.length,
    shadow,
    generatedAt,
  });
}
