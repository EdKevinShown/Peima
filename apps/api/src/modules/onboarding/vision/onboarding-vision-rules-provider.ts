/**
 * P7.5-r1: rules-based OnboardingVisionProfile (no network, no DB).
 */

import { parseDetectionScoreJsonForVision } from "./onboarding-vision-detection-parse";
import type { OnboardingVisionEnv } from "./onboarding-vision-env";
import { readOnboardingVisionEnv } from "./onboarding-vision-env";
import {
  assembleOnboardingVisionProfile,
  clampConfidence,
  createSkippedOnboardingVisionProfile,
  ONBOARDING_VISION_SOURCE_RULES,
} from "./onboarding-vision-profile.builder";
import { filterKnownPhotoVisualTags } from "./onboarding-vision-taxonomy";
import type {
  OnboardingVisionClarity,
  OnboardingVisionComposition,
  OnboardingVisionLighting,
  OnboardingVisionProfileV1,
  OnboardingVisionRulesInput,
} from "./onboarding-vision.types";

/** meanLuma bands (conservative, separate from hard-fail EXTREME_MIN). */
const LUMA_DARK_MAX = 48;
const LUMA_BRIGHT_MIN = 175;

const LAPLACIAN_LOW_MAX = 45;
const LAPLACIAN_HIGH_MIN = 180;

const PRIMARY_FACE_CENTERED_AREA_MIN = 0.04;
const PRIMARY_FACE_CENTERED_DIST_MAX = 0.35;

type TagWeights = Map<string, number>;

function bump(weights: TagWeights, tag: string, delta: number): void {
  if (!tag) return;
  weights.set(tag, (weights.get(tag) ?? 0) + delta);
}

function classifyLighting(meanLuma: number | null): OnboardingVisionLighting {
  if (meanLuma == null) return "normal";
  if (meanLuma < LUMA_DARK_MAX) return "dark";
  if (meanLuma >= LUMA_BRIGHT_MIN) return "bright";
  return "normal";
}

function classifyClarity(
  laplacian: number | null,
): OnboardingVisionClarity {
  if (laplacian == null) return "medium";
  if (laplacian < LAPLACIAN_LOW_MAX) return "low";
  if (laplacian >= LAPLACIAN_HIGH_MIN) return "high";
  return "medium";
}

function classifyComposition(
  areaRatio: number | null,
  centerDistance: number | null,
): OnboardingVisionComposition | undefined {
  if (areaRatio == null || centerDistance == null) return undefined;
  if (
    areaRatio >= PRIMARY_FACE_CENTERED_AREA_MIN &&
    centerDistance <= PRIMARY_FACE_CENTERED_DIST_MAX
  ) {
    return "centered_face";
  }
  return undefined;
}

function pickTagsFromWeights(
  weights: TagWeights,
  viewerStyleTags: string[] | undefined,
  maxTags: number,
): string[] {
  const viewerKnown = filterKnownPhotoVisualTags(viewerStyleTags ?? []);
  for (const t of viewerKnown) {
    bump(weights, t, 0.35);
  }

  const ranked = [...weights.entries()].sort((a, b) => b[1] - a[1]);
  const picked: string[] = [];
  for (const [tag] of ranked) {
    if (picked.length >= maxTags) break;
    picked.push(tag);
  }

  if (picked.length === 0) {
    return ["生活感"];
  }

  if (picked.length < 3) {
    for (const fallback of ["简约干净", "生活感", "氛围感"]) {
      if (picked.length >= 3) break;
      if (!picked.includes(fallback)) picked.push(fallback);
    }
  }

  return picked.slice(0, maxTags);
}

export function buildVisionProfileFromRules(
  input: OnboardingVisionRulesInput,
  env: OnboardingVisionEnv = readOnboardingVisionEnv(),
  options?: { sourceVersion?: string },
): OnboardingVisionProfileV1 {
  const parsed = parseDetectionScoreJsonForVision(input.detectionScoreJson);

  if (!parsed.hasUsableSignals) {
    return createSkippedOnboardingVisionProfile(env, {
      provider: "rules",
      sourceVersion:
        options?.sourceVersion ?? ONBOARDING_VISION_SOURCE_RULES,
      reason: "missing_detection",
    });
  }

  const lighting = classifyLighting(parsed.meanLuma);
  const clarity = classifyClarity(parsed.laplacianVariance);
  const composition = classifyComposition(
    parsed.primaryFaceAreaRatio,
    parsed.primaryFaceCenterDistance,
  );

  const multipleFacesWarning =
    (parsed.faceCount != null && parsed.faceCount > 1) ||
    parsed.warnings.includes("MULTIPLE_FACES");

  const weights: TagWeights = new Map();
  const warnings: string[] = [];

  if (lighting === "bright" || lighting === "normal") {
    bump(weights, "清爽自然", 0.75);
    bump(weights, "简约干净", 0.7);
  }
  if (lighting === "bright") {
    bump(weights, "运动阳光", 0.35);
  }
  if (lighting === "dark") {
    bump(weights, "氛围感", 0.65);
    warnings.push("VISION_LOW_LIGHT");
  }

  if (clarity === "high") {
    bump(weights, "精致感", 0.8);
    bump(weights, "高级感", 0.45);
  } else if (clarity === "low") {
    bump(weights, "生活感", 0.5);
    warnings.push("VISION_LOW_CLARITY");
  }

  if (composition === "centered_face") {
    bump(weights, "清爽自然", 0.25);
    bump(weights, "简约干净", 0.2);
  }

  if (multipleFacesWarning) {
    bump(weights, "社交感", 0.55);
    warnings.push("VISION_MULTIPLE_FACES_WARNING");
  } else {
    bump(weights, "生活感", 0.4);
  }

  if (weights.size === 0 || Math.max(...weights.values()) < 0.35) {
    bump(weights, "生活感", 0.6);
  }

  let confidence = 0.52;
  if (clarity === "high") confidence += 0.12;
  if (composition === "centered_face") confidence += 0.1;
  if (lighting === "normal" || lighting === "bright") confidence += 0.06;
  if (lighting === "dark") confidence -= 0.18;
  if (clarity === "low") confidence -= 0.14;
  if (multipleFacesWarning) confidence -= 0.16;

  const photoVisualTags = pickTagsFromWeights(
    weights,
    input.viewerStyleTags,
    env.maxTags,
  );

  return assembleOnboardingVisionProfile(
    {
      provider: "rules",
      sourceVersion:
        options?.sourceVersion ?? ONBOARDING_VISION_SOURCE_RULES,
      visionStatus: "ok",
      fallbackUsed: false,
      photoVisualTags,
      styleSignals: [
        `lighting_${lighting}`,
        `clarity_${clarity}`,
        composition ? `composition_${composition}` : "composition_unknown",
      ],
      qualitySignals: {
        clarity,
        lighting,
        composition,
      },
      faceSignals: {
        faceCount: parsed.faceCount ?? undefined,
        primaryFaceAreaRatio: parsed.primaryFaceAreaRatio ?? undefined,
        multipleFacesWarning,
      },
      confidence: clampConfidence(confidence),
      warnings: warnings.length ? warnings : undefined,
    },
    env,
  );
}
