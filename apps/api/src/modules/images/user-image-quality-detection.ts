/**
 * P7.4-r1a + P7.4-r1b: quality + face presence detection (pure functions).
 */

import { buildFaceDetectionScoreBlock } from "./user-image-primary-face";

export const USER_IMAGE_DETECTION_RULES_VERSION_R1A = "p7.4-r1a-v1" as const;
export const USER_IMAGE_DETECTION_RULES_VERSION_R1B = "p7.4-r1b-v1" as const;
export const USER_IMAGE_DETECTION_RULES_VERSION_R1C = "p7.4-r1c-v1" as const;

export type UserImageDetectionStatus =
  | "pending"
  | "passed"
  | "failed"
  | "skipped";

export type UserImageDetectionReasonCode =
  | "UNREADABLE_IMAGE"
  | "TOO_DARK"
  | "TOO_BLUR"
  | "FACE_NOT_FOUND";

export type UserImageQualityMetrics = {
  meanLuma: number;
  laplacianVariance: number;
  width: number;
  height: number;
  sampleWidth: number;
  sampleHeight: number;
};

export type UserImageFaceBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type UserImageFaceScoreFace = {
  score: number;
  box: UserImageFaceBox;
};

export type UserImageFaceScoreFaceEnriched = UserImageFaceScoreFace & {
  areaRatio: number;
  centerDistance: number;
  primaryScore: number;
};

export type UserImagePrimaryFace = UserImageFaceScoreFaceEnriched & {
  index: number;
};

export type UserImageDetectionScoreJson = {
  quality?: {
    meanLuma: number;
    laplacianVariance: number;
    width?: number;
    height?: number;
  };
  face?: {
    faceCount: number;
    faces: UserImageFaceScoreFaceEnriched[];
    primaryFace?: UserImagePrimaryFace;
  };
  warnings?: string[];
  pipeline: string[];
  faceDetectionEnabled?: boolean;
};

export type UserImageDetectionResult = {
  status: UserImageDetectionStatus;
  reasonCodes: UserImageDetectionReasonCode[];
  scoreJson: UserImageDetectionScoreJson | null;
  rulesVersion: string;
};

/** Conservative: only reject obviously unusable images. */
export const EXTREME_MIN_MEAN_LUMA = 22;
export const EXTREME_MAX_LAPLACIAN_VARIANCE = 8;

export function qualityMetricsToJson(
  metrics: UserImageQualityMetrics,
): UserImageDetectionScoreJson["quality"] {
  return {
    meanLuma: metrics.meanLuma,
    laplacianVariance: metrics.laplacianVariance,
    width: metrics.width,
    height: metrics.height,
  };
}

export function evaluateExtremeQualityFromMetrics(
  metrics: UserImageQualityMetrics,
): {
  reasonCodes: UserImageDetectionReasonCode[];
  failed: boolean;
} {
  const reasonCodes: UserImageDetectionReasonCode[] = [];
  if (metrics.meanLuma < EXTREME_MIN_MEAN_LUMA) {
    reasonCodes.push("TOO_DARK");
  }
  if (metrics.laplacianVariance < EXTREME_MAX_LAPLACIAN_VARIANCE) {
    reasonCodes.push("TOO_BLUR");
  }
  return { reasonCodes, failed: reasonCodes.length > 0 };
}

export function unreadableDetectionResult(): UserImageDetectionResult {
  return {
    status: "failed",
    reasonCodes: ["UNREADABLE_IMAGE"],
    scoreJson: null,
    rulesVersion: USER_IMAGE_DETECTION_RULES_VERSION_R1A,
  };
}

export function skippedDetectionResult(
  scoreJson: UserImageDetectionScoreJson | null,
): UserImageDetectionResult {
  return {
    status: "skipped",
    reasonCodes: [],
    scoreJson,
    rulesVersion: scoreJson?.faceDetectionEnabled === false
      ? USER_IMAGE_DETECTION_RULES_VERSION_R1A
      : USER_IMAGE_DETECTION_RULES_VERSION_R1B,
  };
}

export function qualityFailedResult(
  metrics: UserImageQualityMetrics,
  reasonCodes: UserImageDetectionReasonCode[],
): UserImageDetectionResult {
  return {
    status: "failed",
    reasonCodes,
    scoreJson: {
      quality: qualityMetricsToJson(metrics),
      pipeline: ["quality"],
      faceDetectionEnabled: false,
    },
    rulesVersion: USER_IMAGE_DETECTION_RULES_VERSION_R1A,
  };
}

export function mergeQualityAndFaceDetection(params: {
  metrics: UserImageQualityMetrics;
  faceCount: number;
  faces: UserImageFaceScoreFace[];
  faceDetectionEnabled: boolean;
}): UserImageDetectionResult {
  const { metrics, faceCount, faces, faceDetectionEnabled } = params;
  const quality = qualityMetricsToJson(metrics);
  const pipeline: string[] = ["quality"];
  const warnings: string[] = [];

  if (!faceDetectionEnabled) {
    return {
      status: "passed",
      reasonCodes: [],
      scoreJson: {
        quality,
        pipeline,
        faceDetectionEnabled: false,
      },
      rulesVersion: USER_IMAGE_DETECTION_RULES_VERSION_R1A,
    };
  }

  pipeline.push("face");

  if (faceCount === 0) {
    return {
      status: "failed",
      reasonCodes: ["FACE_NOT_FOUND"],
      scoreJson: {
        quality,
        face: { faceCount: 0, faces: [] },
        warnings,
        pipeline,
        faceDetectionEnabled: true,
      },
      rulesVersion: USER_IMAGE_DETECTION_RULES_VERSION_R1C,
    };
  }

  if (faceCount > 1) {
    warnings.push("MULTIPLE_FACES");
  }

  const faceBlock = buildFaceDetectionScoreBlock(
    faces,
    metrics.width,
    metrics.height,
  );

  return {
    status: "passed",
    reasonCodes: [],
    scoreJson: {
      quality,
      face: faceBlock,
      warnings,
      pipeline,
      faceDetectionEnabled: true,
    },
    rulesVersion: USER_IMAGE_DETECTION_RULES_VERSION_R1C,
  };
}

/** @deprecated use evaluateExtremeQualityFromMetrics — kept for unit tests */
export function evaluateExtremeQualityFromScores(
  scores: UserImageQualityMetrics,
): UserImageDetectionResult {
  const { reasonCodes, failed } = evaluateExtremeQualityFromMetrics(scores);
  if (failed) {
    return qualityFailedResult(scores, reasonCodes);
  }
  return mergeQualityAndFaceDetection({
    metrics: scores,
    faceCount: 0,
    faces: [],
    faceDetectionEnabled: false,
  });
}

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
