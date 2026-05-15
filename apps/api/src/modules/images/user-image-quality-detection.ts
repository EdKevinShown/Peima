/**
 * P7.4-r1a: extreme photo quality checks (no face / no AI).
 * Pure evaluation + sharp-based metrics from buffer.
 */

export const USER_IMAGE_DETECTION_RULES_VERSION = "p7.4-r1a-v1" as const;

export type UserImageDetectionStatus =
  | "pending"
  | "passed"
  | "failed"
  | "skipped";

export type UserImageDetectionReasonCode =
  | "UNREADABLE_IMAGE"
  | "TOO_DARK"
  | "TOO_BLUR";

/** Conservative: only reject obviously unusable images (see detectionScoreJson for tuning). */
export const EXTREME_MIN_MEAN_LUMA = 22;
/** Near-zero Laplacian variance ≈ extreme blur or blank frame. */
export const EXTREME_MAX_LAPLACIAN_VARIANCE = 8;

export type UserImageQualityScores = {
  width: number;
  height: number;
  meanLuma: number;
  laplacianVariance: number;
  sampleWidth: number;
  sampleHeight: number;
};

export type UserImageQualityDetectionResult = {
  status: UserImageDetectionStatus;
  reasonCodes: UserImageDetectionReasonCode[];
  scores: UserImageQualityScores | null;
  rulesVersion: string;
};

export function evaluateExtremeQualityFromScores(
  scores: UserImageQualityScores,
): UserImageQualityDetectionResult {
  const reasonCodes: UserImageDetectionReasonCode[] = [];
  if (scores.meanLuma < EXTREME_MIN_MEAN_LUMA) {
    reasonCodes.push("TOO_DARK");
  }
  if (scores.laplacianVariance < EXTREME_MAX_LAPLACIAN_VARIANCE) {
    reasonCodes.push("TOO_BLUR");
  }
  if (reasonCodes.length > 0) {
    return {
      status: "failed",
      reasonCodes,
      scores,
      rulesVersion: USER_IMAGE_DETECTION_RULES_VERSION,
    };
  }
  return {
    status: "passed",
    reasonCodes: [],
    scores,
    rulesVersion: USER_IMAGE_DETECTION_RULES_VERSION,
  };
}

export function unreadableDetectionResult(): UserImageQualityDetectionResult {
  return {
    status: "failed",
    reasonCodes: ["UNREADABLE_IMAGE"],
    scores: null,
    rulesVersion: USER_IMAGE_DETECTION_RULES_VERSION,
  };
}

export function skippedDetectionResult(): UserImageQualityDetectionResult {
  return {
    status: "skipped",
    reasonCodes: [],
    scores: null,
    rulesVersion: USER_IMAGE_DETECTION_RULES_VERSION,
  };
}

/** 3x3 Laplacian variance on grayscale sample (higher = sharper). */
export function laplacianVariance(
  gray: Uint8Array,
  width: number,
  height: number,
): number {
  if (width < 3 || height < 3) return 0;
  const kernel = [0, 1, 0, 1, -4, 1, 0, 1, 0];
  const responses: number[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sum = 0;
      let ki = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const px = gray[(y + ky) * width + (x + kx)] ?? 0;
          sum += px * kernel[ki]!;
          ki++;
        }
      }
      responses.push(sum);
    }
  }
  if (responses.length === 0) return 0;
  const mean = responses.reduce((a, b) => a + b, 0) / responses.length;
  let varSum = 0;
  for (const r of responses) {
    const d = r - mean;
    varSum += d * d;
  }
  return varSum / responses.length;
}

export function meanLuminance(gray: Uint8Array): number {
  if (gray.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i]!;
  return sum / gray.length;
}
