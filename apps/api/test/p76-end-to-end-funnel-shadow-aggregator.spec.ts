import {
  END_TO_END_FUNNEL_SHADOW_SCHEMA_VERSION,
  END_TO_END_FUNNEL_SHADOW_SOURCE_VERSION,
  type P76EndToEndFunnelInputV1,
} from "../src/modules/matching/p76-end-to-end-funnel-shadow.types";
import { buildP76EndToEndFunnelShadowAuditV1 } from "../src/modules/matching/p76-end-to-end-funnel-shadow-aggregator";

const VIEWER = "cmo7ksq8s00006znosryc9k0n";
const WINNER = "cmfemn00100016z64seed0001";
const RUNNER_UP = "cmfemn003000506z64seed0003";

const STAGE1_SELECTED = [
  "cmfemn002000306z64seed0002",
  RUNNER_UP,
  "cmr4hm001016z64demo00m05a",
  WINNER,
  "cmr4hf000716z64demo00f04a",
  "cmr4hf000916z64demo00f05a",
];

const SENSITIVE_KEYS = [
  "dimensionBranchChatHints",
  "effectiveProfileChatOverlayV1",
  "rawProfile",
  "vendorRaw",
  "detectionScoreJson",
  "imageUrl",
];

function baseInput(
  overrides: Partial<P76EndToEndFunnelInputV1> = {},
): P76EndToEndFunnelInputV1 {
  return {
    viewerUserId: VIEWER,
    sourcePoolType: "onboarding_gated_cohort",
    generatedAt: "2026-05-16T16:00:00.000Z",
    stage1PhotoVisual: {
      sourceVersion: "p7.6-r3-photovisual-first-pool-shadow-v1",
      selectedCandidateIds: [...STAGE1_SELECTED],
      topCandidatesSummary: [
        {
          candidateUserId: RUNNER_UP,
          mutualPhotoVisualFit: 0.225,
          rank: 1,
        },
        {
          candidateUserId: "cmfemn002000306z64seed0002",
          mutualPhotoVisualFit: 0.225,
          rank: 2,
        },
        {
          candidateUserId: WINNER,
          mutualPhotoVisualFit: 0.2,
          rank: 3,
        },
      ],
    },
    stage2TwentyD: {
      sourceVersion: "p7.6-r4a-20d-bidirectional-ranking-shadow-v1",
      top2CandidateIds: [WINNER, RUNNER_UP],
      selectedBy20DOnlyCandidateId: WINNER,
      rankedCandidatesSummary: [
        {
          candidateUserId: WINNER,
          mutual20DFit: 0.85,
          rank: 1,
        },
        {
          candidateUserId: RUNNER_UP,
          mutual20DFit: 0.8,
          rank: 2,
        },
      ],
    },
    stage3Rrm: {
      sourceVersion: "p7.6-r5a-rrm-top2-final-selector-shadow-v1",
      selectedByRrmCandidateId: WINNER,
      rankedCandidatesSummary: [
        {
          candidateUserId: WINNER,
          mutualRrmFit: 0.8346,
          riskFlagCount: 1,
          rank: 1,
        },
        {
          candidateUserId: RUNNER_UP,
          mutualRrmFit: 0.8234,
          riskFlagCount: 1,
          rank: 2,
        },
      ],
      reasonSummary: "stage3_rrm_selected_matches_20d_winner",
    },
    legacy: {
      matchResultCandidateUserId: WINNER,
      matchResultFinalScore: 0.72,
      displayCandidateUserId: WINNER,
      displaySourceType: "match_result",
      legacyPreviewPoolCandidateIds: [...STAGE1_SELECTED],
      workerWinnerCandidateUserId: WINNER,
      m6RrmTop2CandidateIds: [WINNER, RUNNER_UP],
      m6RrmSelectedCandidateId: WINNER,
    },
    ...overrides,
  };
}

function collectKeys(value: unknown, keys: Set<string>): void {
  if (value == null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return;
  }
  for (const [k, v] of Object.entries(value)) {
    keys.add(k);
    collectKeys(v, keys);
  }
}

