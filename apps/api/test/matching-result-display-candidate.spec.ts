import type { MatchResult } from "@peima/database";
import { RRM_SIM_SOURCE_VERSION } from "../src/modules/ai-simulation-v1/rrm-sim.constants";
import { RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY } from "../src/modules/matching/matching-rrm-sim-readonly-summary";
import {
  applyResolvedScoreProjection,
  buildResolvedMatchProjection,
  resolveMatchResultDisplay,
  tryResolveRrmBoundedDecisionReadLayerOverride,
} from "../src/modules/matching/matching-result-display";
import { MATCH_RESULT_RRM_TOP2_DISPLAY_META_SOURCE_TYPE } from "../src/modules/matching/rrm-top2-display-meta.types";

/** Sync with `packages/shared/types/match-p1.ts` (M6 tests only; avoid runtime `@peima/shared` root import). */
const MATCH_INSIGHTS_RRM_V2_TOP2_SELECTOR_SHADOW_VERSION =
  "m6.0-rrm-v2-top2-selector-shadow-v1" as const;

function mr(over: Partial<MatchResult> = {}): MatchResult {
  return {
    id: "mr-1",
    userId: "viewer-1",
    candidateUserId: "cand-static",
    batchId: "batch-1",
    finalScore: 0.82,
    reasonSummary: "ok",
    status: "active",
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    ...over,
  } as MatchResult;
}

function metaV1(over: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    sourceVersion: "m3.8-pairwise-finalize-v1",
    sourceType: "static_fallback",
    mode: "shadow",
    pairwiseJobId: "job-1",
    pairwiseProposalRecommendation: "pairwise_unavailable",
    staticTop1CandidateUserId: "cand-static",
    pairwiseWinnerCandidateUserId: null,
    selectedCandidateUserId: "cand-static",
    fallbackReason: "x",
    wouldChangeStaticResult: false,
    frozen: true,
    frozenAt: "2026-05-01T12:00:00.000Z",
    appliedToFinalScore: false,
    appliedToWorkerRanking: false,
    generatedAt: "2026-05-01T12:00:00.000Z",
    ...over,
  };
}

