import type { MatchResult } from "@peima/database";
import { RRM_SIM_SOURCE_VERSION } from "../src/modules/ai-simulation-v1/rrm-sim.constants";
import { RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY } from "../src/modules/matching/matching-rrm-sim-readonly-summary";
import { resolveMatchResultDisplay } from "../src/modules/matching/matching-result-display";
import { MATCH_RESULT_RRM_TOP2_DISPLAY_META_SOURCE_TYPE } from "../src/modules/matching/rrm-top2-display-meta.types";

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
  };

  afterEach(() => {
    process.env.PAIRWISE_FINAL_MATCH_ENABLED = prev.ENABLED;
    process.env.PAIRWISE_FINAL_MATCH_MODE = prev.MODE;
    if (prev.RRM_TOP2 === undefined) delete process.env.PEIMA_M5_RRM_TOP2_ENABLED;
    else process.env.PEIMA_M5_RRM_TOP2_ENABLED = prev.RRM_TOP2;
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
      ...over,
    };
  }

  function mockPrisma(opts: {
    finalizeRows?: { frozen: boolean; meta: unknown }[];
    userIds?: Set<string>;
    rrmTop2Row?: { frozen: boolean; meta: unknown; top2Fingerprint: string | null } | null;
  }) {
    const userIds = opts.userIds ?? new Set(["cand-static", "cand-winner"]);
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

    it("RRM env on but ineligible → falls back to pairwise", async () => {
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
            explanation: { cautions: ["hard stop"], whyMatch: "", strengths: [], rhythmPrediction: "" },
            riskFlags: [],
          },
        } as Partial<MatchResult>),
      );
      expect(r.displaySourceType).toBe("pairwise_final");
    });
  });
});
