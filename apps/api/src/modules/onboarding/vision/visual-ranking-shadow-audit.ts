/**
 * P7.5-r4-c: aggregate visualRankingShadow rows for readiness metrics (pure; no IDs in output).
 */

import type { VisualRankingShadowTier } from "./visual-ranking-shadow.types";
import { VISUAL_RANKING_SHADOW_SCHEMA_VERSION } from "./visual-ranking-shadow.types";

export const P75_R4_SHADOW_AUDIT_SCHEMA_VERSION =
  "p7.5-r4-shadow-audit-v1" as const;

export type VisualRankingShadowParsed = {
  changedSlots: number;
  candidatesWithVision: number;
  candidatesMissingVision: number;
  viewerVisionAvailable: boolean;
  applyToPoolIgnored: boolean;
  reasonTagsFlattened: string[];
  tierHadChange: Partial<Record<VisualRankingShadowTier, boolean>>;
  fullShuffle: boolean;
};

const TIER_EXPECTED: VisualRankingShadowTier[] = [
  "aesthetic_fit",
  "aesthetic_fit",
  "aesthetic_fit",
  "style_similar",
  "style_similar",
  "reflow",
];

function parseTier(t: unknown): VisualRankingShadowTier | null {
  if (t === "aesthetic_fit" || t === "style_similar" || t === "reflow") {
    return t;
  }
  return null;
}

export function parseVisualRankingShadowPayloadSafe(
  payloadJson: unknown,
): VisualRankingShadowParsed | null {
  if (
    payloadJson === null ||
    typeof payloadJson !== "object" ||
    Array.isArray(payloadJson)
  ) {
    return null;
  }
  const obj = payloadJson as Record<string, unknown>;
  if (obj.schemaVersion !== VISUAL_RANKING_SHADOW_SCHEMA_VERSION) {
    return null;
  }
  if (obj.appliedToPool !== false) {
    return null;
  }

  const slots = obj.slots;
  if (!Array.isArray(slots) || slots.length !== 6) {
    return null;
  }

  const summary = obj.summary;
  if (
    summary === null ||
    typeof summary !== "object" ||
    Array.isArray(summary)
  ) {
    return null;
  }
  const summ = summary as Record<string, unknown>;

  const changedSlots =
    typeof summ.changedSlots === "number" ? summ.changedSlots : null;
  if (
    changedSlots === null ||
    changedSlots < 0 ||
    changedSlots > 6 ||
    !Number.isFinite(changedSlots)
  ) {
    return null;
  }

  const changedTiersRaw = summ.changedTiers;
  if (!Array.isArray(changedTiersRaw)) {
    return null;
  }
  const changedTiersDedup = new Set<VisualRankingShadowTier>();
  for (const t of changedTiersRaw) {
    const parsed = parseTier(t);
    if (!parsed) {
      return null;
    }
    changedTiersDedup.add(parsed);
  }

  const candidatesWithVision =
    typeof summ.candidatesWithVision === "number"
      ? summ.candidatesWithVision
      : null;
  const candidatesMissingVision =
    typeof summ.candidatesMissingVision === "number"
      ? summ.candidatesMissingVision
      : null;
  if (
    candidatesWithVision === null ||
    candidatesMissingVision === null ||
    candidatesWithVision < 0 ||
    candidatesMissingVision < 0 ||
    !Number.isFinite(candidatesWithVision) ||
    !Number.isFinite(candidatesMissingVision)
  ) {
    return null;
  }

  const viewerVisionAvailable = summ.viewerVisionAvailable === true;
  const applyToPoolIgnored =
    summ.applyToPoolIgnored === undefined
      ? false
      : summ.applyToPoolIgnored === true;

  const tierHadChange: Partial<Record<VisualRankingShadowTier, boolean>> = {};

  let changedCountFromSlots = 0;
  const slotsChangedTiers = new Set<VisualRankingShadowTier>();
  const reasonTagsFlattened: string[] = [];

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (slot === null || typeof slot !== "object" || Array.isArray(slot)) {
      return null;
    }
    const s = slot as Record<string, unknown>;
    const tier = parseTier(s.tier);
    if (!tier || tier !== TIER_EXPECTED[i]) {
      return null;
    }
    if (typeof s.wouldChange !== "boolean") {
      return null;
    }
    const reasonTags = s.reasonTags;
    if (!Array.isArray(reasonTags)) {
      return null;
    }
    for (const tag of reasonTags) {
      if (typeof tag === "string" && tag.trim()) {
        reasonTagsFlattened.push(tag.trim());
      }
    }

    if (s.wouldChange) {
      changedCountFromSlots += 1;
      slotsChangedTiers.add(tier);
      tierHadChange[tier] = true;
    }
  }

  if (changedCountFromSlots !== changedSlots) {
    return null;
  }

  if (changedTiersDedup.size !== slotsChangedTiers.size) {
    return null;
  }
  for (const t of changedTiersDedup) {
    if (!slotsChangedTiers.has(t)) {
      return null;
    }
  }

  return {
    changedSlots,
    candidatesWithVision,
    candidatesMissingVision,
    viewerVisionAvailable,
    applyToPoolIgnored,
    reasonTagsFlattened,
    tierHadChange,
    fullShuffle: changedSlots >= 6,
  };
}