describe("resolveMatchResultDisplay (M3.8-M13)", () => {
  const prev = {
    ENABLED: process.env.PAIRWISE_FINAL_MATCH_ENABLED,
    MODE: process.env.PAIRWISE_FINAL_MATCH_MODE,
    RRM_TOP2: process.env.PEIMA_M5_RRM_TOP2_ENABLED,
    M6_RRM_V2_DISPLAY: process.env.PEIMA_M6_RRM_V2_SELECTOR_DISPLAY_ENABLED,
    M6_RRM_BOUNDED_READ_LAYER: process.env.PEIMA_M6_RRM_BOUNDED_DECISION_ENABLED,
  };

  afterEach(() => {
    process.env.PAIRWISE_FINAL_MATCH_ENABLED = prev.ENABLED;
    process.env.PAIRWISE_FINAL_MATCH_MODE = prev.MODE;
    if (prev.RRM_TOP2 === undefined) delete process.env.PEIMA_M5_RRM_TOP2_ENABLED;
    else process.env.PEIMA_M5_RRM_TOP2_ENABLED = prev.RRM_TOP2;
    if (prev.M6_RRM_V2_DISPLAY === undefined) delete process.env.PEIMA_M6_RRM_V2_SELECTOR_DISPLAY_ENABLED;
    else process.env.PEIMA_M6_RRM_V2_SELECTOR_DISPLAY_ENABLED = prev.M6_RRM_V2_DISPLAY;
    if (prev.M6_RRM_BOUNDED_READ_LAYER === undefined) delete process.env.PEIMA_M6_RRM_BOUNDED_DECISION_ENABLED;
    else process.env.PEIMA_M6_RRM_BOUNDED_DECISION_ENABLED = prev.M6_RRM_BOUNDED_READ_LAYER;
  });

  function rrmSimSummaryPayload(winner: string, baseline: string) {
    return {
      schemaVersion: 1,
      sourceType: "rrm_sim_readonly_summary",
      sourceVersion: RRM_SIM_SOURCE_VERSION,
      candidateUserId: baseline,
      winnerUserId: winner,
      proposalCandidateUserId: winner,
      scenarioKey: null,
      suggestedAction: "maintain",
      progressionWindow: null,
      simulatedRhythmScore: 1,
      recommendation: "ok",
      confidenceBucket: "high",
      fallbackUsed: false,
      unavailableReason: null,
      cautionFlags: [],
      generatedAt: "2026-05-03T00:00:00.000Z",
      frozenAt: null,
    };
  }

  function rrmDisplayMetaJson(over: Record<string, unknown> = {}) {
    return {
      schemaVersion: 1,
      sourceType: MATCH_RESULT_RRM_TOP2_DISPLAY_META_SOURCE_TYPE,
      sourceVersion: "m5.3-rrm-top2-enabled-display-v1",
      baselineCandidateUserId: "cand-static",
      previousDisplayCandidateUserId: "cand-static",
      newDisplayCandidateUserId: "cand-winner",
      decisionRule: "rrm_top2_winner_guardrails_pass",
      top2Fingerprint: "fp_rrm_1",
      appliedToFinalScore: false,
      appliedToWorkerRanking: false,
      rollbackAvailable: true,
      guardrails: {
        status: "pass",
        blockReasons: [],
        cautionReasons: [],
        sourceVersion: "m5-local-fixture-guardrails-v1",
      },
      ...over,
    };
  }

  function rrmDisplayMetaJsonWithoutGuardrails(): Record<string, unknown> {
    const o = rrmDisplayMetaJson();
    const { guardrails: _g, ...rest } = o;
    return rest;
  }

  function mockPrisma(opts: {
    finalizeRows?: { frozen: boolean; meta: unknown }[];
    userIds?: Set<string>;
    /** Users that have a `userProfile` row (defaults to same set as `userIds`). Pass `new Set()` to simulate missing profiles. */
    profileUserIds?: Set<string>;
    rrmTop2Row?: { frozen: boolean; meta: unknown; top2Fingerprint: string | null } | null;
  }) {
    const userIds = opts.userIds ?? new Set(["cand-static", "cand-winner"]);
    const profileUserIds = opts.profileUserIds ?? userIds;
    return {
      pairwisePoolFinalizeMeta: {
        findMany: jest.fn(async () => opts.finalizeRows ?? []),
      },
      matchResultRrmTop2DisplayMeta: {
        findUnique: jest.fn(async () => opts.rrmTop2Row ?? null),
      },
      user: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
          userIds.has(where.id) ? { id: where.id } : null,
        ),
      },
      userProfile: {
        findUnique: jest.fn(async ({ where }: { where: { userId: string } }) =>
          profileUserIds.has(where.userId) ? { userId: where.userId } : null,
        ),
      },
    } as unknown as import("../src/common/prisma/prisma.service").PrismaService;
  }

  it("flag off → displayCandidateUserId = original", async () => {
    process.env.PAIRWISE_FINAL_MATCH_ENABLED = "0";
    process.env.PAIRWISE_FINAL_MATCH_MODE = "enabled";
    const prisma = mockPrisma({
      finalizeRows: [{ frozen: true, meta: metaV1({ selectedCandidateUserId: "cand-winner", mode: "enabled" }) }],
    });
    const r = await resolveMatchResultDisplay(prisma, mr());
    expect(r.displayCandidateUserId).toBe("cand-static");
    expect(r.displaySourceType).toBe("match_result_original");
    expect(r.finalMatchDecisionMeta).toBeNull();
  });

  it("ENABLED=1 but mode proposal_only → original", async () => {
    process.env.PAIRWISE_FINAL_MATCH_ENABLED = "1";
    process.env.PAIRWISE_FINAL_MATCH_MODE = "proposal_only";
    const prisma = mockPrisma({
      finalizeRows: [{ frozen: true, meta: metaV1({ mode: "enabled", selectedCandidateUserId: "cand-winner" }) }],
    });
    const r = await resolveMatchResultDisplay(prisma, mr());
    expect(r.displayCandidateUserId).toBe("cand-static");
    expect(r.displaySourceType).toBe("match_result_original");
  });

  it("ENABLED=1 but mode shadow → original", async () => {
    process.env.PAIRWISE_FINAL_MATCH_ENABLED = "1";
    process.env.PAIRWISE_FINAL_MATCH_MODE = "shadow";
    const prisma = mockPrisma({
      finalizeRows: [{ frozen: true, meta: metaV1({ mode: "enabled", selectedCandidateUserId: "cand-winner" }) }],
    });
    const r = await resolveMatchResultDisplay(prisma, mr());
    expect(r.displayCandidateUserId).toBe("cand-static");
    expect(r.displaySourceType).toBe("match_result_original");
  });

  it("enabled + frozen pairwise_final meta → display = selected (winner)", async () => {
    process.env.PAIRWISE_FINAL_MATCH_ENABLED = "1";
    process.env.PAIRWISE_FINAL_MATCH_MODE = "enabled";
    const prisma = mockPrisma({
      finalizeRows: [
        {
          frozen: true,
          meta: metaV1({
            mode: "enabled",
            sourceType: "pairwise_final",
            pairwiseProposalRecommendation: "pairwise_winner_eligible",
            pairwiseWinnerCandidateUserId: "cand-winner",
            selectedCandidateUserId: "cand-winner",
            staticTop1CandidateUserId: "cand-static",
          }),
        },
      ],
    });
    const r = await resolveMatchResultDisplay(prisma, mr());
    expect(r.displayCandidateUserId).toBe("cand-winner");
    expect(r.displaySourceType).toBe("pairwise_final");
    expect(r.finalMatchDecisionMeta?.selectedCandidateUserId).toBe("cand-winner");
    const leaked = JSON.stringify(r.finalMatchDecisionMeta);
    expect(leaked).not.toMatch(/strongRisk|decisionScore|dimensions/i);
  });

  it("enabled + static_fallback meta → display staticTop1", async () => {
    process.env.PAIRWISE_FINAL_MATCH_ENABLED = "1";
    process.env.PAIRWISE_FINAL_MATCH_MODE = "enabled";
    const prisma = mockPrisma({
      finalizeRows: [
        {
          frozen: true,
          meta: metaV1({
            mode: "enabled",
            sourceType: "static_fallback",
            pairwiseProposalRecommendation: "pairwise_unavailable",
            selectedCandidateUserId: "cand-static",
          }),
        },
      ],
    });
    const r = await resolveMatchResultDisplay(prisma, mr());
    expect(r.displayCandidateUserId).toBe("cand-static");
    expect(r.displaySourceType).toBe("static_fallback");
  });

  it("no meta rows → original", async () => {
    process.env.PAIRWISE_FINAL_MATCH_ENABLED = "1";
    process.env.PAIRWISE_FINAL_MATCH_MODE = "enabled";
    const prisma = mockPrisma({ finalizeRows: [] });
    const r = await resolveMatchResultDisplay(prisma, mr());
    expect(r.displayCandidateUserId).toBe("cand-static");
    expect(r.displaySourceType).toBe("match_result_original");
  });

  it("unsafe pool binding (staticTop1 mismatch) → original", async () => {
    process.env.PAIRWISE_FINAL_MATCH_ENABLED = "1";
    process.env.PAIRWISE_FINAL_MATCH_MODE = "enabled";
    const prisma = mockPrisma({
      finalizeRows: [
        {
          frozen: true,
          meta: metaV1({
            mode: "enabled",
            sourceType: "pairwise_final",
            staticTop1CandidateUserId: "other-pool-top1",
            selectedCandidateUserId: "cand-winner",
            pairwiseWinnerCandidateUserId: "cand-winner",
          }),
        },
      ],
    });
    const r = await resolveMatchResultDisplay(prisma, mr());
    expect(r.displayCandidateUserId).toBe("cand-static");
    expect(r.displaySourceType).toBe("match_result_original");
  });

  it("selected user missing → skip row, original", async () => {
    process.env.PAIRWISE_FINAL_MATCH_ENABLED = "1";
    process.env.PAIRWISE_FINAL_MATCH_MODE = "enabled";
    const prisma = mockPrisma({
      finalizeRows: [
        {
          frozen: true,
          meta: metaV1({
            mode: "enabled",
            sourceType: "pairwise_final",
            staticTop1CandidateUserId: "cand-static",
            selectedCandidateUserId: "ghost-user",
            pairwiseWinnerCandidateUserId: "ghost-user",
          }),
        },
      ],
      userIds: new Set(["cand-static"]),
    });
    const r = await resolveMatchResultDisplay(prisma, mr());
    expect(r.displayCandidateUserId).toBe("cand-static");
    expect(r.displaySourceType).toBe("match_result_original");
  });

  it("appliedToFinalScore true → rejected parse, original", async () => {
    process.env.PAIRWISE_FINAL_MATCH_ENABLED = "1";
    process.env.PAIRWISE_FINAL_MATCH_MODE = "enabled";
    const prisma = mockPrisma({
      finalizeRows: [
        {
          frozen: true,
          meta: metaV1({
            mode: "enabled",
            appliedToFinalScore: true,
            selectedCandidateUserId: "cand-winner",
            pairwiseWinnerCandidateUserId: "cand-winner",
          }),
        },
      ],
    });
    const r = await resolveMatchResultDisplay(prisma, mr());
    expect(r.displayCandidateUserId).toBe("cand-static");
    expect(r.displaySourceType).toBe("match_result_original");
  });

  describe("M5.3-C2 RRM Top2 branch", () => {
    it("RRM env off → ignores sidecar even if present (pairwise path)", async () => {
      delete process.env.PEIMA_M5_RRM_TOP2_ENABLED;
      process.env.PAIRWISE_FINAL_MATCH_ENABLED = "1";
      process.env.PAIRWISE_FINAL_MATCH_MODE = "enabled";
      const prisma = mockPrisma({
        rrmTop2Row: { frozen: true, meta: rrmDisplayMetaJson(), top2Fingerprint: "fp_rrm_1" },
        finalizeRows: [
          {
            frozen: true,
            meta: metaV1({
              mode: "enabled",
              sourceType: "pairwise_final",
              pairwiseProposalRecommendation: "pairwise_winner_eligible",
              pairwiseWinnerCandidateUserId: "cand-winner",
              selectedCandidateUserId: "cand-winner",
              staticTop1CandidateUserId: "cand-static",
            }),
          },
        ],
      });
      const r = await resolveMatchResultDisplay(
        prisma,
        mr({
          matchInsights: {
            [RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY]: rrmSimSummaryPayload("cand-winner", "cand-static"),
          },
        } as Partial<MatchResult>),
      );
      expect(r.displayCandidateUserId).toBe("cand-winner");
      expect(r.displaySourceType).toBe("pairwise_final");
    });

    it("PEIMA_M5_RRM_TOP2_ENABLED=true (case-insensitive) → same RRM path as 1", async () => {
      process.env.PEIMA_M5_RRM_TOP2_ENABLED = "TRUE";
      process.env.PAIRWISE_FINAL_MATCH_ENABLED = "1";
      process.env.PAIRWISE_FINAL_MATCH_MODE = "enabled";
      const prisma = mockPrisma({
        rrmTop2Row: { frozen: true, meta: rrmDisplayMetaJson(), top2Fingerprint: "fp_rrm_1" },
        finalizeRows: [
          {
            frozen: true,
            meta: metaV1({
              mode: "enabled",
              sourceType: "pairwise_final",
              pairwiseProposalRecommendation: "pairwise_winner_eligible",
              pairwiseWinnerCandidateUserId: "cand-winner",
              selectedCandidateUserId: "cand-winner",
              staticTop1CandidateUserId: "cand-static",
            }),
          },
        ],
      });
      const r = await resolveMatchResultDisplay(
        prisma,
        mr({
          matchInsights: {
            [RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY]: rrmSimSummaryPayload("cand-winner", "cand-static"),
          },
        } as Partial<MatchResult>),
      );
      expect(r.displaySourceType).toBe("rrm_top2_bounded_selector");
    });

    it("PEIMA_M5_RRM_TOP2_ENABLED=0 + valid RRM sidecar → does not return rrm_top2_bounded_selector", async () => {
      process.env.PEIMA_M5_RRM_TOP2_ENABLED = "0";
      process.env.PAIRWISE_FINAL_MATCH_ENABLED = "1";
      process.env.PAIRWISE_FINAL_MATCH_MODE = "enabled";
      const prisma = mockPrisma({
        rrmTop2Row: { frozen: true, meta: rrmDisplayMetaJson(), top2Fingerprint: "fp_rrm_1" },
        finalizeRows: [
          {
            frozen: true,
            meta: metaV1({
              mode: "enabled",
              sourceType: "pairwise_final",
              pairwiseProposalRecommendation: "pairwise_winner_eligible",
              pairwiseWinnerCandidateUserId: "cand-winner",
              selectedCandidateUserId: "cand-winner",
              staticTop1CandidateUserId: "cand-static",
            }),
          },
        ],
      });
      const r = await resolveMatchResultDisplay(
        prisma,
        mr({
          matchInsights: {
            [RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY]: rrmSimSummaryPayload("cand-winner", "cand-static"),
          },
        } as Partial<MatchResult>),
      );
      expect(r.displaySourceType).toBe("pairwise_final");
      expect(r.displaySourceType).not.toBe("rrm_top2_bounded_selector");
    });

    it("RRM env on + eligible → rrm_top2_bounded_selector (beats pairwise)", async () => {
      process.env.PEIMA_M5_RRM_TOP2_ENABLED = "1";
      process.env.PAIRWISE_FINAL_MATCH_ENABLED = "1";
      process.env.PAIRWISE_FINAL_MATCH_MODE = "enabled";
      const prisma = mockPrisma({
        rrmTop2Row: { frozen: true, meta: rrmDisplayMetaJson(), top2Fingerprint: "fp_rrm_1" },
        finalizeRows: [
          {
            frozen: true,
            meta: metaV1({
              mode: "enabled",
              sourceType: "pairwise_final",
              pairwiseProposalRecommendation: "pairwise_winner_eligible",
              pairwiseWinnerCandidateUserId: "cand-winner",
              selectedCandidateUserId: "cand-winner",
              staticTop1CandidateUserId: "cand-static",
            }),
          },
        ],
      });
      const r = await resolveMatchResultDisplay(
        prisma,
        mr({
          matchInsights: {
            [RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY]: rrmSimSummaryPayload("cand-winner", "cand-static"),
          },
        } as Partial<MatchResult>),
      );
      expect(r.displayCandidateUserId).toBe("cand-winner");
      expect(r.displaySourceType).toBe("rrm_top2_bounded_selector");
      /** M5.3-C2.1: RRM 命中不伪造 pairwise meta；见 `resolveMatchResultDisplay` 内联注释。 */
      expect(r.finalMatchDecisionMeta).toBeNull();
    });

    it("RRM hit does not mutate MatchResult.candidateUserId or finalScore on input row", async () => {
      process.env.PEIMA_M5_RRM_TOP2_ENABLED = "yes";
      process.env.PAIRWISE_FINAL_MATCH_ENABLED = "1";
      process.env.PAIRWISE_FINAL_MATCH_MODE = "enabled";
      const prisma = mockPrisma({
        rrmTop2Row: { frozen: true, meta: rrmDisplayMetaJson(), top2Fingerprint: "fp_rrm_1" },
        finalizeRows: [
          {
            frozen: true,
            meta: metaV1({
              mode: "enabled",
              sourceType: "pairwise_final",
              pairwiseProposalRecommendation: "pairwise_winner_eligible",
              pairwiseWinnerCandidateUserId: "cand-winner",
              selectedCandidateUserId: "cand-winner",
              staticTop1CandidateUserId: "cand-static",
            }),
          },
        ],
      });
      const row = mr({
        finalScore: 0.91,
        matchInsights: {
          [RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY]: rrmSimSummaryPayload("cand-winner", "cand-static"),
        },
      } as Partial<MatchResult>);
      const candBefore = row.candidateUserId;
      const scoreBefore = row.finalScore;
      const r = await resolveMatchResultDisplay(prisma, row);
      expect(row.candidateUserId).toBe(candBefore);
      expect(row.finalScore).toBe(scoreBefore);
      expect(r.displayCandidateUserId).toBe("cand-winner");
      expect(r.displaySourceType).toBe("rrm_top2_bounded_selector");
    });

    it("RRM env on but ineligible (guardrails_missing on meta) → falls back to pairwise", async () => {
      process.env.PEIMA_M5_RRM_TOP2_ENABLED = "1";
      process.env.PAIRWISE_FINAL_MATCH_ENABLED = "1";
      process.env.PAIRWISE_FINAL_MATCH_MODE = "enabled";
      const prisma = mockPrisma({
        rrmTop2Row: { frozen: true, meta: rrmDisplayMetaJsonWithoutGuardrails(), top2Fingerprint: "fp_rrm_1" },
        finalizeRows: [
          {
            frozen: true,
            meta: metaV1({
              mode: "enabled",
              sourceType: "pairwise_final",
              pairwiseProposalRecommendation: "pairwise_winner_eligible",
              pairwiseWinnerCandidateUserId: "cand-winner",
              selectedCandidateUserId: "cand-winner",
              staticTop1CandidateUserId: "cand-static",
            }),
          },
        ],
      });
      const r = await resolveMatchResultDisplay(
        prisma,
        mr({
          matchInsights: {
            [RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY]: rrmSimSummaryPayload("cand-winner", "cand-static"),
            explanation: { cautions: ["hard stop"], whyMatch: "", strengths: [], rhythmPrediction: "" },
            riskFlags: [],
          },
        } as Partial<MatchResult>),
      );
      expect(r.displaySourceType).toBe("pairwise_final");
    });

    it("matchInsights placeholder cautions do not block RRM when meta explicit guardrails pass", async () => {
      process.env.PEIMA_M5_RRM_TOP2_ENABLED = "1";
      process.env.PAIRWISE_FINAL_MATCH_ENABLED = "1";
      process.env.PAIRWISE_FINAL_MATCH_MODE = "enabled";
      const prisma = mockPrisma({
        rrmTop2Row: { frozen: true, meta: rrmDisplayMetaJson(), top2Fingerprint: "fp_rrm_1" },
        finalizeRows: [
          {
            frozen: true,
            meta: metaV1({
              mode: "enabled",
              sourceType: "pairwise_final",
              pairwiseProposalRecommendation: "pairwise_winner_eligible",
              pairwiseWinnerCandidateUserId: "cand-winner",
              selectedCandidateUserId: "cand-winner",
              staticTop1CandidateUserId: "cand-static",
            }),
          },
        ],
      });
      const r = await resolveMatchResultDisplay(
        prisma,
        mr({
          matchInsights: {
            [RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY]: rrmSimSummaryPayload("cand-winner", "cand-static"),
            explanation: {
              cautions: ["仍需线下沟通验证真实相处感受（规则占位）"],
              whyMatch: "",
              strengths: [],
              rhythmPrediction: "",
            },
            riskFlags: [],
          },
        } as Partial<MatchResult>),
      );
      expect(r.displaySourceType).toBe("rrm_top2_bounded_selector");
      expect(r.displayCandidateUserId).toBe("cand-winner");
    });
  });

  describe("M6.0-r6 RRM V2 selector readonly display", () => {
    function scoreShadowV2Fixture() {
      return {
        scoringVersion: "m6.0-relationship-profile-score-v2-shadow" as const,
        rawCompatibilityScore: 1,
        weightedBaseScore: 1,
        penaltyTotal: 0,
        cappedRawScore: 1,
        displayScore100: 72,
        band: "medium" as const,
        capApplied: null,
        coreConflictCount: 0,
        strongConflictCount: 0,
        redFlagConflictCount: 0,
        validAxisCount: 4,
        skippedAxisCount: 0,
        source: "profile_v2_shadow" as const,
      };
    }

    function rrmV2SelectorFixture(top1: string, top2?: string) {
      return {
        version: MATCH_INSIGHTS_RRM_V2_TOP2_SELECTOR_SHADOW_VERSION,
        eligible: true,
        reason: "ok" as const,
        selectedTop2: [
          { candidateUserId: top1, displayScore100: 80, band: "good" as const },
          ...(top2
            ? [{ candidateUserId: top2, displayScore100: 70, band: "medium" as const }]
            : []),
        ],
        top1CandidateUserId: top1,
        top2CandidateUserId: top2 ?? null,
        top2Gap: 10,
        contextFlags: {
          top2GapLarge: false,
          hasLowBand: false,
          hasStrongConflictBand: false,
          anyBelowSuggestedFloor: false,
        },
        thresholds: { suggestedFloorDisplayScore100: 50, largeGapThreshold: 20 },
      };
    }

    it("M6 flag off → ignores valid rrmV2Top2Selector (pairwise path)", async () => {
      delete process.env.PEIMA_M6_RRM_V2_SELECTOR_DISPLAY_ENABLED;
      delete process.env.PEIMA_M5_RRM_TOP2_ENABLED;
      process.env.PAIRWISE_FINAL_MATCH_ENABLED = "1";
      process.env.PAIRWISE_FINAL_MATCH_MODE = "enabled";
      const prisma = mockPrisma({
        userIds: new Set(["cand-static", "cand-winner", "cand-m6"]),
        finalizeRows: [
          {
            frozen: true,
            meta: metaV1({
              mode: "enabled",
              sourceType: "pairwise_final",
              pairwiseProposalRecommendation: "pairwise_winner_eligible",
              pairwiseWinnerCandidateUserId: "cand-winner",
              selectedCandidateUserId: "cand-winner",
              staticTop1CandidateUserId: "cand-static",
            }),
          },
        ],
      });
      const r = await resolveMatchResultDisplay(
        prisma,
        mr({
          matchInsights: {
            scoreShadowV2: scoreShadowV2Fixture(),
            rrmV2Top2Selector: rrmV2SelectorFixture("cand-m6", "cand-static"),
          },
        } as Partial<MatchResult>),
      );
      expect(r.displaySourceType).toBe("pairwise_final");
      expect(r.displayCandidateUserId).toBe("cand-winner");
    });

    it("M6 flag TRUE (not 1) → disabled, pairwise wins", async () => {
      process.env.PEIMA_M6_RRM_V2_SELECTOR_DISPLAY_ENABLED = "TRUE";
      delete process.env.PEIMA_M5_RRM_TOP2_ENABLED;
      process.env.PAIRWISE_FINAL_MATCH_ENABLED = "1";
      process.env.PAIRWISE_FINAL_MATCH_MODE = "enabled";
      const prisma = mockPrisma({
        userIds: new Set(["cand-static", "cand-winner", "cand-m6"]),
        finalizeRows: [
          {
            frozen: true,
            meta: metaV1({
              mode: "enabled",
              sourceType: "pairwise_final",
              pairwiseProposalRecommendation: "pairwise_winner_eligible",
              pairwiseWinnerCandidateUserId: "cand-winner",
              selectedCandidateUserId: "cand-winner",
              staticTop1CandidateUserId: "cand-static",
            }),
          },
        ],
      });
      const r = await resolveMatchResultDisplay(
        prisma,
        mr({
          matchInsights: {
            scoreShadowV2: scoreShadowV2Fixture(),
            rrmV2Top2Selector: rrmV2SelectorFixture("cand-m6"),
          },
        } as Partial<MatchResult>),
      );
      expect(r.displaySourceType).toBe("pairwise_final");
    });

    it("M6 flag on + valid payload + user/profile → rrm_top2_v2_selector_readonly", async () => {
      process.env.PEIMA_M6_RRM_V2_SELECTOR_DISPLAY_ENABLED = "1";
      delete process.env.PEIMA_M5_RRM_TOP2_ENABLED;
      process.env.PAIRWISE_FINAL_MATCH_ENABLED = "1";
      process.env.PAIRWISE_FINAL_MATCH_MODE = "enabled";
      const prisma = mockPrisma({
        userIds: new Set(["cand-static", "cand-winner", "cand-m6"]),
        finalizeRows: [
          {
            frozen: true,
            meta: metaV1({
              mode: "enabled",
              sourceType: "pairwise_final",
              pairwiseProposalRecommendation: "pairwise_winner_eligible",
              pairwiseWinnerCandidateUserId: "cand-winner",
              selectedCandidateUserId: "cand-winner",
              staticTop1CandidateUserId: "cand-static",
            }),
          },
        ],
      });
      const row = mr({
        candidateUserId: "cand-static",
        finalScore: 0.55,
        matchInsights: {
          scoreShadowV2: scoreShadowV2Fixture(),
          rrmV2Top2Selector: rrmV2SelectorFixture("cand-m6", "cand-static"),
        },
      } as Partial<MatchResult>);
      const r = await resolveMatchResultDisplay(prisma, row);
      expect(r.displaySourceType).toBe("rrm_top2_v2_selector_readonly");
      expect(r.displayCandidateUserId).toBe("cand-m6");
      expect(r.finalMatchDecisionMeta).toBeNull();
      expect(row.candidateUserId).toBe("cand-static");
      expect(row.finalScore).toBe(0.55);
    });

    it("M6 flag on + missing scoreShadowV2 → fallback pairwise", async () => {
      process.env.PEIMA_M6_RRM_V2_SELECTOR_DISPLAY_ENABLED = "1";
      delete process.env.PEIMA_M5_RRM_TOP2_ENABLED;
      process.env.PAIRWISE_FINAL_MATCH_ENABLED = "1";
      process.env.PAIRWISE_FINAL_MATCH_MODE = "enabled";
      const prisma = mockPrisma({
        userIds: new Set(["cand-static", "cand-winner", "cand-m6"]),
        finalizeRows: [
          {
            frozen: true,
            meta: metaV1({
              mode: "enabled",
              sourceType: "pairwise_final",
              pairwiseWinnerCandidateUserId: "cand-winner",
              selectedCandidateUserId: "cand-winner",
              staticTop1CandidateUserId: "cand-static",
            }),
          },
        ],
      });
      const r = await resolveMatchResultDisplay(
        prisma,
        mr({
          matchInsights: {
            rrmV2Top2Selector: rrmV2SelectorFixture("cand-m6"),
          },
        } as Partial<MatchResult>),
      );
      expect(r.displaySourceType).toBe("pairwise_final");
    });

    it("M6 flag on + only scoreShadow v1 + valid selector → fallback (v2 required)", async () => {
      process.env.PEIMA_M6_RRM_V2_SELECTOR_DISPLAY_ENABLED = "1";
      delete process.env.PEIMA_M5_RRM_TOP2_ENABLED;
      process.env.PAIRWISE_FINAL_MATCH_ENABLED = "1";
      process.env.PAIRWISE_FINAL_MATCH_MODE = "enabled";
      const prisma = mockPrisma({
        userIds: new Set(["cand-static", "cand-winner", "cand-m6"]),
        finalizeRows: [
          {
            frozen: true,
            meta: metaV1({
              mode: "enabled",
              sourceType: "pairwise_final",
              pairwiseWinnerCandidateUserId: "cand-winner",
              selectedCandidateUserId: "cand-winner",
              staticTop1CandidateUserId: "cand-static",
            }),
          },
        ],
      });
      const r = await resolveMatchResultDisplay(
        prisma,
        mr({
          matchInsights: {
            scoreShadow: {
              finalScoreV1: 0.5,
              relationshipProfileScore: 0.5,
              scoringVersion: "m6.0-profile-score-shadow-v1",
            },
            rrmV2Top2Selector: rrmV2SelectorFixture("cand-m6"),
          },
        } as Partial<MatchResult>),
      );
      expect(r.displaySourceType).toBe("pairwise_final");
    });

    it("M6 flag on + no scoreShadow v1 + v2 present → M6 path ok", async () => {
      process.env.PEIMA_M6_RRM_V2_SELECTOR_DISPLAY_ENABLED = "1";
      delete process.env.PEIMA_M5_RRM_TOP2_ENABLED;
      process.env.PAIRWISE_FINAL_MATCH_ENABLED = "1";
      process.env.PAIRWISE_FINAL_MATCH_MODE = "enabled";
      const prisma = mockPrisma({
        userIds: new Set(["cand-static", "cand-m6"]),
        finalizeRows: [],
      });
      const r = await resolveMatchResultDisplay(
        prisma,
        mr({
          matchInsights: {
            scoreShadowV2: scoreShadowV2Fixture(),
            rrmV2Top2Selector: rrmV2SelectorFixture("cand-m6"),
          },
        } as Partial<MatchResult>),
      );
      expect(r.displaySourceType).toBe("rrm_top2_v2_selector_readonly");
      expect(r.displayCandidateUserId).toBe("cand-m6");
    });

    it("M6 flag on + missing user profile → fallback to original when no pairwise", async () => {
      process.env.PEIMA_M6_RRM_V2_SELECTOR_DISPLAY_ENABLED = "1";
      delete process.env.PEIMA_M5_RRM_TOP2_ENABLED;
      process.env.PAIRWISE_FINAL_MATCH_ENABLED = "0";
      const prisma = mockPrisma({
        userIds: new Set(["cand-static", "cand-m6"]),
        profileUserIds: new Set(["cand-static"]),
      });
      const r = await resolveMatchResultDisplay(
        prisma,
        mr({
          matchInsights: {
            scoreShadowV2: scoreShadowV2Fixture(),
            rrmV2Top2Selector: rrmV2SelectorFixture("cand-m6"),
          },
        } as Partial<MatchResult>),
      );
      expect(r.displaySourceType).toBe("match_result_original");
      expect(r.displayCandidateUserId).toBe("cand-static");
    });

    it("M6 flag on + invalid selector version → fallback pairwise (no throw)", async () => {
      process.env.PEIMA_M6_RRM_V2_SELECTOR_DISPLAY_ENABLED = "1";
      delete process.env.PEIMA_M5_RRM_TOP2_ENABLED;
      process.env.PAIRWISE_FINAL_MATCH_ENABLED = "1";
      process.env.PAIRWISE_FINAL_MATCH_MODE = "enabled";
      const prisma = mockPrisma({
        userIds: new Set(["cand-static", "cand-winner", "cand-m6"]),
        finalizeRows: [
          {
            frozen: true,
            meta: metaV1({
              mode: "enabled",
              sourceType: "pairwise_final",
              pairwiseWinnerCandidateUserId: "cand-winner",
              selectedCandidateUserId: "cand-winner",
              staticTop1CandidateUserId: "cand-static",
            }),
          },
        ],
      });
      const row = mr({
        candidateUserId: "cand-static",
        finalScore: 0.4,
        matchInsights: {
          scoreShadowV2: scoreShadowV2Fixture(),
          rrmV2Top2Selector: { ...rrmV2SelectorFixture("cand-m6"), version: "wrong-shadow-version" },
        },
      } as Partial<MatchResult>);
      const r = await resolveMatchResultDisplay(prisma, row);
      expect(r.displaySourceType).toBe("pairwise_final");
      expect(row.candidateUserId).toBe("cand-static");
      expect(row.finalScore).toBe(0.4);
    });

    it("M6 flag on + top1 user row missing → fallback pairwise (no throw)", async () => {
      process.env.PEIMA_M6_RRM_V2_SELECTOR_DISPLAY_ENABLED = "1";
      delete process.env.PEIMA_M5_RRM_TOP2_ENABLED;
      process.env.PAIRWISE_FINAL_MATCH_ENABLED = "1";
      process.env.PAIRWISE_FINAL_MATCH_MODE = "enabled";
      const prisma = mockPrisma({
        userIds: new Set(["cand-static", "cand-winner"]),
        finalizeRows: [
          {
            frozen: true,
            meta: metaV1({
              mode: "enabled",
              sourceType: "pairwise_final",
              pairwiseWinnerCandidateUserId: "cand-winner",
              selectedCandidateUserId: "cand-winner",
              staticTop1CandidateUserId: "cand-static",
            }),
          },
        ],
      });
      const r = await resolveMatchResultDisplay(
        prisma,
        mr({
          matchInsights: {
            scoreShadowV2: scoreShadowV2Fixture(),
            rrmV2Top2Selector: rrmV2SelectorFixture("cand-m6"),
          },
        } as Partial<MatchResult>),
      );
      expect(r.displaySourceType).toBe("pairwise_final");
      expect(r.displayCandidateUserId).toBe("cand-winner");
    });
  });
});

