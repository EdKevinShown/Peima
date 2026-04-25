import {
  computePreferenceScore,
  computeStyleScore,
  type ViewerPreferenceLike,
} from "@peima/shared/matching/preference-score";

/** Upper bound for gated candidate material pool before layered pick-6. */
export const MAX_GATED_CANDIDATES = 200;

export type GatedCandidateForLayering = {
  id: string;
  createdAt: Date;
  age: number | null;
  city: string;
  height: number | null;
  education: string;
  occupation: string;
  relationshipGoal: string;
  /** First image by `createdAt asc`; may be empty when `hasImage` is false. */
  firstImageStyleTags: string[];
  /** `UserImage.id` for first image; set when `hasImage` for step-3 cache / stub key. */
  firstImageId: string | null;
  /** `UserImage.url` for first image; preferred key/input for visual LLM path. */
  firstImageUrl?: string | null;
  hasImage: boolean;
  /**
   * Step 3 (optional): validated visual enhance payload (stub/llm). When absent, visual order uses pure
   * `computeStyleScore`.
   */
  visualEnhance?: {
    visualTags: string[];
    visualConfidence: number;
    visualSignalScore: number;
    visualReason: string;
  };
};

/** Step 3 v0: blend tag score with stub LLM signal (see P6 visual enhance doc). */
const VISUAL_SORT_ALPHA = 0.55;
const VISUAL_SORT_BETA = 0.45;

export function computeVisualSortScore(
  c: GatedCandidateForLayering,
  viewerPref: ViewerPreferenceLike,
): number {
  const { score: tag } = computeStyleScore(viewerPref, {
    styleTags: c.firstImageStyleTags,
  });
  const v = c.visualEnhance;
  if (v == null) {
    return tag;
  }
  return (
    VISUAL_SORT_ALPHA * tag +
    VISUAL_SORT_BETA * v.visualSignalScore * v.visualConfidence
  );
}

export type LayeredSlotPick = {
  rankInPool: number;
  candidateUserId: string;
  borrowedVisual: boolean;
};

function toCandidateLike(c: GatedCandidateForLayering) {
  return {
    age: c.age,
    city: c.city,
    height: c.height,
    education: c.education,
    occupation: c.occupation,
    relationshipGoal: c.relationshipGoal,
  };
}

function compareCompatOrder(
  a: GatedCandidateForLayering,
  b: GatedCandidateForLayering,
  viewerPref: ViewerPreferenceLike,
): number {
  const pa = computePreferenceScore(viewerPref, toCandidateLike(a));
  const pb = computePreferenceScore(viewerPref, toCandidateLike(b));
  if (pb !== pa) return pb - pa;
  return a.createdAt.getTime() - b.createdAt.getTime();
}

function compareVisualStyleOrder(
  a: GatedCandidateForLayering,
  b: GatedCandidateForLayering,
  viewerPref: ViewerPreferenceLike,
): number {
  const sa = computeVisualSortScore(a, viewerPref);
  const sb = computeVisualSortScore(b, viewerPref);
  if (sb !== sa) return sb - sa;
  return a.createdAt.getTime() - b.createdAt.getTime();
}

function compareBackupOrder(
  a: GatedCandidateForLayering,
  b: GatedCandidateForLayering,
  viewerPref: ViewerPreferenceLike,
): number {
  const t = a.createdAt.getTime() - b.createdAt.getTime();
  if (t !== 0) return t;
  const pa = computePreferenceScore(viewerPref, toCandidateLike(a));
  const pb = computePreferenceScore(viewerPref, toCandidateLike(b));
  return pb - pa;
}

/** Sort all `gAll` by compat (preferenceScore) order — used for compat picks and visual borrow. */
export function sortGAllByCompatOrder(
  gAll: GatedCandidateForLayering[],
  viewerPref: ViewerPreferenceLike,
): GatedCandidateForLayering[] {
  return [...gAll].sort((a, b) => compareCompatOrder(a, b, viewerPref));
}

export function pickVisualCandidates(
  gAll: GatedCandidateForLayering[],
  viewerPref: ViewerPreferenceLike,
): { userId: string; borrowed: boolean }[] {
  const gPhoto = gAll.filter((c) => c.hasImage);
  const visualOrdered = [...gPhoto].sort((a, b) =>
    compareVisualStyleOrder(a, b, viewerPref),
  );

  const out: { userId: string; borrowed: boolean }[] = [];
  for (const c of visualOrdered) {
    if (out.length >= 2) break;
    out.push({ userId: c.id, borrowed: false });
  }

  if (out.length >= 2) return out;

  const compatOrder = sortGAllByCompatOrder(gAll, viewerPref);
  const taken = new Set(out.map((x) => x.userId));
  for (const c of compatOrder) {
    if (out.length >= 2) break;
    if (taken.has(c.id)) continue;
    out.push({ userId: c.id, borrowed: true });
    taken.add(c.id);
  }

  return out;
}

export function pickCompatCandidates(
  gAll: GatedCandidateForLayering[],
  excludeIds: Set<string>,
  viewerPref: ViewerPreferenceLike,
  take: number,
): string[] {
  const pool = gAll.filter((c) => !excludeIds.has(c.id));
  const ordered = [...pool].sort((a, b) =>
    compareCompatOrder(a, b, viewerPref),
  );
  return ordered.slice(0, take).map((c) => c.id);
}

export function pickBackupCandidates(
  gAll: GatedCandidateForLayering[],
  excludeIds: Set<string>,
  viewerPref: ViewerPreferenceLike,
  take: number,
): string[] {
  const pool = gAll.filter((c) => !excludeIds.has(c.id));
  const ordered = [...pool].sort((a, b) =>
    compareBackupOrder(a, b, viewerPref),
  );
  return ordered.slice(0, take).map((c) => c.id);
}

/**
 * Layered pick-6: visual (1–2) → compat (3–4) → backup (5–6). Strict de-duplication.
 * Preconditions: `gAll.length >= 6` (caller validates); each id unique in `gAll`.
 */
export function assignLayeredSixUserIds(
  gAll: GatedCandidateForLayering[],
  viewerPref: ViewerPreferenceLike,
): LayeredSlotPick[] {
  const visualPicks = pickVisualCandidates(gAll, viewerPref);
  const selected = new Set<string>();
  for (const v of visualPicks) {
    selected.add(v.userId);
  }

  const compatIds = pickCompatCandidates(gAll, selected, viewerPref, 2);
  for (const id of compatIds) {
    selected.add(id);
  }

  const backupIds = pickBackupCandidates(gAll, selected, viewerPref, 2);
  for (const id of backupIds) {
    selected.add(id);
  }

  if (selected.size !== 6) {
    throw new Error(
      `assignLayeredSixUserIds: expected 6 unique ids, got ${selected.size} (visual=${visualPicks.length}, compat=${compatIds.length}, backup=${backupIds.length})`,
    );
  }

  const ranks: LayeredSlotPick[] = [];
  for (let i = 0; i < visualPicks.length; i++) {
    ranks.push({
      rankInPool: i + 1,
      candidateUserId: visualPicks[i].userId,
      borrowedVisual: visualPicks[i].borrowed,
    });
  }
  for (let i = 0; i < compatIds.length; i++) {
    ranks.push({
      rankInPool: 3 + i,
      candidateUserId: compatIds[i],
      borrowedVisual: false,
    });
  }
  for (let i = 0; i < backupIds.length; i++) {
    ranks.push({
      rankInPool: 5 + i,
      candidateUserId: backupIds[i],
      borrowedVisual: false,
    });
  }

  return ranks;
}
