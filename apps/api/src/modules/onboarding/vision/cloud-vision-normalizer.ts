/**
 * P7.5-r7-b: normalize mock/cloud raw labels into closed taxonomies.
 */

import type { OnboardingVisionEnv } from "./onboarding-vision-env";
import { filterKnownPhotoVisualTags } from "./onboarding-vision-taxonomy";
import {
  normalizeQualityTags,
  normalizeSceneTags,
} from "./onboarding-vision-quality-scene-taxonomy";
import { stripCloudVisionSensitiveFields } from "./cloud-vision-sensitive";
import type {
  CloudVisionNormalizedLabels,
  CloudVisionRawResult,
} from "./cloud-vision.types";

function sortByScoreDesc<T extends { tag: string; score: number }>(
  labels: readonly T[],
): T[] {
  return [...labels].sort((a, b) => b.score - a.score);
}

function droppedUnknownCount(
  raw: readonly { tag: string }[],
  kept: readonly string[],
): number {
  const keptSet = new Set(kept);
  return raw.filter((l) => {
    const t = String(l.tag ?? "").trim();
    return t.length > 0 && !keptSet.has(t);
  }).length;
}

export function normalizeCloudVisionRawResult(
  raw: CloudVisionRawResult,
  env: Pick<OnboardingVisionEnv, "maxTags">,
): CloudVisionNormalizedLabels {
  const warnings: string[] = [];
  const safeRaw = stripCloudVisionSensitiveFields(raw);

  if (safeRaw.refusal) {
    return {
      photoVisualTags: [],
      qualityTags: [],
      sceneTags: [],
      confidence: 0.25,
      warnings: ["VISION_CLOUD_REFUSAL"],
      fallbackNeeded: true,
      fallbackReason: "cloud_refusal",
    };
  }

  const photoRanked = sortByScoreDesc(safeRaw.labels.photoVisual ?? []);
  const qualityRanked = sortByScoreDesc(safeRaw.labels.quality ?? []);
  const sceneRanked = sortByScoreDesc(safeRaw.labels.scene ?? []);

  const photoVisualTags = filterKnownPhotoVisualTags(
    photoRanked.map((l) => l.tag),
  ).slice(0, env.maxTags);

  const qualityTags = normalizeQualityTags(
    qualityRanked.map((l) => l.tag),
    env.maxTags,
  ) as CloudVisionNormalizedLabels["qualityTags"];

  const sceneTags = normalizeSceneTags(
    sceneRanked.map((l) => l.tag),
    env.maxTags,
  ) as CloudVisionNormalizedLabels["sceneTags"];

  const photoDropped = droppedUnknownCount(
    safeRaw.labels.photoVisual ?? [],
    photoVisualTags,
  );
  const qualityDropped = droppedUnknownCount(
    safeRaw.labels.quality ?? [],
    qualityTags,
  );
  const sceneDropped = droppedUnknownCount(
    safeRaw.labels.scene ?? [],
    sceneTags,
  );

  if (photoDropped + qualityDropped + sceneDropped > 0) {
    warnings.push("VISION_CLOUD_UNKNOWN_TAG");
  }

  if (photoVisualTags.length === 0) {
    return {
      photoVisualTags: [],
      qualityTags,
      sceneTags,
      confidence: 0.25,
      warnings: [...warnings, "VISION_CLOUD_EMPTY_PHOTO_TAGS"],
      fallbackNeeded: true,
      fallbackReason: "cloud_empty_photo_tags",
    };
  }

  const photoSet = new Set<string>(photoVisualTags);
  const qualitySet = new Set<string>(qualityTags);
  const sceneSet = new Set<string>(sceneTags);
  const scores = [
    ...photoRanked.filter((l) => photoSet.has(l.tag)).map((l) => l.score),
    ...qualityRanked.filter((l) => qualitySet.has(l.tag)).map((l) => l.score),
    ...sceneRanked.filter((l) => sceneSet.has(l.tag)).map((l) => l.score),
  ];
  const mean =
    scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0.45;
  let confidence = 0.35 + mean * 0.45;
  if (qualityTags.includes("略模糊")) confidence -= 0.08;
  if (qualityTags.includes("光线偏暗")) confidence -= 0.1;
  if (qualityTags.includes("多人脸")) confidence -= 0.06;
  confidence = Math.min(0.85, Math.max(0.15, confidence));

  return {
    photoVisualTags,
    qualityTags,
    sceneTags,
    confidence,
    warnings,
    fallbackNeeded: false,
  };
}

export function assertNormalizedVisionHasNoSensitiveFields(
  profile: Record<string, unknown>,
): void {
  const json = JSON.stringify(profile);
  for (const key of [
    "beautyScore",
    "genderGuess",
    "faceEmbedding",
    "aiAvatarSuggestion",
  ]) {
    if (json.includes(`"${key}"`)) {
      throw new Error(`sensitive field leaked: ${key}`);
    }
  }
}