describe("buildResolvedMatchProjection (M6.5-C1)", () => {
  it("baseline only: resolved and targets follow baseline; no warnings", () => {
    const baseline = "cand-a";
    const p = buildResolvedMatchProjection(
      baseline,
      {
        displayCandidateUserId: baseline,
        displaySourceType: "match_result_original",
        finalMatchDecisionMeta: null,
      },
      { displayResolverErrored: false },
    );
    expect(p.baselineCandidateUserId).toBe(baseline);
    expect(p.displayCandidateUserId).toBe(baseline);
    expect(p.decisionCandidateUserId).toBeNull();
    expect(p.decisionSourceType).toBeNull();
    expect(p.resolvedCandidateUserId).toBe(baseline);
    expect(p.resolvedSourceType).toBe("match_result_original");
    expect(p.scoreOwnerCandidateUserId).toBe(baseline);
    expect(p.explanationOwnerCandidateUserId).toBe(baseline);
    expect(p.chatTargetUserId).toBe(baseline);
    expect(p.timelineTargetUserId).toBe(baseline);
    expect(p.feedbackTargetUserId).toBe(baseline);
    expect(p.fallbackUsed).toBe(false);
    expect(p.fallbackReason).toBeNull();
    expect(p.consistencyWarnings).toEqual([]);
  });

  it("display differs from baseline: resolved follows display; owners stay baseline; warnings", () => {
    const baseline = "cand-a";
    const displayId = "cand-b";
    const p = buildResolvedMatchProjection(
      baseline,
      {
        displayCandidateUserId: displayId,
        displaySourceType: "rrm_top2_v2_selector_readonly",
        finalMatchDecisionMeta: null,
      },
      { displayResolverErrored: false },
    );
    expect(p.resolvedCandidateUserId).toBe(displayId);
    expect(p.resolvedSourceType).toBe("rrm_top2_v2_selector_readonly");
    expect(p.scoreOwnerCandidateUserId).toBe(baseline);
    expect(p.explanationOwnerCandidateUserId).toBe(baseline);
    expect(p.chatTargetUserId).toBe(displayId);
    expect(p.timelineTargetUserId).toBe(displayId);
    expect(p.feedbackTargetUserId).toBe(displayId);
    const codes = p.consistencyWarnings.map((w) => w.code).sort();
    expect(codes).toEqual(
      [
        "display_candidate_differs_from_candidate_user_id",
        "explanation_owner_mismatch",
        "score_owner_mismatch",
      ].sort(),
    );
  });

  it("display resolver errored: fallback baseline + resolved_fallback_to_baseline warning", () => {
    const baseline = "cand-a";
    const p = buildResolvedMatchProjection(
      baseline,
      {
        displayCandidateUserId: baseline,
        displaySourceType: "match_result_original",
        finalMatchDecisionMeta: null,
      },
      { displayResolverErrored: true },
    );
    expect(p.resolvedCandidateUserId).toBe(baseline);
    expect(p.fallbackUsed).toBe(true);
    expect(p.fallbackReason).toBe("display_resolver_failed");
    expect(p.consistencyWarnings.some((w) => w.code === "resolved_fallback_to_baseline")).toBe(true);
  });

  it("no true decision: decision fields null", () => {
    const p = buildResolvedMatchProjection(
      "x",
      { displayCandidateUserId: "x", displaySourceType: "match_result_original", finalMatchDecisionMeta: null },
      { displayResolverErrored: false },
    );
    expect(p.decisionCandidateUserId).toBeNull();
    expect(p.decisionSourceType).toBeNull();
  });
});

