/**
 * P7.4-r1c-b: primary face selection (pure functions, no cropping / no identity).
 */

export type FaceBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RawDetectedFace = {
  score: number;
  box: FaceBox;
};

export type EnrichedFaceMetrics = RawDetectedFace & {
  areaRatio: number;
  centerDistance: number;
  primaryScore: number;
};

export type PrimaryFaceSnapshot = EnrichedFaceMetrics & {
  index: number;
};

export type FaceDetectionScoreBlock = {
  faceCount: number;
  faces: EnrichedFaceMetrics[];
  primaryFace?: PrimaryFaceSnapshot;
};

const SCORE_EPS = 1e-9;
const AREA_EPS = 1e-12;
const DIST_EPS = 1e-9;

export function computeAreaRatio(
  box: FaceBox,
  imageWidth: number,
  imageHeight: number,
): number {
  if (imageWidth < 1 || imageHeight < 1) return 0;
  const area = Math.max(0, box.width) * Math.max(0, box.height);
  return area / (imageWidth * imageHeight);
}

/** Normalized distance from face center to image center; 0 = centered, 1 = corner-ish. */
export function computeCenterDistance(
  box: FaceBox,
  imageWidth: number,
  imageHeight: number,
): number {
  if (imageWidth < 1 || imageHeight < 1) return 1;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const ix = imageWidth / 2;
  const iy = imageHeight / 2;
  const dist = Math.hypot(cx - ix, cy - iy);
  const maxDist = Math.hypot(imageWidth / 2, imageHeight / 2);
  if (maxDist <= 0) return 0;
  return Math.min(1, dist / maxDist);
}

export function computePrimaryScore(
  score: number,
  areaRatio: number,
  centerDistance: number,
): number {
  return score * 0.5 + areaRatio * 0.4 + (1 - centerDistance) * 0.1;
}

export function enrichFaceMetrics(
  face: RawDetectedFace,
  imageWidth: number,
  imageHeight: number,
): EnrichedFaceMetrics {
  const areaRatio = computeAreaRatio(face.box, imageWidth, imageHeight);
  const centerDistance = computeCenterDistance(
    face.box,
    imageWidth,
    imageHeight,
  );
  return {
    ...face,
    areaRatio,
    centerDistance,
    primaryScore: computePrimaryScore(face.score, areaRatio, centerDistance),
  };
}

/** Returns index of winning face. Tie-break: areaRatio → centerDistance → lower index. */
export function selectPrimaryFaceIndex(
  faces: EnrichedFaceMetrics[],
): number {
  if (faces.length === 0) return -1;
  let best = 0;
  for (let i = 1; i < faces.length; i++) {
    const a = faces[i]!;
    const b = faces[best]!;
    if (comparePrimaryFaceCandidate(a, b) < 0) {
      best = i;
    }
  }
  return best;
}

/** Negative if `a` should win over `b`. */
export function comparePrimaryFaceCandidate(
  a: EnrichedFaceMetrics,
  b: EnrichedFaceMetrics,
): number {
  if (a.primaryScore - b.primaryScore > SCORE_EPS) return -1;
  if (b.primaryScore - a.primaryScore > SCORE_EPS) return 1;
  if (a.areaRatio - b.areaRatio > AREA_EPS) return -1;
  if (b.areaRatio - a.areaRatio > AREA_EPS) return 1;
  if (b.centerDistance - a.centerDistance > DIST_EPS) return -1;
  if (a.centerDistance - b.centerDistance > DIST_EPS) return 1;
  return 0;
}

export function buildFaceDetectionScoreBlock(
  rawFaces: RawDetectedFace[],
  imageWidth: number,
  imageHeight: number,
): FaceDetectionScoreBlock {
  const faces = rawFaces.map((f) =>
    enrichFaceMetrics(f, imageWidth, imageHeight),
  );
  const faceCount = faces.length;
  if (faceCount === 0) {
    return { faceCount: 0, faces: [] };
  }
  const index = selectPrimaryFaceIndex(faces);
  const primary = faces[index]!;
  return {
    faceCount,
    faces,
    primaryFace: {
      index,
      score: primary.score,
      box: primary.box,
      areaRatio: primary.areaRatio,
      centerDistance: primary.centerDistance,
      primaryScore: primary.primaryScore,
    },
  };
}
