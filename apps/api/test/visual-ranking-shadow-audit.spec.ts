import {
  createShadowAuditAccumulator,
  evaluateReadyForApplyToPoolDesign,
  finalizeShadowAuditReport,
  ingestParsedShadow,
  parseVisualRankingShadowPayloadSafe,
} from "../src/modules/onboarding/vision/visual-ranking-shadow-audit";
import {
  VISUAL_RANKING_SHADOW_SOURCE_VERSION,
  type VisualRankingShadowTier,
  type VisualRankingShadowV1,
} from "../src/modules/onboarding/vision/visual-ranking-shadow.types";
import { parseP75R4ShadowAuditCliArgs } from "../src/dev-cli/p75-r4-visual-ranking-shadow-audit-cli-args";

function mkSlot(
  rank: number,
  tier: VisualRankingShadowTier,
  wouldChange: boolean,
  reasonTags: string[],
): VisualRankingShadowV1["slots"][number] {
  return {
    rankInPool: rank,
    tier,
    baselineCandidateUserId: `baseline-${rank}-secret`,
    shadowCandidateUserId: wouldChange ? `shadow-${rank}-secret` : `baseline-${rank}-secret`,
    wouldChange,
    baselineScore: 0.4,
    shadowScore: wouldChange ? 0.8 : 0.4,
    reason: wouldChange ? "aesthetic_tag_overlap" : "vision_fallback_baseline",
    reasonTags,
  };
}

/** six slots consistent with onboarding 3+2+1 */
function mkSix(
  changeranks: readonly number[],
  reasonByRank?: Record<number, string[]>,
): VisualRankingShadowV1["slots"] {
  const defaults: VisualRankingShadowTier[] = [
    "aesthetic_fit",
    "aesthetic_fit",
    "aesthetic_fit",
    "style_similar",
    "style_similar",
    "reflow",
  ];
  return [1, 2, 3, 4, 5, 6].map((r) =>
    mkSlot(
      r,
      defaults[r - 1]!,
      changeranks.includes(r),
      reasonByRank?.[r] ?? (changeranks.includes(r) ? ["清爽自然"] : []),
    ),
  );
}

function mkPayload(parts: {
  slots: VisualRankingShadowV1["slots"];
  summary: Partial<VisualRankingShadowV1["summary"]> &
    Pick<VisualRankingShadowV1["summary"], "changedSlots">;
}): VisualRankingShadowV1 {
  const slotsChanged = parts.slots.filter((s) => s.wouldChange);
  const changedTiersFromSlots = [...new Set(slotsChanged.map((s) => s.tier))];
  const changedTiers =
    parts.summary.changedTiers ?? changedTiersFromSlots;

  return {
    schemaVersion: "visual-ranking-shadow-v1",
    sourceVersion: VISUAL_RANKING_SHADOW_SOURCE_VERSION,
    generatedAt: new Date().toISOString(),
    viewerUserId: "viewer-secret-id",
    poolId: "pool-secret-id",
    baselineSourceVersion: "onboarding-photo-preview-v1",
    shadowSourceVersion: "onboarding-photo-preview-v1-vision-shadow",
    appliedToPool: false,
    slots: parts.slots,
    summary: {
      changedSlots: parts.summary.changedSlots,
      changedTiers,
      candidatesWithVision: parts.summary.candidatesWithVision ?? 5,
      candidatesMissingVision: parts.summary.candidatesMissingVision ?? 1,
      viewerVisionAvailable:
        parts.summary.viewerVisionAvailable === undefined
          ? true
          : parts.summary.viewerVisionAvailable,
      ...(parts.summary.applyToPoolIgnored !== undefined
        ? { applyToPoolIgnored: parts.summary.applyToPoolIgnored }
        : {}),
    },
  };
}

describe("parseVisualRankingShadowPayloadSafe", () => {
  it("parses valid payload", () => {
    const pl = mkPayload({
      slots: mkSix([2]),
      summary: { changedSlots: 1 },
    });
    const p = parseVisualRankingShadowPayloadSafe(pl as unknown as object);
    expect(p?.changedSlots).toBe(1);
    expect(p?.reasonTagsFlattened).toContain("清爽自然");
  });

  it("parses valid payload with summary.applyDryRun (P7.5-r5-b)", () => {
    const base = mkPayload({
      slots: mkSix([]),
      summary: { changedSlots: 0 },
    });
    const pl = {
      ...base,
      summary: {
        ...base.summary,
        applyDryRun: {
          evaluated: true,
          eligible: false,
          reason: "env_disabled",
          applySourceVersion: "onboarding-photo-preview-v2-vision",
          appliedToPool: false,
        },
      },
    };
    expect(parseVisualRankingShadowPayloadSafe(pl as unknown as object)).not.toBeNull();
  });

  it("rejects appliedToPool true", () => {
    const bad = { ...mkPayload({ slots: mkSix([]), summary: { changedSlots: 0 } }), appliedToPool: true };
    expect(parseVisualRankingShadowPayloadSafe(bad)).toBeNull();
  });

  it("rejects changedSlots vs slots inconsistent", () => {
    expect(
      parseVisualRankingShadowPayloadSafe(
        mkPayload({ slots: mkSix([]), summary: { changedSlots: 2 } }),
      ),
    ).toBeNull();
  });

  it("invalid does not throw", () => {
    expect(parseVisualRankingShadowPayloadSafe(null)).toBeNull();
  });
});

