import type {
  MatchInsights,
  MatchInsightsRrmV2Top2SelectorShadow,
  MatchInsightsScoreShadowV2,
  MatchInsightsTop2ScoreSnapshot,
} from "@peima/shared/types";

/**
 * Must match `MATCH_INSIGHTS_RRM_V2_TOP2_SELECTOR_SHADOW_VERSION` in
 * `packages/shared/types/match-p1.ts`. Declared here so worker runtime does not
 * import `@peima/shared/types` as a value (Node would load `types/index.ts` and
 * fail ESM resolution for extensionless `./match-p1`).
 */
const MATCH_INSIGHTS_RRM_V2_TOP2_SELECTOR_SHADOW_VERSION =
  "m6.0-rrm-v2-top2-selector-shadow-v1" as const;
const TOP2_SCORE_SNAPSHOT_SOURCE_VERSION = "m6.10-top2-score-snapshot-v1" as const;
import { buildMatchInsightsPlaceholder } from "./match-insights-placeholder.js";
import {
  type CandidateUserLike,
  type ScoreComponentsV1,
  type UserProfileLike,
} from "./matching-score.js";
import {
  computeRelationshipProfileScoreV2,
  type RelationshipProfileScoreV2Result,
} from "./relationship-profile-score-v2.js";
import {
  selectV2Top2Candidates,
  type RrmV2Top2CandidateInput,
  type RrmV2Top2SelectorOptions,
} from "./rrm-v2-top2-selector.js";
import { readM6RrmDecisionShadowEnv } from "./batch-match-rrm-decision-shadow-env.js";
import { buildRrmDecisionShadowPayload } from "./batch-match-rrm-decision-shadow.js";
import { buildRrmBoundedDecisionDryRunPayload } from "./batch-match-rrm-bounded-decision.js";

function toScoreShadowV2(
  r: RelationshipProfileScoreV2Result,
): MatchInsightsScoreShadowV2 {
  return {
    scoringVersion: r.scoringVersion,
    rawCompatibilityScore: r.rawCompatibilityScore,
    weightedBaseScore: r.weightedBaseScore,
    penaltyTotal: r.penaltyTotal,
    cappedRawScore: r.cappedRawScore,
    displayScore100: r.displayScore100,
    band: r.band,
    capApplied: r.capApplied,
    coreConflictCount: r.coreConflictCount,
    strongConflictCount: r.strongConflictCount,
    redFlagConflictCount: r.redFlagConflictCount,
    validAxisCount: r.validAxisCount,
    skippedAxisCount: r.skippedAxisCount,
    source: r.source,
  };
}

function buildRrmV2Top2SelectorShadowFromSelectorRows(
  rows: readonly RrmV2Top2CandidateInput[],
  options?: RrmV2Top2SelectorOptions,
): MatchInsightsRrmV2Top2SelectorShadow {
  const sel = selectV2Top2Candidates(rows, options);
  return {
    version: MATCH_INSIGHTS_RRM_V2_TOP2_SELECTOR_SHADOW_VERSION,
    eligible: sel.eligible,
    selectedTop2: sel.selectedTop2,
    top1CandidateUserId: sel.top1CandidateUserId,
    top2CandidateUserId: sel.top2CandidateUserId,
    top2Gap: sel.top2Gap,
    contextFlags: sel.contextFlags,
    thresholds: sel.thresholds,
    reason: sel.reason,
  };
}

/**
 * Build `matchInsights.rrmV2Top2Selector` from pre-shaped candidate rows (tests / diagnostics).
 * Production uses {@link buildWorkerMatchInsightsForBestMatch} with `v2SelectorCandidates`.
 */
export function matchInsightsRrmV2Top2SelectorShadowFromCandidateRows(
  rows: readonly RrmV2Top2CandidateInput[],
  options?: RrmV2Top2SelectorOptions,
): MatchInsightsRrmV2Top2SelectorShadow {
  return buildRrmV2Top2SelectorShadowFromSelectorRows(rows, options);
}

function buildRrmV2Top2SelectorShadowFromPool(
  viewerProfile: UserProfileLike,
  pool: ReadonlyArray<{
    candidateUserId: string;
    candidateProfile: UserProfileLike;
    scoreComponents?: ScoreComponentsV1 | null;
  }>,
  options?: RrmV2Top2SelectorOptions,
): MatchInsightsRrmV2Top2SelectorShadow {
  const rows: RrmV2Top2CandidateInput[] = pool.map((row) => {
    const v2 = computeRelationshipProfileScoreV2(
      viewerProfile ?? undefined,
      row.candidateProfile ?? undefined,
    );
    return {
      candidateUserId: row.candidateUserId,
      scoreShadowV2: toScoreShadowV2(v2),
    };
  });
  return buildRrmV2Top2SelectorShadowFromSelectorRows(rows, options);
}

function toNumOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function buildTop2ScoreSnapshot(
  selectedTop2: MatchInsightsRrmV2Top2SelectorShadow["selectedTop2"],
  pool: ReadonlyArray<{
    candidateUserId: string;
    candidateProfile: UserProfileLike;
    scoreComponents?: ScoreComponentsV1 | null;
  }>,
): MatchInsightsTop2ScoreSnapshot {
  const scoreByCandidateId = new Map<
    string,
    {
      previewPoolScore: number | null;
      preferenceScore: number | null;
      styleScore: number | null;
      profileScore: number | null;
      finalScore: number | null;
    }
  >();
  for (const row of pool) {
    const id = row.candidateUserId.trim();
    if (!id || scoreByCandidateId.has(id)) continue;
    const c = row.scoreComponents;
    scoreByCandidateId.set(id, {
      previewPoolScore: toNumOrNull(c?.previewPoolScore),
      preferenceScore: toNumOrNull(c?.preferenceScore),
      styleScore: toNumOrNull(c?.styleScore),
      profileScore: toNumOrNull(c?.profileScore),
      finalScore: toNumOrNull(c?.finalScore),
    });
  }

  return {
    schemaVersion: 1,
    sourceType: "top2_score_snapshot",
    sourceVersion: TOP2_SCORE_SNAPSHOT_SOURCE_VERSION,
    items: selectedTop2.slice(0, 2).map((row, idx) => {
      const candidateUserId = row.candidateUserId.trim();
      const components = scoreByCandidateId.get(candidateUserId) ?? {
        previewPoolScore: null,
        preferenceScore: null,
        styleScore: null,
        profileScore: null,
        finalScore: null,
      };
      return {
        candidateUserId,
        rank: (idx + 1) as 1 | 2,
        finalScore: components.finalScore,
        displayScore100: toNumOrNull(row.displayScore100),
        band: row.band ?? null,
        components,
        scoreOwnerCandidateUserId: candidateUserId,
      };
    }),
  };
}

/**
 * P1-1 placeholder + M6.0-J3 scoreShadowV2 + M6.0-R3 rrmV2Top2Selector shadow (no scoreShadow v1 write).
 * M6.1-r3: optional `rrmDecisionShadow` when `PEIMA_M6_RRM_DECISION_SHADOW_ENABLED=1` (shadow-only).
 * M6.3-r3: optional `rrmBoundedDecision` dry-run meta when `PEIMA_M6_RRM_BOUNDED_DECISION_DRY_RUN_ENABLED=1` (audit only).
 * Does not read questionnaire answers as raw payloads, tokens, or RRM outputs.
 */
export function buildWorkerMatchInsightsForBestMatch(params: {
  components: ScoreComponentsV1;
  candidate: CandidateUserLike;
  viewerProfile: UserProfileLike;
  candidateProfile: UserProfileLike;
  /**
   * Batch-scored pool for the same viewer (same queue). When set, writes `rrmV2Top2Selector`
   * using per-row `computeRelationshipProfileScoreV2(viewer, candidateProfile)` — no extra DB.
   */
  v2SelectorCandidates?: ReadonlyArray<{
    candidateUserId: string;
    candidateProfile: UserProfileLike;
    scoreComponents?: ScoreComponentsV1 | null;
  }>;
  v2SelectorOptions?: RrmV2Top2SelectorOptions;
  /** M6.1-r3: formal winner user id for shadow baseline (no DB lookup here). */
  baselineCandidateUserId?: string;
  /** M6.1-r3: defaults to `components.finalScore` for shadow `finalScoreBand`. */
  finalScore?: number;
}): MatchInsights {
  const base = buildMatchInsightsPlaceholder(
    params.components,
    params.candidate,
  );
  const v2 = computeRelationshipProfileScoreV2(
    params.viewerProfile ?? undefined,
    params.candidateProfile ?? undefined,
  );
  const out: MatchInsights = {
    ...base,
    scoreShadowV2: toScoreShadowV2(v2),
  };
  if (params.v2SelectorCandidates != null) {
    out.rrmV2Top2Selector = buildRrmV2Top2SelectorShadowFromPool(
      params.viewerProfile,
      params.v2SelectorCandidates,
      params.v2SelectorOptions,
    );
    out.top2ScoreSnapshot = buildTop2ScoreSnapshot(
      out.rrmV2Top2Selector.selectedTop2,
      params.v2SelectorCandidates,
    );
  }
  if (readM6RrmDecisionShadowEnv().enabled) {
    out.rrmDecisionShadow = buildRrmDecisionShadowPayload({
      baselineCandidateUserId: params.baselineCandidateUserId ?? "",
      finalScore: params.finalScore ?? params.components.finalScore,
      insights: out,
    });
  }
  const bounded = buildRrmBoundedDecisionDryRunPayload({
    insights: out,
    baselineCandidateUserId: params.baselineCandidateUserId ?? "",
  });
  if (bounded != null) {
    out.rrmBoundedDecision = bounded;
  }
  return out;
}