export type ShadowAuditAccumulator = {
  validCount: number;
  changedSlotsBuckets: Record<string, number>;
  tierChangeRowCount: {
    aesthetic_fit: number;
    style_similar: number;
    reflow: number;
  };
  sumChangedSlots: number;
  sumCandidatesWithVision: number;
  sumCandidatesMissingVision: number;
  viewerVisionAvailableCount: number;
  applyToPoolIgnoredCount: number;
  fullShuffleCount: number;
  reasonTagCounts: Map<string, number>;
};

export function createShadowAuditAccumulator(): ShadowAuditAccumulator {
  return {
    validCount: 0,
    changedSlotsBuckets: {
      "0": 0,
      "1": 0,
      "2": 0,
      "3": 0,
      "4": 0,
      "5": 0,
      "6": 0,
    },
    tierChangeRowCount: {
      aesthetic_fit: 0,
      style_similar: 0,
      reflow: 0,
    },
    sumChangedSlots: 0,
    sumCandidatesWithVision: 0,
    sumCandidatesMissingVision: 0,
    viewerVisionAvailableCount: 0,
    applyToPoolIgnoredCount: 0,
    fullShuffleCount: 0,
    reasonTagCounts: new Map<string, number>(),
  };
}

export function ingestParsedShadow(
  acc: ShadowAuditAccumulator,
  parsed: VisualRankingShadowParsed,
): void {
  acc.validCount += 1;
  const bucketKey = String(parsed.changedSlots);
  acc.changedSlotsBuckets[bucketKey] =
    (acc.changedSlotsBuckets[bucketKey] ?? 0) + 1;

  acc.sumChangedSlots += parsed.changedSlots;
  acc.sumCandidatesWithVision += parsed.candidatesWithVision;
  acc.sumCandidatesMissingVision += parsed.candidatesMissingVision;
  if (parsed.viewerVisionAvailable) acc.viewerVisionAvailableCount += 1;
  if (parsed.applyToPoolIgnored) acc.applyToPoolIgnoredCount += 1;
  if (parsed.fullShuffle) acc.fullShuffleCount += 1;

  if (parsed.tierHadChange.aesthetic_fit) {
    acc.tierChangeRowCount.aesthetic_fit += 1;
  }
  if (parsed.tierHadChange.style_similar) {
    acc.tierChangeRowCount.style_similar += 1;
  }
  if (parsed.tierHadChange.reflow) {
    acc.tierChangeRowCount.reflow += 1;
  }

  for (const t of parsed.reasonTagsFlattened) {
    acc.reasonTagCounts.set(t, (acc.reasonTagCounts.get(t) ?? 0) + 1);
  }
}

export type ShadowAuditRecommendation = {
  readyForApplyToPoolDesign: boolean;
  reasons: string[];
};

export type BuildShadowAuditReportParams = {
  /** Rows read for distribution / averages (capped by CLI --limit). */
  totalShadowRows: number;
  validShadowRows: number;
  invalidShadowRows: number;
  shadowRowsMatchingQueryTotal?: number | null;
  poolsMatchingFilterTotal?: number | null;
  /** totalMatchingShadowRows / pools (global for filter); null when pools=0 */
  shadowCoverageRatio: number | null;
  accumulator: ShadowAuditAccumulator;
};

export function finalizeShadowAuditReport(
  params: BuildShadowAuditReportParams,
): {
  summary: Record<string, unknown>;
  topReasonTags: Array<{ tag: string; count: number }>;
  recommendation: ShadowAuditRecommendation;
} {
  const {
    totalShadowRows,
    validShadowRows,
    invalidShadowRows,
    shadowCoverageRatio,
    shadowRowsMatchingQueryTotal,
    poolsMatchingFilterTotal,
    accumulator: acc,
  } = params;

  const n = validShadowRows;

  const avgChangedSlots = n > 0 ? acc.sumChangedSlots / n : 0;
  const avgCandidatesWithVision = n > 0 ? acc.sumCandidatesWithVision / n : 0;
  const avgCandidatesMissingVision =
    n > 0 ? acc.sumCandidatesMissingVision / n : 0;

  const viewerVisionAvailableRate =
    n > 0 ? acc.viewerVisionAvailableCount / n : 0;
  const fullShuffleRate = n > 0 ? acc.fullShuffleCount / n : 0;

  const tierChangeRate = {
    aesthetic_fit: n > 0 ? acc.tierChangeRowCount.aesthetic_fit / n : 0,
    style_similar: n > 0 ? acc.tierChangeRowCount.style_similar / n : 0,
    reflow: n > 0 ? acc.tierChangeRowCount.reflow / n : 0,
  };

  const topReasonTags = [...acc.reasonTagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([tag, count]) => ({ tag, count }));

  const visionDenom = avgCandidatesWithVision + avgCandidatesMissingVision;
  const missingRatio =
    visionDenom > 0 ? avgCandidatesMissingVision / visionDenom : 1;

  const changed6Rate =
    n > 0 ? (acc.changedSlotsBuckets["6"] ?? 0) / n : 0;

  const recommendation = evaluateReadyForApplyToPoolDesign({
    shadowCoverageRatio,
    poolsMatchingFilterTotal: poolsMatchingFilterTotal ?? null,
    validShadowRows,
    avgCandidatesMissingVision,
    missingRatio,
    avgChangedSlots,
    changedSlots6Rate: changed6Rate,
    viewerVisionAvailableRate,
    tierChangeRate,
  });

  return {
    summary: {
      totalShadowRows,
      validShadowRows,
      invalidShadowRows,
      shadowCoverageRate: shadowCoverageRatio,
      shadowRowsMatchingQueryTotal:
        shadowRowsMatchingQueryTotal ?? null,
      poolsMatchingFilterTotal: poolsMatchingFilterTotal ?? null,
      avgChangedSlots,
      changedSlotsDistribution: { ...acc.changedSlotsBuckets },
      changedTiersFrequency: {
        aesthetic_fit: acc.tierChangeRowCount.aesthetic_fit,
        style_similar: acc.tierChangeRowCount.style_similar,
        reflow: acc.tierChangeRowCount.reflow,
      },
      tierChangeRate,
      avgCandidatesWithVision,
      avgCandidatesMissingVision,
      viewerVisionAvailableRate,
      applyToPoolIgnoredCount: acc.applyToPoolIgnoredCount,
      fullShuffleRate,
    },
    topReasonTags,
    recommendation,
  };
}

