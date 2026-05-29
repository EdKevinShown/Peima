/**
 * P7.5-r7-c3: cloud/zhipu vision backfill + coverage audit (dev CLI).
 */

import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { extname, join } from "path";
import { resolveCloudVisionAdapter } from "./cloud-vision.adapter-registry";
import type { CloudVisionHttpFetch } from "./cloud-vision.http-client";
import {
  ONBOARDING_VISION_SOURCE_CLOUD_ZHIPU,
  runCloudVisionFacadeAsync,
} from "./cloud-vision.facade";
import type { OnboardingVisionEnv } from "./onboarding-vision-env";
import { readOnboardingVisionEnv } from "./onboarding-vision-env";
import { mergeVisionIntoDetectionScoreJson } from "./onboarding-vision-score-json.merge";
import type { OnboardingVisionProfileV1 } from "./onboarding-vision.types";
import type { CloudVisionImageRef } from "./cloud-vision.types";
import type {
  VisionBackfillImageRow,
  VisionBackfillRunOptions,
} from "./p75-r4-f-vision-backfill";
import {
  classifyUserImageForVisionBackfill,
  detectionScoreJsonIsPersistableObject,
} from "./p75-r4-f-vision-backfill";

export const P75_R7_C3_CLOUD_VISION_BACKFILL_SCHEMA_VERSION =
  "p7.5-r7-c3-cloud-vision-backfill-v1" as const;

export type CloudVisionBackfillProvider = "cloud" | "zhipu";

export type CloudVisionBackfillCliFilters = {
  userId?: string;
  imageIds: string[];
  userIds: string[];
};

export type CloudVisionBackfillRunInput = VisionBackfillRunOptions & {
  limit: number;
  dryRun: boolean;
  provider: CloudVisionBackfillProvider;
  filters: CloudVisionBackfillCliFilters;
};

export type CloudVisionBackfillSkipReason =
  | "no_detection_score_json"
  | "non_object_detection_score_json"
  | "existing_vision"
  | "blocked_review"
  | "cli_allowlist_miss"
  | "image_file_missing"
  | "image_url_not_local"
  | "cloud_vision_error";

export type CloudVisionBackfillHttpOutcome = "skipped" | "success" | "failed";

export type CloudVisionBackfillRowSuccess = {
  ok: true;
  merged: Record<string, unknown>;
  vision: OnboardingVisionProfileV1;
  httpOutcome: CloudVisionBackfillHttpOutcome;
};

export type CloudVisionBackfillRowFailure = {
  ok: false;
  reason: CloudVisionBackfillSkipReason;
  httpOutcome?: CloudVisionBackfillHttpOutcome;
};

export type CloudVisionBackfillRowResult =
  | CloudVisionBackfillRowSuccess
  | CloudVisionBackfillRowFailure;

export type CloudVisionBackfillAuditAccumulator = {
  scannedImages: number;
  eligibleImages: number;
  skippedImages: number;
  updatedImages: number;
  dryRun: boolean;
  provider: string;
  sourceVersionDistribution: Record<string, number>;
  visionStatusDistribution: Record<string, number>;
  fallbackReasonDistribution: Record<string, number>;
  photoVisualTagDistribution: Record<string, number>;
  qualityTagDistribution: Record<string, number>;
  sceneTagDistribution: Record<string, number>;
  unknownTagDroppedCount: number;
  cloudHttpAttemptedCount: number;
  cloudHttpSkippedCount: number;
  cloudHttpSuccessCount: number;
  cloudHttpFailedCount: number;
  skipReasonDistribution: Record<string, number>;
};

