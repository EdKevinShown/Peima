/**
 * P7.5-r4-h: plan + helpers for dev-only candidate image folder import (pure, testable).
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import * as path from "node:path";

export const R4_H_SCHEMA_VERSION = "p7.5-r4-n2-candidate-image-import-v3" as const;

const IMAGE_EXT = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
]);

export type CandidateMappingJsonV1 = {
  version?: number;
  publicBaseUrl?: string;
  items?: Array<{
    file: string;
    userId?: string;
    styleTags?: string[];
    nickname?: string;
    /** Demo: `male` | `female` only; omit / invalid → import skips row (no inference). */
    gender?: string;
  }>;
};

export type PlannedImportGender = "male" | "female" | "invalid";

export function isPlannedImportGenderValid(
  g: PlannedImportGender,
): g is "male" | "female" {
  return g === "male" || g === "female";
}

export type PlannedImportRow = {
  sourceBasename: string;
  absolutePath: string;
  /** When mapping lists a basename that does not exist under folderAbs. */
  sourceFileMissing?: boolean;
  /** 1-based index in mapping.json `items` for this mapping-derived row (dev debug). */
  mappingSourceLine1Based?: number;
  targetUserId: "from-mapping" | "new";
  mappingUserId?: string;
  styleTags: string[];
  nicknameHint?: string;
  genderNormalized: PlannedImportGender;
};

export function parseMappingItemGender(raw: unknown): PlannedImportGender {
  if (typeof raw !== "string") return "invalid";
  const s = raw.trim().toLowerCase();
  if (s === "male") return "male";
  if (s === "female") return "female";
  return "invalid";
}

export function isSupportedImageBasename(basename: string): boolean {
  if (basename.startsWith(".")) return false;
  const ext = path.extname(basename).toLowerCase();
  return IMAGE_EXT.has(ext);
}

export function parseCandidateMappingJson(
  raw: string,
): CandidateMappingJsonV1 | null {
  try {
    const v = JSON.parse(raw) as CandidateMappingJsonV1;
    if (!v || typeof v !== "object" || !Array.isArray(v.items)) return null;
    return v;
  } catch {
    return null;
  }
}

export function listEligibleImageFiles(folderAbs: string): string[] {
  if (!existsSync(folderAbs) || !statSync(folderAbs).isDirectory()) return [];
  const names = readdirSync(folderAbs);
  const out: string[] = [];
  for (const name of names) {
    const full = path.join(folderAbs, name);
    if (name === "mapping.json") continue;
    if (!statSync(full).isFile()) continue;
    if (!isSupportedImageBasename(name)) continue;
    out.push(full);
  }
  out.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
  return out;
}

export function buildImportPlan(opts: {
  folderAbs: string;
  mapping: CandidateMappingJsonV1 | null;
  tagPrefix: string;
  limit: number;
}): PlannedImportRow[] {
  const defaultStyle = ["生活感", "清爽自然"];

  /** Basenames referenced by at least one mapping line (discovery skips these entirely). */
  const mappingListedBasenames = new Set<string>();
  if (opts.mapping?.items?.length) {
    for (const it of opts.mapping.items) {
      const bn = path.basename(String(it.file ?? "").trim()).trim();
      if (bn && isSupportedImageBasename(bn)) {
        mappingListedBasenames.add(bn.toLowerCase());
      }
    }
  }

  const mappingRows: PlannedImportRow[] = [];
  if (opts.mapping?.items?.length) {
    for (let idx = 0; idx < opts.mapping.items!.length; idx += 1) {
      const it = opts.mapping.items![idx];
      const bn = path.basename(String(it.file ?? "").trim()).trim();
      if (!bn || !isSupportedImageBasename(bn)) continue;

      const abs = path.join(opts.folderAbs, bn);
      const present = existsSync(abs);
      const styleTags =
        Array.isArray(it.styleTags) && it.styleTags.length > 0
          ? [...it.styleTags]
          : defaultStyle;

      mappingRows.push({
        sourceBasename: bn,
        absolutePath: abs,
        sourceFileMissing: !present,
        mappingSourceLine1Based: idx + 1,
        targetUserId: it.userId ? "from-mapping" : "new",
        mappingUserId: it.userId,
        styleTags,
        nicknameHint: typeof it.nickname === "string" ? it.nickname : undefined,
        genderNormalized: parseMappingItemGender(it.gender),
      });
    }
  }

  const discovered: PlannedImportRow[] = [];
  for (const abs of listEligibleImageFiles(opts.folderAbs)) {
    const bn = path.basename(abs);
    if (mappingListedBasenames.has(bn.toLowerCase())) continue;

    discovered.push({
      sourceBasename: bn,
      absolutePath: abs,
      targetUserId: "new",
      styleTags: defaultStyle,
      nicknameHint: `${opts.tagPrefix}-${bn}`,
      genderNormalized: "invalid",
    });
  }
  discovered.sort((a, b) => a.sourceBasename.localeCompare(b.sourceBasename));

  const combined = [...mappingRows, ...discovered];
  return combined.slice(0, Math.max(opts.limit, 0));
}

/**
 * Stable segment for filenames / URL substring (ASCII only).
 */
function r4hSanitizeDedupSegment(s: string): string {
  const t = s.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return t.slice(0, 48) || "u";
}

export function slugForImportFilename(base: string): string {
  const stem = base.replace(/\.[^.]+$/, "");
  const s = stem.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 48);
  return s.length > 0 ? s : "img";
}

/**
 * Dedup substring embedded in uploaded filename + imageUrl — scoped per userId + imported file slug so
 * different demo users can reuse the same source file safely (P7.5-r4-n1).
 */
export function r4hPerUserImageDedupMarker(userId: string, slug: string): string {
  return `-r4h-u${r4hSanitizeDedupSegment(userId)}--${r4hSanitizeDedupSegment(slug)}--`;
}

/**
 * Legacy global marker (pre r4-n1); still used to find prior imports for this user only.
 */
export function r4hDedupMarkerInStoredName(slug: string): string {
  return `-r4h-import-${slug}`;
}