describe("tryResolveRrmBoundedDecisionReadLayerOverride (M6.8-C1)", () => {
  function baseProjection(over: Partial<ReturnType<typeof buildResolvedMatchProjection>> = {}) {
    return {
      baselineCandidateUserId: "cand-a",
      displayCandidateUserId: "cand-a",
      decisionCandidateUserId: null,
      resolvedCandidateUserId: "cand-a",
      resolvedSourceType: "match_result_original",
      decisionSourceType: null,
      fallbackUsed: false,
      fallbackReason: null,
      resolvedFinalScore: null,
      resolvedScoreOwnerCandidateUserId: "cand-a",
      resolvedScoreSourceType: null,
      scoreProjectionFallbackUsed: true,
      scoreProjectionFallbackReason: "top2_score_snapshot_missing",
      scoreOwnerCandidateUserId: "cand-a",
      explanationOwnerCandidateUserId: "cand-a",
      chatTargetUserId: "cand-a",
      timelineTargetUserId: "cand-a",
      feedbackTargetUserId: "cand-a",
      consistencyWarnings: [],
      ...over,
    };
  }

  function validInsights(target = "cand-b") {
    return {
      rrmV2Top2Selector: {
        selectedTop2: [{ candidateUserId: target }, { candidateUserId: "cand-a" }],
      },
      rrmBoundedDecision: {
        schemaVersion: 1,
        sourceType: "rrm_bounded_decision",
        sourceVersion: "m6.3-rrm-bounded-decision-v1",
        mode: "dry_run",
        decision: "would_switch_to_rrm",
        wouldSwitch: true,
        fallbackUsed: false,
        fallbackReason: null,
        boundedRef: { kind: "user", id: target },
        guardrails: { blocked: false, blockReasons: [] },
        inputPresence: {
          scoreShadowV2: true,
          rrmDecisionShadow: true,
          rrmV2Top2Selector: true,
          selectedTop2: true,
          scoreShadowV1LegacyPresent: false,
        },
      },
    };
  }

  const okChecker = {
    hasUser: jest.fn(async () => true),
    hasUserProfile: jest.fn(async () => true),
  };

  afterEach(() => {
    delete process.env.PEIMA_M6_RRM_BOUNDED_DECISION_ENABLED;
    jest.clearAllMocks();
  });

  it("flag off keeps old projection even if payload is valid", async () => {
    process.env.PEIMA_M6_RRM_BOUNDED_DECISION_ENABLED = "0";
    const current = baseProjection();
    const out = await tryResolveRrmBoundedDecisionReadLayerOverride(validInsights(), current, okChecker);
    expect(out).toEqual(current);
  });

  it("flag on + valid payload switches resolved and targets to bounded target", async () => {
    process.env.PEIMA_M6_RRM_BOUNDED_DECISION_ENABLED = "1";
    const out = await tryResolveRrmBoundedDecisionReadLayerOverride(
      validInsights("cand-b"),
      baseProjection(),
      okChecker,
    );
    expect(out.decisionCandidateUserId).toBe("cand-b");
    expect(out.decisionSourceType).toBe("rrm_bounded_decision_read_layer");
    expect(out.resolvedCandidateUserId).toBe("cand-b");
    expect(out.resolvedSourceType).toBe("rrm_bounded_decision_read_layer");
    expect(out.chatTargetUserId).toBe("cand-b");
    expect(out.timelineTargetUserId).toBe("cand-b");
    expect(out.feedbackTargetUserId).toBe("cand-b");
    expect(out.fallbackUsed).toBe(false);
    expect(out.fallbackReason).toBeNull();
    expect(out.consistencyWarnings.some((w) => w.code === "rrm_bounded_read_layer_active")).toBe(true);
    expect(out.consistencyWarnings.some((w) => w.code === "score_owner_mismatch")).toBe(true);
    expect(out.scoreOwnerCandidateUserId).toBe("cand-a");
  });

  it("decision not switch falls back without throwing", async () => {
    process.env.PEIMA_M6_RRM_BOUNDED_DECISION_ENABLED = "1";
    const insights = validInsights();
    (insights.rrmBoundedDecision as any).decision = "would_use_baseline";
    const out = await tryResolveRrmBoundedDecisionReadLayerOverride(insights, baseProjection(), okChecker);
    expect(out.resolvedCandidateUserId).toBe("cand-a");
    expect(out.fallbackUsed).toBe(true);
    expect(out.fallbackReason).toBe("decision_not_switch");
    expect(out.consistencyWarnings.some((w) => w.code === "rrm_bounded_read_layer_fallback")).toBe(true);
  });

  it("guardrail blocked falls back", async () => {
    process.env.PEIMA_M6_RRM_BOUNDED_DECISION_ENABLED = "1";
    const insights = validInsights();
    (insights.rrmBoundedDecision as any).guardrails.blocked = true;
    const out = await tryResolveRrmBoundedDecisionReadLayerOverride(insights, baseProjection(), okChecker);
    expect(out.fallbackReason).toBe("guardrail_blocked");
  });

  it("missing scoreShadowV2 presence falls back", async () => {
    process.env.PEIMA_M6_RRM_BOUNDED_DECISION_ENABLED = "1";
    const insights = validInsights();
    (insights.rrmBoundedDecision as any).inputPresence.scoreShadowV2 = false;
    const out = await tryResolveRrmBoundedDecisionReadLayerOverride(insights, baseProjection(), okChecker);
    expect(out.fallbackReason).toBe("missing_score_shadow_v2");
  });

  it("missing target user falls back", async () => {
    process.env.PEIMA_M6_RRM_BOUNDED_DECISION_ENABLED = "1";
    const out = await tryResolveRrmBoundedDecisionReadLayerOverride(validInsights(), baseProjection(), {
      hasUser: jest.fn(async () => false),
      hasUserProfile: jest.fn(async () => true),
    });
    expect(out.fallbackReason).toBe("bounded_target_user_missing");
  });

  it("missing target profile falls back", async () => {
    process.env.PEIMA_M6_RRM_BOUNDED_DECISION_ENABLED = "1";
    const out = await tryResolveRrmBoundedDecisionReadLayerOverride(validInsights(), baseProjection(), {
      hasUser: jest.fn(async () => true),
      hasUserProfile: jest.fn(async () => false),
    });
    expect(out.fallbackReason).toBe("bounded_target_profile_missing");
  });

  it("malformed bounded decision falls back", async () => {
    process.env.PEIMA_M6_RRM_BOUNDED_DECISION_ENABLED = "1";
    const out = await tryResolveRrmBoundedDecisionReadLayerOverride(
      { rrmBoundedDecision: "bad" },
      baseProjection(),
      okChecker,
    );
    expect(out.fallbackReason).toBe("bounded_decision_missing");
  });

  it("target same as baseline falls back", async () => {
    process.env.PEIMA_M6_RRM_BOUNDED_DECISION_ENABLED = "1";
    const out = await tryResolveRrmBoundedDecisionReadLayerOverride(
      validInsights("cand-a"),
      baseProjection(),
      okChecker,
    );
    expect(out.fallbackReason).toBe("target_same_as_baseline");
  });

  it("payload without target falls back bounded_target_missing", async () => {
    process.env.PEIMA_M6_RRM_BOUNDED_DECISION_ENABLED = "1";
    const insights = validInsights();
    delete (insights.rrmBoundedDecision as any).boundedRef;
    const out = await tryResolveRrmBoundedDecisionReadLayerOverride(insights, baseProjection(), okChecker);
    expect(out.fallbackReason).toBe("bounded_target_missing");
  });

  it("no scoreShadow v1 does not block valid activation", async () => {
    process.env.PEIMA_M6_RRM_BOUNDED_DECISION_ENABLED = "1";
    const insights = validInsights("cand-b");
    (insights.rrmBoundedDecision as any).inputPresence.scoreShadowV1LegacyPresent = false;
    const out = await tryResolveRrmBoundedDecisionReadLayerOverride(insights, baseProjection(), okChecker);
    expect(out.resolvedCandidateUserId).toBe("cand-b");
  });
});

