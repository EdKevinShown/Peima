/**
 * P7.5-r1: parse detectionScoreJson for rules provider (no DB).
 */

export type ParsedDetectionForVision = {
  meanLuma: number | null;
  laplacianVariance: number | null;
  width: number | null;
  height: number | null;
  faceCount: number | null;
  primaryFaceAreaRatio: number | null;
  primaryFaceCenterDistance: number | null;
  warnings: string[];
  faceDetectionEnabled: boolean | null;
  hasUsableSignals: boolean;
};

function num(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

function readWarnings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((w) => String(w ?? "").trim())
    .filter(Boolean);
}

export function parseDetectionScoreJsonForVision(
  detectionScoreJson: unknown,
): ParsedDetectionForVision {
  const empty: ParsedDetectionForVision = {
    meanLuma: null,
    laplacianVariance: null,
    width: null,
    height: null,
    faceCount: null,
    primaryFaceAreaRatio: null,
    primaryFaceCenterDistance: null,
    warnings: [],
    faceDetectionEnabled: null,
    hasUsableSignals: false,
  };

  if (detectionScoreJson == null || typeof detectionScoreJson !== "object") {
    return empty;
  }

  const root = detectionScoreJson as Record<string, unknown>;
  const quality =
    root.quality != null && typeof root.quality === "object"
      ? (root.quality as Record<string, unknown>)
      : null;
  const face =
    root.face != null && typeof root.face === "object"
      ? (root.face as Record<string, unknown>)
      : null;
  const primaryFace =
    face?.primaryFace != null && typeof face.primaryFace === "object"
      ? (face.primaryFace as Record<string, unknown>)
      : null;

  const meanLuma = quality ? num(quality.meanLuma) : null;
  const laplacianVariance = quality ? num(quality.laplacianVariance) : null;
  const width = quality ? num(quality.width) : null;
  const height = quality ? num(quality.height) : null;
  const faceCount = face ? num(face.faceCount) : null;
  const primaryFaceAreaRatio = primaryFace ? num(primaryFace.areaRatio) : null;
  const primaryFaceCenterDistance = primaryFace
    ? num(primaryFace.centerDistance)
    : null;
  const warnings = readWarnings(root.warnings);
  const faceDetectionEnabled =
    typeof root.faceDetectionEnabled === "boolean"
      ? root.faceDetectionEnabled
      : null;

  const hasUsableSignals =
    meanLuma != null ||
    laplacianVariance != null ||
    faceCount != null ||
    primaryFaceAreaRatio != null;

  return {
    meanLuma,
    laplacianVariance,
    width,
    height,
    faceCount,
    primaryFaceAreaRatio,
    primaryFaceCenterDistance,
    warnings,
    faceDetectionEnabled,
    hasUsableSignals,
  };
}
