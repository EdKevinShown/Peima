/**
 * P7.5-r4-h: plan + helpers for dev-only candidate image folder import (pure, testable).
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import * as path from "node:path";

export const R4_H_SCHEMA_VERSION = "p7.5-r4-h-candidate-image-import-v1" as const;

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
  const byFile = new Map<string, PlannedImportRow>();
  const defaultStyle = ["生活感", "清爽自然"];

  if (opts.mapping?.items?.length) {
    for (const it of opts.mapping.items) {
      const bn = path.basename(it.file).trim();
      if (!bn || !isSupportedImageBasename(bn)) continue;
      const abs = path.join(opts.folderAbs, bn);
      if (!existsSync(abs)) continue;
      const styleTags =
        Array.isArray(it.styleTags) && it.styleTags.length > 0
          ? [...it.styleTags]
          : defaultStyle;
      byFile.set(bn.toLowerCase(), {
        sourceBasename: bn,
        absolutePath: abs,
        targetUserId: it.userId ? "from-mapping" : "new",
        mappingUserId: it.userId,
        styleTags,
        nicknameHint: typeof it.nickname === "string" ? it.nickname : undefined,
        genderNormalized: parseMappingItemGender(it.gender),
      });
    }
  }

  for (const abs of listEligibleImageFiles(opts.folderAbs)) {
    const bn = path.basename(abs);
    const key = bn.toLowerCase();
    if (byFile.has(key)) continue;
    byFile.set(key, {
      sourceBasename: bn,
      absolutePath: abs,
      targetUserId: "new",
      styleTags: defaultStyle,
      nicknameHint: `${opts.tagPrefix}-${bn}`,
      genderNormalized: "invalid",
    });
  }

  const rows = [...byFile.values()];
  rows.sort((a, b) => a.sourceBasename.localeCompare(b.sourceBasename));
  return rows.slice(0, Math.max(opts.limit, 0));
}

export function slugForImportFilename(base: string): string {
  const stem = base.replace(/\.[^.]+$/, "");
  const s = stem.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 48);
  return s.length > 0 ? s : "img";
}

export function r4hDedupMarkerInStoredName(slug: string): string {
  return `-r4h-import-${slug}`;
}