describe("applyResolvedScoreProjection (M6.10-C2)", () => {
  function baseProjection() {
    return {
      baselineCandidateUserId: "cand-a",
      displayCandidateUserId: "cand-a",
      decisionCandidateUserId: null,
      resolvedCandidateUserId: "cand-b",
      resolvedSourceType: "rrm_bounded_decision_read_layer",
      decisionSourceType: "rrm_bounded_decision_read_layer",
      fallbackUsed: false,
      fallbackReason: null,
      resolvedFinalScore: null,
      resolvedScoreOwnerCandidateUserId: "cand-a",
      resolvedScoreSourceType: null,
      scoreProjectionFallbackUsed: true,
      scoreProjectionFallbackReason: "top2_score_snapshot_missing" as const,
      scoreOwnerCandidateUserId: "cand-a",
      explanationOwnerCandidateUserId: "cand-a",
      chatTargetUserId: "cand-b",
      timelineTargetUserId: "cand-b",
      feedbackTargetUserId: "cand-b",
      consistencyWarnings: [{ code: "score_owner_mismatch", severity: "warning" as const, message: "x" }],
    };
  }

  function top2Snapshot() {
    return {
      top2ScoreSnapshot: {
        schemaVersion: 1,
        sourceType: "top2_score_snapshot",
        sourceVersion: "m6.10-top2-score-snapshot-v1",
        items: [
          {
            candidateUserId: "cand-b",
            rank: 1,
            finalScore: 0.91,
            displayScore100: 88,
            band: "high",
            components: {
              previewPoolScore: 0.8,
              preferenceScore: 0.8,
              styleScore: 0.8,
              profileScore: 0.8,
              finalScore: 0.91,
            },
            scoreOwnerCandidateUserId: "cand-b",
          },
          {
            candidateUserId: "cand-a",
            rank: 2,
            finalScore: 0.82,
            displayScore100: 80,
            band: "good",
            components: {
              previewPoolScore: 0.7,
              preferenceScore: 0.7,
              styleScore: 0.7,
              profileScore: 0.7,
              finalScore: 0.82,
            },
            scoreOwnerCandidateUserId: "cand-a",
          },
        ],
      },
    };
  }

  it("resolved candidate found in top2 snapshot → uses resolved candidate score", () => {
    const out = applyResolvedScoreProjection({
      current: baseProjection(),
      matchInsights: top2Snapshot(),
      baselineFinalScore: 0.82,
    });
    expect(out.resolvedFinalScore).toBe(0.91);
    expect(out.resolvedScoreOwnerCandidateUserId).toBe("cand-b");
    expect(out.resolvedScoreSourceType).toBe("top2_score_snapshot");
    expect(out.scoreProjectionFallbackUsed).toBe(false);
    expect(out.scoreProjectionFallbackReason).toBeNull();
    expect(out.scoreOwnerCandidateUserId).toBe("cand-b");
    expect(out.consistencyWarnings.some((w) => w.code === "score_owner_mismatch")).toBe(false);
  });

  it("resolved candidate missing in snapshot → fallback baseline and keep mismatch", () => {
    const payload = top2Snapshot();
    payload.top2ScoreSnapshot.items = [payload.top2ScoreSnapshot.items[1]!];
    const out = applyResolvedScoreProjection({
      current: baseProjection(),
      matchInsights: payload,
      baselineFinalScore: 0.82,
    });
    expect(out.resolvedFinalScore).toBe(0.82);
    expect(out.resolvedScoreSourceType).toBeNull();
    expect(out.scoreProjectionFallbackUsed).toBe(true);
    expect(out.scoreProjectionFallbackReason).toBe("resolved_candidate_not_in_top2_snapshot");
    expect(out.scoreOwnerCandidateUserId).toBe("cand-a");
    expect(out.consistencyWarnings.some((w) => w.code === "score_owner_mismatch")).toBe(true);
  });

  it("snapshot missing → fallback top2_score_snapshot_missing", () => {
    const out = applyResolvedScoreProjection({
      current: baseProjection(),
      matchInsights: {},
      baselineFinalScore: 0.82,
    });
    expect(out.resolvedFinalScore).toBe(0.82);
    expect(out.scoreProjectionFallbackUsed).toBe(true);
    expect(out.scoreProjectionFallbackReason).toBe("top2_score_snapshot_missing");
  });

  it("snapshot malformed → fallback malformed_top2_score_snapshot without throw", () => {
    const out = applyResolvedScoreProjection({
      current: baseProjection(),
      matchInsights: { top2ScoreSnapshot: { schemaVersion: 2 } },
      baselineFinalScore: 0.82,
    });
    expect(out.scoreProjectionFallbackUsed).toBe(true);
    expect(out.scoreProjectionFallbackReason).toBe("malformed_top2_score_snapshot");
  });

  it("resolved candidate is baseline should not report mismatch", () => {
    const current = baseProjection();
    current.resolvedCandidateUserId = "cand-a";
    current.scoreOwnerCandidateUserId = "cand-a";
    current.consistencyWarnings = [];
    const payload = top2Snapshot();
    const out = applyResolvedScoreProjection({
      current,
      matchInsights: payload,
      baselineFinalScore: 0.82,
    });
    expect(out.resolvedFinalScore).toBe(0.82);
    expect(out.scoreOwnerCandidateUserId).toBe("cand-a");
    expect(out.consistencyWarnings.some((w) => w.code === "score_owner_mismatch")).toBe(false);
  });
});
