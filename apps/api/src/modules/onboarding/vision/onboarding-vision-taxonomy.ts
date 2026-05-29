/**
 * P7.5-r1: closed Chinese photoVisualTags taxonomy.
 * Tag list is sourced from `@peima/shared/constants` (P7.5-r4-j) to stay in sync with account preference styleTags whitelist.
 */

import { ACCOUNT_STYLE_TAG_WHITELIST } from "@peima/shared/constants";

export const PHOTO_VISUAL_TAXONOMY_VERSION = "p7.5-v1" as const;

/** Onboarding aesthetic + P7.5 extensions (same strings as `UserPreference.styleTags` closed set). */
export const PHOTO_VISUAL_TAGS = ACCOUNT_STYLE_TAG_WHITELIST;

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