describe("visual ranking shadow audit aggregation", () => {
  it("changedSlotsDistribution, changedTiersFrequency, reason tags", () => {
    const a = mkPayload({
      slots: mkSix([2, 4], { 2: ["生活感"], 4: ["生活感"] }),
      summary: { changedSlots: 2 },
    });
    const b = mkPayload({
      slots: mkSix([1], {}),
      summary: { changedSlots: 1 },
    });
    const pA = parseVisualRankingShadowPayloadSafe(a)!;
    const pB = parseVisualRankingShadowPayloadSafe(b)!;

    const acc = createShadowAuditAccumulator();
    ingestParsedShadow(acc, pA);
    ingestParsedShadow(acc, pB);

    const rep = finalizeShadowAuditReport({
      totalShadowRows: 2,
      validShadowRows: 2,
      invalidShadowRows: 0,
      shadowRowsMatchingQueryTotal: 2,
      poolsMatchingFilterTotal: 2,
      shadowCoverageRatio: 1,
      accumulator: acc,
    });

    const dist = rep.summary.changedSlotsDistribution as Record<string, number>;
    expect(dist["1"]).toBe(1);
    expect(dist["2"]).toBe(1);

    const freq = rep.summary.changedTiersFrequency as Record<string, number>;
    expect(freq.aesthetic_fit).toBe(2); // slot2 + slot1
    expect(freq.style_similar).toBeGreaterThanOrEqual(1);

    expect(
      JSON.stringify(rep).includes("viewer-secret-id") ||
        JSON.stringify(rep).includes("baseline-1-secret"),
    ).toBe(false);
  });

  it("prefers heavier reason tag buckets", () => {
    const pl = mkPayload({
      slots: mkSix([1], { 1: ["heavy", "heavy", "heavy", "light"] }),
      summary: {
        changedSlots: 1,
        changedTiers: ["aesthetic_fit"],
      },
    });
    const acc = createShadowAuditAccumulator();
    ingestParsedShadow(acc, parseVisualRankingShadowPayloadSafe(pl)!);
    const rep = finalizeShadowAuditReport({
      totalShadowRows: 1,
      validShadowRows: 1,
      invalidShadowRows: 0,
      shadowRowsMatchingQueryTotal: 1,
      poolsMatchingFilterTotal: 1,
      shadowCoverageRatio: 1,
      accumulator: acc,
    });
    expect(rep.topReasonTags[0]).toEqual({ tag: "heavy", count: 3 });
    expect(rep.topReasonTags.some((x) => x.tag === "light")).toBe(true);
  });
});

describe("evaluateReadyForApplyToPoolDesign", () => {
  const ok = (): Parameters<typeof evaluateReadyForApplyToPoolDesign>[0] => ({
    shadowCoverageRatio: 0.95,
    poolsMatchingFilterTotal: 200,
    validShadowRows: 80,
    avgCandidatesMissingVision: 1,
    missingRatio: 0.08,
    avgChangedSlots: 1,
    changedSlots6Rate: 0,
    viewerVisionAvailableRate: 0.65,
    tierChangeRate: {
      aesthetic_fit: 0.25,
      style_similar: 0.3,
      reflow: 0.06,
    },
  });

  it("ready when thresholds pass", () => {
    expect(evaluateReadyForApplyToPoolDesign(ok()).readyForApplyToPoolDesign).toBe(
      true,
    );
  });

  it("fails viewer vision threshold", () => {
    expect(
      evaluateReadyForApplyToPoolDesign({
        ...ok(),
        viewerVisionAvailableRate: 0.59,
      }).readyForApplyToPoolDesign,
    ).toBe(false);
  });

  it("fails zero pools matched", () => {
    expect(
      evaluateReadyForApplyToPoolDesign({
        ...ok(),
        poolsMatchingFilterTotal: 0,
        shadowCoverageRatio: null,
      }).readyForApplyToPoolDesign,
    ).toBe(false);
  });
});

describe("parseP75R4ShadowAuditCliArgs", () => {
  it("defaults", () => {
    const a = parseP75R4ShadowAuditCliArgs([]);
    expect(a.limit).toBe(100);
    expect(a.jsonl).toBe(false);
    expect(a.shadowType).toBe("visual_ranking_shadow");
  });

  it("since until and jsonl=false", () => {
    const a = parseP75R4ShadowAuditCliArgs([
      "--since=2026-05-01",
      "--until=2026-05-16",
      "--jsonl=false",
    ]);
    expect(a.since?.getUTCFullYear()).toBe(2026);
    expect(a.since?.getUTCMonth()).toBe(4);
    expect(a.until?.getUTCMonth()).toBe(4);
    expect(a.jsonl).toBe(false);
  });
});
