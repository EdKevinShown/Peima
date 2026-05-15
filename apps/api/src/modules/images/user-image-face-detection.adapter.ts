/**
 * P7.4-r1b: face presence detection adapter (no recognition / no embedding).
 */

export type FaceBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DetectedFace = {
  score: number;
  box: FaceBox;
};

export type FaceDetectionResult = {
  faceCount: number;
  faces: DetectedFace[];
};

export type FaceDetectionRgbInput = {
  rgb: Uint8Array;
  width: number;
  height: number;
};

export interface UserImageFaceDetector {
  detectFaces(input: FaceDetectionRgbInput): Promise<FaceDetectionResult>;
}

export const DEFAULT_FACE_DETECTION_INFER_TIMEOUT_MS = 8000;

/** @deprecated use getFaceDetectionInferTimeoutMs */
export const FACE_DETECTION_TIMEOUT_MS = DEFAULT_FACE_DETECTION_INFER_TIMEOUT_MS;

export function isFaceDetectionEnabled(): boolean {
  return process.env.FACE_DETECTION_ENABLED !== "0";
}

export function getFaceDetectionInferTimeoutMs(): number {
  const raw = process.env.FACE_DETECTION_INFER_TIMEOUT_MS;
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_FACE_DETECTION_INFER_TIMEOUT_MS;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) {
    return DEFAULT_FACE_DETECTION_INFER_TIMEOUT_MS;
  }
  return Math.floor(n);
}

export async function raceWithTimeout<T>(
  run: () => Promise<T>,
  timeoutMs: number,
  timeoutMessage = "face detection timeout",
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
