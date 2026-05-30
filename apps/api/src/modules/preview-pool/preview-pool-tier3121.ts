/**
 * Preview pool 6-slot layout: 3+2+1 (aesthetic_fit / style_similar / reflow).
 * Aligns with onboarding VisualRankingShadow tier semantics.
 */
import {
  pickReflowShadow,
  pickTopByScore,
  scoreAestheticFitShadow,
  scoreReflowShadow,
  scoreStyleSimilarShadow,
  type ShadowCandidateInput,
} from "../onboarding/vision/visual-ranking-shadow-scoring";
import type { ViewerPreferenceLike } from "@peima/shared/matching/preference-score";

export const PREVIEW_POOL_TIER3121_LAYOUT_VERSION = "preview_pool_tier_3121_v1" as const;

export type PreviewPoolTier3121Type = "aesthetic_fit" | "style_similar" | "reflow";

export type PreviewPoolTier3121DisplayMode = "clear" | "blurred" | "hidden";

export type PreviewPoolTier3121Slot = {
  rankInPool: number;
  candidateUserId: string;
  candidateType: PreviewPoolTier3121Type;
  displayMode: PreviewPoolTier3121DisplayMode;
  baseScore: number;
  slotReason: string;
  scoreReason: string;
};

export type AssignPreviewPoolTier3121Input = {
  candidates: ShadowCandidateInput[];
  viewerStyleTags: string[];
  viewerPhotoVisualTags: string[] | null;
  viewerVisionAvailable: boolean;
  viewerPref: ViewerPreferenceLike;
};

function displayModeForTier(tier: PreviewPoolTier3121Type): PreviewPoolTier3121DisplayMode {
  if (tier === "aesthetic_fit") return "clear";
  if (tier === "style_similar") return "blurred";
  return "hidden";
}

function pushPick(
  picks: PreviewPoolTier3121Slot[],
  pick: {
    candidate: ShadowCandidateInput;
    score: number;
    tier: PreviewPoolTier3121Type;
    scoreReason: string;
  },
): void {
  picks.push({
    rankInPool: picks.length + 1,
    candidateUserId: pick.candidate.userId,
    candidateType: pick.tier,
    displayMode: displayModeForTier(pick.tier),
    baseScore: pick.score,
    slotReason: `tier=${pick.tier}`,
    scoreReason: pick.scoreReason,
  });
}

/** Fill any missing slots from remaining candidates (preference score) so pool reaches 6. */
function fillRemainingSlots(
  picks: PreviewPoolTier3121Slot[],
  candidates: ShadowCandidateInput[],
  viewerStyleTags: string[],
  viewerPref: ViewerPreferenceLike,
): void {
  const usedIds = new Set(picks.map((p) => p.candidateUserId));
  const usedKeys = new Set(
    picks
      .map((p) => candidates.find((c) => c.userId === p.candidateUserId)?.displaySourceKey)
      .filter(Boolean) as string[],
  );

  while (picks.length < 6) {
    const tier: PreviewPoolTier3121Type =
      picks.length < 3
        ? "aesthetic_fit"
        : picks.length < 5
          ? "style_similar"
          : "reflow";

    const extra = pickTopByScore(
      candidates,
      usedIds,
      usedKeys,
      (c) => {
        if (tier === "reflow") {
          const r = scoreReflowShadow(c);
          return { score: r.score, reason: r.reason, reasonTags: r.reasonTags };
        }
        if (tier === "style_similar") {
          const r = scoreStyleSimilarShadow(
            null,
            false,
            c,
            viewerPref,
          );
          return { score: r.score, reason: r.reason, reasonTags: r.reasonTags };
        }
        const r = scoreAestheticFitShadow(viewerStyleTags, c, viewerPref);
        return { score: r.score, reason: r.reason, reasonTags: r.reasonTags };
      },
      1,
    );
    if (extra.length === 0) break;
    const p = extra[0]!;
    pushPick(picks, {
      candidate: p.candidate,
      score: p.score,
      tier,
      scoreReason: `${p.reason}:fill`,
    });
    usedIds.add(p.candidate.userId);
    usedKeys.add(p.candidate.displaySourceKey);
  }
}

/**
 * Assign up to 6 unique candidates using 3+2+1 scoring (same picks as visual-ranking shadow).
 */
export function assignPreviewPoolTier3121Slots(
  input: AssignPreviewPoolTier3121Input,
): PreviewPoolTier3121Slot[] {
  const {
    candidates,
    viewerStyleTags,
    viewerPhotoVisualTags,
    viewerVisionAvailable,
    viewerPref,
  } = input;

  const picks: PreviewPoolTier3121Slot[] = [];
  const usedUserIds = new Set<string>();
  const usedSourceKeys = new Set<string>();

  const aesthetic = pickTopByScore(
    candidates,
    usedUserIds,
    usedSourceKeys,
    (c) => scoreAestheticFitShadow(viewerStyleTags, c, viewerPref),
    3,
  );
  for (const p of aesthetic) {
    pushPick(picks, {
      candidate: p.candidate,
      score: p.score,
      tier: "aesthetic_fit",
      scoreReason: p.reason,
    });
    usedUserIds.add(p.candidate.userId);
    usedSourceKeys.add(p.candidate.displaySourceKey);
  }

  const styleSimilar = pickTopByScore(
    candidates,
    usedUserIds,
    usedSourceKeys,
    (c) =>
      scoreStyleSimilarShadow(
        viewerPhotoVisualTags,
        viewerVisionAvailable,
        c,
        viewerPref,
      ),
    2,
  );
  for (const p of styleSimilar) {
    pushPick(picks, {
      candidate: p.candidate,
      score: p.score,
      tier: "style_similar",
      scoreReason: p.reason,
    });
    usedUserIds.add(p.candidate.userId);
    usedSourceKeys.add(p.candidate.displaySourceKey);
  }

  const reflow = pickReflowShadow(candidates, usedUserIds, usedSourceKeys);
  if (reflow) {
    pushPick(picks, {
      candidate: reflow.candidate,
      score: reflow.score,
      tier: "reflow",
      scoreReason: reflow.reason,
    });
    usedUserIds.add(reflow.candidate.userId);
    usedSourceKeys.add(reflow.candidate.displaySourceKey);
  }

  if (picks.length < 6) {
    fillRemainingSlots(picks, candidates, viewerStyleTags, viewerPref);
  }

  return picks.slice(0, 6);
}

/** Shortlist v0: aesthetic (clear) slots are matchable for deep screen. */
export function isPreviewPoolShortlistEligibleDisplayMode(
  displayMode: string,
): boolean {
  return displayMode === "full" || displayMode === "clear";
}