type ThresholdInputs = {
  shadowCoverageRatio: number | null;
  poolsMatchingFilterTotal: number | null;
  validShadowRows: number;
  avgCandidatesMissingVision: number;
  missingRatio: number;
  avgChangedSlots: number;
  changedSlots6Rate: number;
  viewerVisionAvailableRate: number;
  tierChangeRate: {
    aesthetic_fit: number;
    style_similar: number;
    reflow: number;
  };
};

export function evaluateReadyForApplyToPoolDesign(
  inputs: ThresholdInputs,
): ShadowAuditRecommendation {
  const reasons: string[] = [];
  const {
    shadowCoverageRatio,
    poolsMatchingFilterTotal,
    validShadowRows,
    avgCandidatesMissingVision,
    missingRatio,
    avgChangedSlots,
    changedSlots6Rate,
    viewerVisionAvailableRate,
    tierChangeRate,
  } = inputs;

  if (poolsMatchingFilterTotal !== null && poolsMatchingFilterTotal > 0) {
    if (shadowCoverageRatio !== null && shadowCoverageRatio < 0.8) {
      reasons.push(
        `shadowCoverageRate ${shadowCoverageRatio.toFixed(3)} < 0.8 (shadowRowsMatchingTotal / pools matching filter)`,
      );
    }
  } else {
    reasons.push(
      "cannot assess shadowCoverageRate — zero pools matched filter",
    );
  }

  if (validShadowRows < 50) {
    reasons.push(
      `validShadowRows ${validShadowRows} < 50 — sample too small`,
    );
  }

  const missingOkBand =
    avgCandidatesMissingVision < 1.2 || missingRatio < 0.2;
  if (!missingOkBand) {
    reasons.push(
      `vision gap: avgCandidatesMissingVision=${avgCandidatesMissingVision.toFixed(2)} missingRatio=${missingRatio.toFixed(3)} (need avg<1.2 or ratio<0.2)`,
    );
  }

  if (viewerVisionAvailableRate < 0.6) {
    reasons.push(
      `viewerVisionAvailableRate ${viewerVisionAvailableRate.toFixed(3)} < 0.6`,
    );
  }

  if (!(avgChangedSlots >= 0.3 && avgChangedSlots <= 2.5)) {
    reasons.push(
      `avgChangedSlots ${avgChangedSlots.toFixed(3)} outside [0.3, 2.5]`,
    );
  }

  if (changedSlots6Rate >= 0.01) {
    reasons.push(
      `changedSlots=6 rate ${changedSlots6Rate.toFixed(4)} >= 0.01`,
    );
  }

  if (tierChangeRate.reflow >= 0.15) {
    reasons.push(
      `reflow tierChangeRate ${tierChangeRate.reflow.toFixed(3)} >= 0.15`,
    );
  }

  if (tierChangeRate.aesthetic_fit >= 0.4) {
    reasons.push(
      `aesthetic_fit tierChangeRate ${tierChangeRate.aesthetic_fit.toFixed(3)} >= 0.4`,
    );
  }

  if (tierChangeRate.style_similar >= 0.5) {
    reasons.push(
      `style_similar tierChangeRate ${tierChangeRate.style_similar.toFixed(3)} >= 0.5`,
    );
  }

  return {
    readyForApplyToPoolDesign: reasons.length === 0,
    reasons:
      reasons.length > 0
        ? reasons
        : [
            "all P7.5-r4-a threshold checks passed — proceed to P7.5-r5 design review",
          ],
  };
}
