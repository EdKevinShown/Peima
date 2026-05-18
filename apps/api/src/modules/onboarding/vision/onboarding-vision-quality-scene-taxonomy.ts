/**
 * P7.5-r7-b: closed qualityTags / sceneTags taxonomies (sidecar JSON only).
 */

export const QUALITY_TAXONOMY_VERSION = "quality-v1" as const;
export const SCENE_TAXONOMY_VERSION = "scene-v1" as const;

export const QUALITY_TAGS = [
  "清晰",
  "略模糊",
  "光线偏暗",
  "光线明亮",
  "光线正常",
  "构图居中",
  "半身构图",
  "背景杂乱",
  "多人脸",
] as const;

export const SCENE_TAGS = [
  "室内日常",
  "户外自然",
  "都市街景",
  "旅行度假",
  "社交聚会",
  "运动活动",
  "工作通勤",
  "证件棚拍",
] as const;

export type QualityTag = (typeof QUALITY_TAGS)[number];
export type SceneTag = (typeof SCENE_TAGS)[number];

const QUALITY_SET = new Set<string>(QUALITY_TAGS);
const SCENE_SET = new Set<string>(SCENE_TAGS);

export function isKnownQualityTag(tag: string): tag is QualityTag {
  return QUALITY_SET.has(tag);
}

export function isKnownSceneTag(tag: string): tag is SceneTag {
  return SCENE_SET.has(tag);
}

function normalizeClosedTags(
  tags: readonly string[],
  allowed: Set<string>,
  maxTags: number,
): string[] {
  const cap =
    Number.isFinite(maxTags) && maxTags > 0 ? Math.floor(maxTags) : 6;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = String(raw ?? "").trim();
    if (!t || !allowed.has(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= cap) break;
  }
  return out;
}

export function normalizeQualityTags(
  tags: readonly string[],
  maxTags: number,
): string[] {
  return normalizeClosedTags(tags, QUALITY_SET, maxTags);
}

export function normalizeSceneTags(
  tags: readonly string[],
  maxTags: number,
): string[] {
  return normalizeClosedTags(tags, SCENE_SET, maxTags);
}