export type CloudVisionBackfillAuditReport = {
  schemaVersion: typeof P75_R7_C3_CLOUD_VISION_BACKFILL_SCHEMA_VERSION;
  generatedAt: string;
  input: {
    limit: number;
    provider: string;
    dryRun: boolean;
    onlyMissingVision: boolean;
    includeBlocked: boolean;
    userIdFilterPresent: boolean;
    imageIdAllowlistCount: number;
    userIdAllowlistCount: number;
  };
  scannedImages: number;
  eligibleImages: number;
  skippedImages: number;
  updatedImages: number;
  dryRun: boolean;
  provider: string;
  sourceVersionDistribution: Record<string, number>;
  visionStatusDistribution: Record<string, number>;
  fallbackReasonDistribution: Record<string, number>;
  photoVisualTagDistribution: Record<string, number>;
  qualityTagDistribution: Record<string, number>;
  sceneTagDistribution: Record<string, number>;
  unknownTagDroppedCount: number;
  cloudHttpAttemptedCount: number;
  cloudHttpSkippedCount: number;
  cloudHttpSuccessCount: number;
  cloudHttpFailedCount: number;
  skipReasonDistribution: Record<string, number>;
};

export type VisionBackfillImageRowWithUrl = VisionBackfillImageRow & {
  imageUrl: string;
};

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function incDistribution(map: Record<string, number>, key: string): void {
  const k = key.trim() || "(empty)";
  map[k] = (map[k] ?? 0) + 1;
}

export function visionEnvForCloudBackfill(
  provider: CloudVisionBackfillProvider,
  env: NodeJS.ProcessEnv = process.env,
): OnboardingVisionEnv {
  const base = readOnboardingVisionEnv(env);
  return {
    ...base,
    enabled: true,
    provider,
  };
}

export function matchesCloudBackfillCliFilters(
  row: Pick<VisionBackfillImageRow, "id" | "userId">,
  filters: CloudVisionBackfillCliFilters,
): boolean {
  if (filters.userId && row.userId !== filters.userId) {
    return false;
  }
  if (filters.imageIds.length > 0 && !filters.imageIds.includes(row.id)) {
    return false;
  }
  if (filters.userIds.length > 0 && !filters.userIds.includes(row.userId)) {
    return false;
  }
  return true;
}

