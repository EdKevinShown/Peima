/**
 * P7.5-r7-b: cloud vision analyze types (no HTTP in this module).
 */

import type { PhotoVisualTag } from "./onboarding-vision-taxonomy";
import type { QualityTag } from "./onboarding-vision-quality-scene-taxonomy";
import type { SceneTag } from "./onboarding-vision-quality-scene-taxonomy";

export type CloudVisionImageRef =
  | { kind: "bytes"; mimeType: string; buffer: Buffer }
  | { kind: "signedUrl"; url: string; expiresAt?: string };

/** Closed taxonomy hints only — no PII / gender / review fields. */
export type CloudVisionTaxonomyHints = {
  photoVisual: readonly string[];
  quality: readonly string[];
  scene: readonly string[];
};

export type CloudVisionAnalyzeInput = {
  imageRef?: CloudVisionImageRef;
  imageId?: string;
  taxonomyHints: CloudVisionTaxonomyHints;
  viewerStyleTags?: string[];
  locale?: string;
  /** Test / DEV scenario override (not persisted). */
  mockScenario?: CloudVisionMockScenario;
};

export type CloudVisionMockScenario =
  | "normal"
  | "empty"
  | "invalidTag"
  | "timeout"
  | "refusal";

export type CloudVisionScoredLabel<T extends string = string> = {
  tag: T;
  score: number;
};

export type CloudVisionRawLabels = {
  photoVisual: CloudVisionScoredLabel[];
  quality: CloudVisionScoredLabel[];
  scene: CloudVisionScoredLabel[];
};

export type CloudVisionRawRefusal = {
  code: string;
  message: string;
};

export type CloudVisionRawResult = {
  vendor: string;
  model: string;
  latencyMs: number;
  requestId?: string;
  labels: CloudVisionRawLabels;
  refusal?: CloudVisionRawRefusal;
  /** Stripped before persist — must not contain sensitive keys. */
  debug?: Record<string, unknown>;
};

export interface CloudVisionAdapter {
  analyze(input: CloudVisionAnalyzeInput): Promise<CloudVisionRawResult>;
}

export type CloudVisionNormalizedLabels = {
  photoVisualTags: PhotoVisualTag[];
  qualityTags: QualityTag[];
  sceneTags: SceneTag[];
  confidence: number;
  warnings: string[];
  fallbackNeeded: boolean;
  fallbackReason?: string;
};
