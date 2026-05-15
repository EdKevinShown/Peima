/**
 * P7.5-r1: closed Chinese photoVisualTags taxonomy.
 */

export const PHOTO_VISUAL_TAXONOMY_VERSION = "p7.5-v1" as const;

/** Onboarding aesthetic UI tags (12) + P7.5 extensions (6). */
export const PHOTO_VISUAL_TAGS = [
  "清爽自然",
  "甜美可爱",
  "酷感个性",
  "成熟稳重",
  "文艺温柔",
  "运动阳光",
  "生活感",
  "精致感",
  "松弛感",
  "氛围感",
  "简约干净",
  "有个性",
  "都市精致",
  "高级感",
  "户外感",
  "社交感",
  "室内日常",
  "证件感弱",
] as const;

export type PhotoVisualTag = (typeof PHOTO_VISUAL_TAGS)[number];

const TAG_SET = new Set<string>(PHOTO_VISUAL_TAGS);

export function isKnownPhotoVisualTag(tag: string): tag is PhotoVisualTag {
  return TAG_SET.has(tag);
}

/**
 * Trim, dedupe (first wins), keep only taxonomy tags, cap at maxTags.
 */
export function normalizePhotoVisualTags(
  tags: readonly string[],
  maxTags: number,
): string[] {
  const cap =
    Number.isFinite(maxTags) && maxTags > 0 ? Math.floor(maxTags) : 6;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = String(raw ?? "").trim();
    if (!t || !TAG_SET.has(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= cap) break;
  }
  return out;
}

export function filterKnownPhotoVisualTags(
  tags: readonly string[],
): PhotoVisualTag[] {
  return tags.filter((t): t is PhotoVisualTag => isKnownPhotoVisualTag(t));
}
