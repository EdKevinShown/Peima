/**
 * P7.5-r1: onboarding photo vision profile (design-only persistence in r2+).
 */

export const ONBOARDING_VISION_SCHEMA_VERSION = "onboarding-vision-v1" as const;

export type OnboardingVisionSchemaVersion =
  typeof ONBOARDING_VISION_SCHEMA_VERSION;

export type OnboardingVisionProvider =
  | "rules"
  | "stub"
  | "cloud"
  | "zhipu";

export type OnboardingVisionStatus = "ok" | "skipped" | "failed";

export type OnboardingVisionClarity = "low" | "medium" | "high";

export type OnboardingVisionLighting = "dark" | "normal" | "bright";

export type OnboardingVisionComposition =
  | "centered_face"
  | "half_body"
  | "busy_bg";

export type OnboardingVisionQualityTaxonomyVersion = "quality-v1";
export type OnboardingVisionSceneTaxonomyVersion = "scene-v1";

export type OnboardingVisionProfileV1 = {
  schemaVersion: OnboardingVisionSchemaVersion;
  sourceVersion: string;
  photoVisualTaxonomyVersion: "p7.5-v1";
  qualityTaxonomyVersion?: OnboardingVisionQualityTaxonomyVersion;
  sceneTaxonomyVersion?: OnboardingVisionSceneTaxonomyVersion;
  provider: OnboardingVisionProvider;
  model?: string | null;
  generatedAt: string;
  visionStatus: OnboardingVisionStatus;
  fallbackUsed: boolean;
  fallbackReason?: string;
  photoVisualTags: string[];
  qualityTags?: string[];
  sceneTags?: string[];
  styleSignals?: string[];
  qualitySignals?: {
    clarity?: OnboardingVisionClarity;
    lighting?: OnboardingVisionLighting;
    composition?: OnboardingVisionComposition;
  };
  faceSignals?: {
    faceCount?: number;
    primaryFaceAreaRatio?: number;
    multipleFacesWarning?: boolean;
  };
  confidence: number;
  warnings?: string[];
  rawProviderMeta?: {
    requestId?: string;
    latencyMs?: number;
    tokenUsage?: { prompt?: number; completion?: number };
  };
};

export type OnboardingVisionRulesInput = {
  detectionScoreJson?: unknown;
  viewerStyleTags?: string[];
};

export type OnboardingVisionBuildInput = OnboardingVisionRulesInput;