describe("p76 end-to-end funnel shadow aggregator", () => {
  it("aggregates Stage1/2/3 with correct schema versions", () => {
    const audit = buildP76EndToEndFunnelShadowAuditV1(baseInput());

    expect(audit.schemaVersion).toBe(END_TO_END_FUNNEL_SHADOW_SCHEMA_VERSION);
    expect(audit.sourceVersion).toBe(END_TO_END_FUNNEL_SHADOW_SOURCE_VERSION);
    expect(audit.viewerUserId).toBe(VIEWER);
    expect(audit.stage1PhotoVisual.selectedCount).toBe(6);
    expect(audit.stage1PhotoVisual.selectedCandidateIds).toEqual(
      STAGE1_SELECTED,
    );
    expect(audit.stage2TwentyD.top2CandidateIds).toEqual([WINNER, RUNNER_UP]);
    expect(audit.stage3Rrm.selectedByRrmCandidateId).toBe(WINNER);
  });

  it("finalShadow.selectedCandidateId equals stage3 RRM winner", () => {
    const audit = buildP76EndToEndFunnelShadowAuditV1(baseInput());
    expect(audit.finalShadow.selectedCandidateId).toBe(WINNER);
  });

  it("legacyComparison fields and wouldChange flags for signoff fixture", () => {
    const audit = buildP76EndToEndFunnelShadowAuditV1(baseInput());

    expect(audit.legacyComparison.matchResultCandidateUserId).toBe(WINNER);
    expect(audit.legacyComparison.workerWinnerCandidateUserId).toBe(WINNER);
    expect(audit.legacyComparison.m6RrmTop2CandidateIds).toEqual([
      WINNER,
      RUNNER_UP,
    ]);
    expect(audit.stage3Rrm.wouldChange20DWinner).toBe(false);
    expect(audit.legacyComparison.wouldChangeLegacyMatchResult).toBe(false);
    expect(audit.legacyComparison.wouldChangeDisplayCandidate).toBe(false);
    expect(audit.legacyComparison.wouldChangeWorkerWinner).toBe(false);
    expect(audit.legacyComparison.wouldChangeM6Top2).toBe(false);
    expect(audit.legacyComparison.differenceStage).toBe("no_change");
  });

  it("all applied flags are false", () => {
    const audit = buildP76EndToEndFunnelShadowAuditV1(baseInput());
    expect(audit.finalShadow).toEqual({
      selectedCandidateId: WINNER,
      applied: false,
      appliedToPool: false,
      appliedToFinalScore: false,
      appliedToMatchResult: false,
      appliedToWorkerRanking: false,
      appliedToDisplay: false,
    });
  });

  it("preserves stage summaries", () => {
    const input = baseInput();
    const audit = buildP76EndToEndFunnelShadowAuditV1(input);

    expect(audit.stage1PhotoVisual.topCandidatesSummary).toEqual(
      input.stage1PhotoVisual.topCandidatesSummary,
    );
    expect(audit.stage2TwentyD.rankedCandidatesSummary).toEqual(
      input.stage2TwentyD.rankedCandidatesSummary,
    );
    expect(audit.stage3Rrm.rankedCandidatesSummary).toEqual(
      input.stage3Rrm.rankedCandidatesSummary,
    );
    expect(audit.stage3Rrm.reasonSummary).toBe(
      "stage3_rrm_selected_matches_20d_winner",
    );
  });

  it("missing optional legacy fields does not throw", () => {
    expect(() =>
      buildP76EndToEndFunnelShadowAuditV1(
        baseInput({ legacy: undefined }),
      ),
    ).not.toThrow();

    const audit = buildP76EndToEndFunnelShadowAuditV1(
      baseInput({ legacy: undefined }),
    );
    expect(audit.legacyComparison.matchResultCandidateUserId).toBeNull();
    expect(audit.legacyComparison.differenceStage).toBe("unknown");
    expect(audit.legacyComparison.comparisonReasonSummary).toContain(
      "legacy_missing",
    );
  });

  it("empty stage1 selectedCandidateIds does not throw", () => {
    const audit = buildP76EndToEndFunnelShadowAuditV1(
      baseInput({
        stage1PhotoVisual: {
          ...baseInput().stage1PhotoVisual,
          selectedCandidateIds: [],
          topCandidatesSummary: [],
        },
      }),
    );
    expect(audit.stage1PhotoVisual.selectedCount).toBe(0);
    expect(audit.finalShadow.selectedCandidateId).toBe(WINNER);
  });

  it("missing stage3 selected falls back to stage2 20D winner", () => {
    const audit = buildP76EndToEndFunnelShadowAuditV1(
      baseInput({
        stage3Rrm: {
          ...baseInput().stage3Rrm,
          selectedByRrmCandidateId: null,
        },
      }),
    );
    expect(audit.finalShadow.selectedCandidateId).toBe(WINNER);
    expect(audit.legacyComparison.comparisonReasonSummary).toContain(
      "stage3_missing",
    );
  });

  it("does not emit raw profile / detectionScoreJson / imageUrl keys", () => {
    const audit = buildP76EndToEndFunnelShadowAuditV1(baseInput());
    const keys = new Set<string>();
    collectKeys(audit, keys);
    for (const sensitive of SENSITIVE_KEYS) {
      expect(keys.has(sensitive)).toBe(false);
    }
  });

  it("rejects unsupported sourcePoolType", () => {
    expect(() =>
      buildP76EndToEndFunnelShadowAuditV1(
        baseInput({
          sourcePoolType:
            "other" as P76EndToEndFunnelInputV1["sourcePoolType"],
        }),
      ),
    ).toThrow(/only supports sourcePoolType/);
  });
});
