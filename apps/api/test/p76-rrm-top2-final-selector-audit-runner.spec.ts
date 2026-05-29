import * as p76RrmShadow from "../src/modules/matching/p76-rrm-top2-final-selector-shadow";
import { runRrmTop2FinalSelectorAuditFromDb } from "../src/modules/matching/p76-rrm-top2-final-selector-db-adapter";
import {
  assertP76RrmTop2AuditReportPrivacySafe,
} from "../src/modules/matching/p76-rrm-top2-final-selector-db-adapter";
import {
  RRM_TOP2_FINAL_SELECTOR_SCHEMA_VERSION,
  RRM_TOP2_FINAL_SELECTOR_SOURCE_VERSION,
  type RrmTop2FinalSelectorShadowV1,
} from "../src/modules/matching/p76-rrm-top2-final-selector.types";

const WINNER_20D = "cmfemn00100016z64seed0001";
const TOP2_B = "cmfemn003000506z64seed0003";

function mockShadow(): RrmTop2FinalSelectorShadowV1 {
  return {
    schemaVersion: RRM_TOP2_FINAL_SELECTOR_SCHEMA_VERSION,
    sourceVersion: RRM_TOP2_FINAL_SELECTOR_SOURCE_VERSION,
    viewerUserId: "viewer-1",
    sourcePoolType: "onboarding_gated_cohort",
    generatedAt: "2026-05-16T14:00:00.000Z",
    stage1: {
      sourceVersion: "p7.6-r3-photovisual-first-pool-shadow-v1",
      selectedCandidateIds: [],
    },
    stage2TwentyD: {
      sourceVersion: "p7.6-r4a-20d-bidirectional-ranking-shadow-v1",
      top2CandidateIds: [WINNER_20D, TOP2_B],
      selectedBy20DOnlyCandidateId: WINNER_20D,
    },
    stage3Rrm: {
      evaluatedCandidateIds: [WINNER_20D, TOP2_B],
      rankedCandidates: [
        {
          candidateUserId: TOP2_B,
          rank: 1,
          AtoBRrmFit: 0.85,
          BtoARrmFit: 0.8,
          mutualRrmFit: 0.82,
          rhythmRiskFlags: [],
          pressureRiskFlags: [],
          boundaryRiskFlags: [],
          repairPotentialSignals: ["repair_potential_ok"],
          repairPotentialScore: 0.2,
          riskFlagCount: 0,
          missingSignals: [],
          fallbackReason: null,
          eligible: true,
          ineligibleReasons: [],
        },
        {
          candidateUserId: WINNER_20D,
          rank: 2,
          AtoBRrmFit: 0.7,
          BtoARrmFit: 0.7,
          mutualRrmFit: 0.7,
          rhythmRiskFlags: ["rhythm_mismatch"],
          pressureRiskFlags: [],
          boundaryRiskFlags: [],
          repairPotentialSignals: [],
          repairPotentialScore: 0,
          riskFlagCount: 1,
          missingSignals: [],
          fallbackReason: null,
          eligible: true,
          ineligibleReasons: [],
        },
      ],
      selectedByRrmCandidateId: TOP2_B,
      wouldChange20DWinner: true,
      reasonSummary: "stage3_rrm_selected_differs_from_20d_winner",
      appliedToMatchResult: false,
    },
    comparisons: {},
    finalShadow: {
      stage3SelectedCandidateId: TOP2_B,
      applied: false,
      appliedToPool: false,
      appliedToFinalScore: false,
      appliedToMatchResult: false,
      appliedToWorkerRanking: false,
    },
  };
}

describe("p76 rrm top2 final selector audit runner", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("builds audit report with selectedByRrm and wouldChange20D", async () => {
    const shadow = mockShadow();
    jest
      .spyOn(p76RrmShadow, "buildRrmTop2FinalSelectorShadowV1")
      .mockReturnValue(shadow);

    const report = await runRrmTop2FinalSelectorAuditFromDb(
      {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: "viewer-1",
            relationProfile: { relationshipPace: 0.5, emotionalStability: 0.7 },
          }),
          findMany: jest.fn().mockResolvedValue([]),
        },
      } as never,
      {
        viewerUserId: "viewer-1",
        top2CandidateIds: [WINNER_20D, TOP2_B],
        selectedBy20DOnlyCandidateId: WINNER_20D,
        sourcePoolType: "onboarding_gated_cohort",
        stage2SourceVersion: "p7.6-r4a-20d-bidirectional-ranking-shadow-v1",
        dryRun: true,
      },
    );

    expect(report.schemaVersion).toBe(
      "p7.6-r5b-rrm-top2-final-selector-audit-v1",
    );
    expect(report.selectedByRrmCandidateId).toBe(TOP2_B);
    expect(report.wouldChange20DWinner).toBe(true);
    expect(report.applied).toBe(false);
    expect(report.dryRun).toBe(true);
    expect(report.fallbackReasonDistribution).toEqual({});
  });

  it("fallbackReasonDistribution counts ranked fallback reasons", async () => {
    const shadow = mockShadow();
    shadow.stage3Rrm.rankedCandidates[1]!.fallbackReason =
      "CANDIDATE_RRM_PROFILE_MISSING";
    shadow.stage3Rrm.rankedCandidates[1]!.eligible = false;

    jest
      .spyOn(p76RrmShadow, "buildRrmTop2FinalSelectorShadowV1")
      .mockReturnValue(shadow);

    const report = await runRrmTop2FinalSelectorAuditFromDb(
      {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: "v",
            relationProfile: { relationshipPace: 0.5 },
          }),
          findMany: jest.fn().mockResolvedValue([]),
        },
      } as never,
      {
        viewerUserId: "v",
        top2CandidateIds: [WINNER_20D, TOP2_B],
        selectedBy20DOnlyCandidateId: WINNER_20D,
        sourcePoolType: "onboarding_gated_cohort",
        stage2SourceVersion: "p7.6-r4a-20d-bidirectional-ranking-shadow-v1",
        dryRun: true,
      },
    );

    expect(report.fallbackReasonDistribution).toEqual({
      CANDIDATE_RRM_PROFILE_MISSING: 1,
    });
  });

  it("stdout privacy safe on audit report", () => {
    const report = {
      schemaVersion: "p7.6-r5b-rrm-top2-final-selector-audit-v1",
      shadow: mockShadow(),
      applied: false,
    };
    expect(() => assertP76RrmTop2AuditReportPrivacySafe(report)).not.toThrow();
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("dimensionBranchChatHints");
    expect(serialized).not.toContain("effectiveProfileChatOverlayV1");
  });
});
