import * as p76DbAdapter from "../src/modules/matching/p76-20d-bidirectional-ranking-db-adapter";
import { runTwentyDBidirectionalRankingAuditFromDb } from "../src/modules/matching/p76-20d-bidirectional-ranking-db-adapter";
import * as p76Shadow from "../src/modules/matching/p76-20d-bidirectional-ranking-shadow";
import {
  TWENTY_D_BIDIRECTIONAL_RANKING_SCHEMA_VERSION,
  TWENTY_D_BIDIRECTIONAL_RANKING_SOURCE_VERSION,
  type TwentyDBidirectionalRankingShadowV1,
} from "../src/modules/matching/p76-20d-bidirectional-ranking.types";

function mockShadow(): TwentyDBidirectionalRankingShadowV1 {
  return {
    schemaVersion: TWENTY_D_BIDIRECTIONAL_RANKING_SCHEMA_VERSION,
    sourceVersion: TWENTY_D_BIDIRECTIONAL_RANKING_SOURCE_VERSION,
    viewerUserId: "viewer-1",
    sourcePoolType: "onboarding_gated_cohort",
    generatedAt: "2026-05-16T00:00:00.000Z",
    stage1: {
      sourceVersion: "p7.6-r3-photovisual-first-pool-shadow-v1",
      selectedCandidateIds: ["c-high", "c-low"],
    },
    stage2TwentyD: {
      rankedCandidates: [
        {
          candidateUserId: "c-high",
          rank: 1,
          AtoB20DFit: 0.8,
          BtoA20DFit: 0.7,
          mutual20DFit: 0.74,
          imbalancePenalty: 0.1,
          reasons: [],
          missingSignals: [],
          fallbackReason: null,
          eligible: true,
          ineligibleReasons: [],
        },
        {
          candidateUserId: "c-low",
          rank: 2,
          AtoB20DFit: 0.3,
          BtoA20DFit: 0.3,
          mutual20DFit: 0.3,
          imbalancePenalty: 0,
          reasons: [],
          missingSignals: ["PREFERENCE_MISSING"],
          fallbackReason: "PREFERENCE_MISSING",
          eligible: true,
          ineligibleReasons: [],
        },
      ],
      topNCandidateIds: ["c-high", "c-low"],
      top2CandidateIds: ["c-high", "c-low"],
      selectedBy20DOnlyCandidateId: "c-high",
      appliedToFinalScore: false,
    },
    comparisons: {},
    finalShadow: {
      stage2Top2CandidateIds: ["c-high", "c-low"],
      applied: false,
      appliedToPool: false,
      appliedToFinalScore: false,
      appliedToMatchResult: false,
      appliedToWorkerRanking: false,
    },
  };
}

describe("p76 20d bidirectional ranking audit runner", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("builds audit report with top2 and selectedBy20DOnly", async () => {
    const shadow = mockShadow();
    jest
      .spyOn(p76Shadow, "buildTwentyDBidirectionalRankingShadowV1")
      .mockReturnValue(shadow);

    const report = await runTwentyDBidirectionalRankingAuditFromDb(
      {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: "viewer-1",
            age: 28,
            city: "上海",
            height: 175,
            education: "本科",
            occupation: "工程师",
            relationshipGoal: "长期",
            preference: null,
            relationProfile: { attachmentStyle: 0.5 },
          }),
          findMany: jest.fn().mockResolvedValue([]),
        },
      } as never,
      {
        viewerUserId: "viewer-1",
        candidateUserIds: ["c-high", "c-low"],
        sourcePoolType: "onboarding_gated_cohort",
        topN: 6,
        stage1SourceVersion: "p7.6-r3-photovisual-first-pool-shadow-v1",
        dryRun: true,
      },
    );

    expect(report.schemaVersion).toBe(
      "p7.6-r4b-20d-bidirectional-ranking-audit-v1",
    );
    expect(report.top2CandidateIds).toEqual(["c-high", "c-low"]);
    expect(report.selectedBy20DOnlyCandidateId).toBe("c-high");
    expect(report.applied).toBe(false);
    expect(report.dryRun).toBe(true);
    expect(report.fallbackReasonDistribution).toEqual({
      PREFERENCE_MISSING: 1,
    });
  });

  it("stdout privacy safe on audit report", () => {
    const report = {
      schemaVersion: "p7.6-r4b-20d-bidirectional-ranking-audit-v1",
      shadow: mockShadow(),
      applied: false,
    };
    expect(() =>
      p76DbAdapter.assertP76TwentyDAuditReportPrivacySafe(report),
    ).not.toThrow();
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("dimensionBranchChatHints");
    expect(serialized).not.toContain("effectiveProfileChatOverlayV1");
  });

  it("empty candidate list does not throw", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "viewer-1",
          age: null,
          city: "",
          height: null,
          education: "",
          occupation: "",
          relationshipGoal: "",
          preference: null,
          relationProfile: { attachmentStyle: 0.4 },
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const report = await runTwentyDBidirectionalRankingAuditFromDb(
      prisma as never,
      {
        viewerUserId: "viewer-1",
        candidateUserIds: [],
        sourcePoolType: "onboarding_gated_cohort",
        topN: 6,
        stage1SourceVersion: "p7.6-r3-photovisual-first-pool-shadow-v1",
        dryRun: true,
      },
    );

    expect(report.rankedCandidates).toBe(0);
    expect(report.top2CandidateIds).toEqual([]);
  });
});