export function storedFilenameFromUserImageUrl(imageUrl: string): string | null {
  const markers = ["/uploads/user-images/", "\\uploads\\user-images\\"];
  for (const marker of markers) {
    const idx = imageUrl.indexOf(marker);
    if (idx >= 0) {
      const tail = imageUrl.slice(idx + marker.length).split(/[?#]/)[0] ?? "";
      const name = tail.trim();
      return name.length > 0 ? name : null;
    }
  }
  return null;
}

export async function readCloudVisionImageRefFromUploadDir(
  imageUrl: string,
  uploadDir: string,
): Promise<CloudVisionImageRef | null> {
  const name = storedFilenameFromUserImageUrl(imageUrl);
  if (!name) {
    return null;
  }
  const filePath = join(uploadDir, name);
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const buffer = await readFile(filePath);
    if (!buffer.length) {
      return null;
    }
    const ext = extname(name).toLowerCase();
    const mimeType = MIME_BY_EXT[ext] ?? "application/octet-stream";
    return { kind: "bytes", mimeType, buffer };
  } catch {
    return null;
  }
}

export function classifyCloudBackfillRow(
  row: Pick<VisionBackfillImageRow, "id" | "userId" | "reviewStatus" | "detectionScoreJson">,
  options: VisionBackfillRunOptions,
  filters: CloudVisionBackfillCliFilters,
): { action: "skip"; reason: CloudVisionBackfillSkipReason } | { action: "eligible" } {
  if (!matchesCloudBackfillCliFilters(row, filters)) {
    return { action: "skip", reason: "cli_allowlist_miss" };
  }
  const base = classifyUserImageForVisionBackfill(row, options);
  if (base.action === "skip") {
    return { action: "skip", reason: base.reason };
  }
  return { action: "eligible" };
}

function httpOutcomeFromFacade(
  adapter: ReturnType<typeof resolveCloudVisionAdapter>["adapter"],
  vision: OnboardingVisionProfileV1,
): CloudVisionBackfillHttpOutcome {
  if (adapter !== "real-zhipu") {
    return "skipped";
  }
  if (
    !vision.fallbackUsed &&
    vision.sourceVersion === ONBOARDING_VISION_SOURCE_CLOUD_ZHIPU
  ) {
    return "success";
  }
  return "failed";
}

export async function buildMergedDetectionScoreJsonForCloudBackfill(
  row: VisionBackfillImageRowWithUrl,
  visionEnv: OnboardingVisionEnv,
  uploadDir: string,
  deps?: {
    httpFetch?: CloudVisionHttpFetch;
    readImageRef?: (
      imageUrl: string,
      dir: string,
    ) => Promise<CloudVisionImageRef | null>;
    runFacade?: typeof runCloudVisionFacadeAsync;
  },
): Promise<CloudVisionBackfillRowResult> {
  if (row.detectionScoreJson == null) {
    return { ok: false, reason: "no_detection_score_json" };
  }
  if (!detectionScoreJsonIsPersistableObject(row.detectionScoreJson)) {
    return { ok: false, reason: "non_object_detection_score_json" };
  }

  const readImageRef =
    deps?.readImageRef ?? readCloudVisionImageRefFromUploadDir;
  const imageRef = await readImageRef(row.imageUrl, uploadDir);
  if (!storedFilenameFromUserImageUrl(row.imageUrl)) {
    return { ok: false, reason: "image_url_not_local" };
  }
  if (!imageRef) {
    return { ok: false, reason: "image_file_missing" };
  }

  const resolution = resolveCloudVisionAdapter(visionEnv, {
    imageId: row.id,
    userId: row.userId,
    routedFrom: visionEnv.provider === "zhipu" ? "zhipu" : "cloud",
  });

  const runFacade = deps?.runFacade ?? runCloudVisionFacadeAsync;
  const routedFrom =
    visionEnv.provider === "zhipu" ? ("zhipu" as const) : ("cloud" as const);

  try {
    const vision = await runFacade(
      {
        detectionScoreJson: row.detectionScoreJson,
        imageRef,
        imageId: row.id,
        userId: row.userId,
      },
      visionEnv,
      { httpFetch: deps?.httpFetch, routedFrom },
    );

    const httpOutcome = httpOutcomeFromFacade(resolution.adapter, vision);
    return {
      ok: true,
      merged: mergeVisionIntoDetectionScoreJson(row.detectionScoreJson, vision),
      vision,
      httpOutcome,
    };
  } catch {
    const httpOutcome: CloudVisionBackfillHttpOutcome =
      resolution.adapter === "real-zhipu" ? "failed" : "skipped";
    return { ok: false, reason: "cloud_vision_error", httpOutcome };
  }
}

export function createEmptyCloudVisionBackfillAudit(
  input: Pick<CloudVisionBackfillRunInput, "dryRun" | "provider">,
): CloudVisionBackfillAuditAccumulator {
  return {
    scannedImages: 0,
    eligibleImages: 0,
    skippedImages: 0,
    updatedImages: 0,
    dryRun: input.dryRun,
    provider: input.provider,
    sourceVersionDistribution: {},
    visionStatusDistribution: {},
    fallbackReasonDistribution: {},
    photoVisualTagDistribution: {},
    qualityTagDistribution: {},
    sceneTagDistribution: {},
    unknownTagDroppedCount: 0,
    cloudHttpAttemptedCount: 0,
    cloudHttpSkippedCount: 0,
    cloudHttpSuccessCount: 0,
    cloudHttpFailedCount: 0,
    skipReasonDistribution: {},
  };
}

export function recordCloudVisionBackfillSkip(
  audit: CloudVisionBackfillAuditAccumulator,
  reason: CloudVisionBackfillSkipReason,
): void {
  audit.skippedImages += 1;
  incDistribution(audit.skipReasonDistribution, reason);
}

export function recordCloudVisionBackfillHttp(
  audit: CloudVisionBackfillAuditAccumulator,
  outcome: CloudVisionBackfillHttpOutcome,
): void {
  if (outcome === "skipped") {
    audit.cloudHttpSkippedCount += 1;
    return;
  }
  audit.cloudHttpAttemptedCount += 1;
  if (outcome === "success") {
    audit.cloudHttpSuccessCount += 1;
  } else {
    audit.cloudHttpFailedCount += 1;
  }
}

export function recordCloudVisionBackfillVisionAudit(
  audit: CloudVisionBackfillAuditAccumulator,
  vision: OnboardingVisionProfileV1,
  httpOutcome: CloudVisionBackfillHttpOutcome,
): void {
  incDistribution(audit.sourceVersionDistribution, vision.sourceVersion);
  incDistribution(audit.visionStatusDistribution, vision.visionStatus);
  if (vision.fallbackReason) {
    incDistribution(audit.fallbackReasonDistribution, vision.fallbackReason);
  }
  for (const tag of vision.photoVisualTags ?? []) {
    if (tag) incDistribution(audit.photoVisualTagDistribution, tag);
  }
  for (const tag of vision.qualityTags ?? []) {
    if (tag) incDistribution(audit.qualityTagDistribution, tag);
  }
  for (const tag of vision.sceneTags ?? []) {
    if (tag) incDistribution(audit.sceneTagDistribution, tag);
  }
  if ((vision.warnings ?? []).includes("VISION_CLOUD_UNKNOWN_TAG")) {
    audit.unknownTagDroppedCount += 1;
  }
  recordCloudVisionBackfillHttp(audit, httpOutcome);
}

export function buildCloudVisionBackfillAuditReport(
  args: CloudVisionBackfillRunInput,
  audit: CloudVisionBackfillAuditAccumulator,
  generatedAt: Date = new Date(),
): CloudVisionBackfillAuditReport {
  return {
    schemaVersion: P75_R7_C3_CLOUD_VISION_BACKFILL_SCHEMA_VERSION,
    generatedAt: generatedAt.toISOString(),
    input: {
      limit: args.limit,
      provider: args.provider,
      dryRun: args.dryRun,
      onlyMissingVision: args.onlyMissingVision,
      includeBlocked: args.includeBlocked,
      userIdFilterPresent: Boolean(args.filters.userId),
      imageIdAllowlistCount: args.filters.imageIds.length,
      userIdAllowlistCount: args.filters.userIds.length,
    },
    scannedImages: audit.scannedImages,
    eligibleImages: audit.eligibleImages,
    skippedImages: audit.skippedImages,
    updatedImages: audit.updatedImages,
    dryRun: audit.dryRun,
    provider: audit.provider,
    sourceVersionDistribution: audit.sourceVersionDistribution,
    visionStatusDistribution: audit.visionStatusDistribution,
    fallbackReasonDistribution: audit.fallbackReasonDistribution,
    photoVisualTagDistribution: audit.photoVisualTagDistribution,
    qualityTagDistribution: audit.qualityTagDistribution,
    sceneTagDistribution: audit.sceneTagDistribution,
    unknownTagDroppedCount: audit.unknownTagDroppedCount,
    cloudHttpAttemptedCount: audit.cloudHttpAttemptedCount,
    cloudHttpSkippedCount: audit.cloudHttpSkippedCount,
    cloudHttpSuccessCount: audit.cloudHttpSuccessCount,
    cloudHttpFailedCount: audit.cloudHttpFailedCount,
    skipReasonDistribution: audit.skipReasonDistribution,
  };
}

/** Privacy-safe cloud backfill report (no PII / secrets / raw JSON / base64). */
export function assertCloudVisionBackfillReportPrivacySafe(json: string): void {
  const forbidden = [
    "imageUrl",
    "reviewNote",
    "candidateUserId",
    "viewerUserId",
    "phone",
    "email",
    '"detectionScoreJson":',
    "test-api-key",
    "PEIMA_ONBOARDING_VISION_API_KEY",
    "vision.example",
    "prompt",
    "base64",
    "data:image",
    "authorization",
  ];
  for (const key of forbidden) {
    if (json.toLowerCase().includes(key.toLowerCase())) {
      throw new Error(`cloud vision backfill report leaked forbidden field: ${key}`);
    }
  }
}
