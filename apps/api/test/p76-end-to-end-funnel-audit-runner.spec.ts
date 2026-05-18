import * as p76Audit from "../src/modules/matching/p76-end-to-end-funnel-audit";
import * as p76Legacy from "../src/modules/matching/p76-end-to-end-funnel-legacy-adapter";
import {
  END_TO_END_FUNNEL_SHADOW_SCHEMA_VERSION,
  END_TO_END_FUNNEL_SHADOW_SOURCE_VERSION,
} from "../src/modules/matching/p76-end-to-end-funnel-shadow.types";

const VIEWER = "cmo7ksq8s00006znosryc9k0n";
const WINNER = "cmfemn00100016z64seed0001";
const RUNNER_UP = "cmfemn003000506z64seed0003";

const STAGE1 = [
  "cmfemn002000306z64seed0002",
  RUNNER_UP,
  "cmr4hm001016z64demo00m05a",
  WINNER,
  "cmr4hf000716z64demo00f04a",
  "cmr4hf000916z64demo00f05a",
];

describe("p76 end-to-end funnel audit runner", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("builds audit JSON with correct finalShadow and wouldChange flags", async () => {
    jest.spyOn(p76Legacy, "loadP76LegacyComparisonContext").mockResolvedValue({
      legacy: {
        matchResultCandidateUserId: WINNER,
        matchResultFinalScore: 0.72,
        displayCandidateUserId: WINNER,
        displaySourceType: "match_result_original",
        legacyPreviewPoolCandidateIds: [...STAGE1],
        workerWinnerCandidateUserId: WINNER,
        m6RrmTop2CandidateIds: [WINNER, RUNNER_UP],
        m6RrmSelectedCandidateId: WINNER,
      },
      loadNotes: [],
    });

    const audit = await p76Audit.runP76R6EndToEndFunnelShadowAudit(
      {} as never,
      {
        viewerUserId: VIEWER,
        sourcePoolType: "onboarding_gated_cohort",
        dryRun: true,
        stage1SelectedCandidateIds: STAGE1,
        stage2Top2CandidateIds: [WINNER, RUNNER_UP],
        selectedBy20DOnlyCandidateId: WINNER,
        selectedByRrmCandidateId: WINNER,
        compareLegacy: true,
        compareM6: true,
      },
    );

    expect(audit.schemaVersion).toBe(END_TO_END_FUNNEL_SHADOW_SCHEMA_VERSION);
    expect(audit.sourceVersion).toBe(END_TO_END_FUNNEL_SHADOW_SOURCE_VERSION);
    expect(audit.finalShadow.selectedCandidateId).toBe(WINNER);
    expect(audit.stage3Rrm.wouldChange20DWinner).toBe(false);
    expect(audit.legacyComparison.wouldChangeLegacyMatchResult).toBe(false);
    expect(audit.legacyComparison.differenceStage).toBe("no_change");
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

  it("missing legacy does not throw", async () => {
    jest.spyOn(p76Legacy, "loadP76LegacyComparisonContext").mockResolvedValue({
      legacy: {},
      loadNotes: ["match_result_not_found"],
    });

    const audit = await p76Audit.runP76R6EndToEndFunnelShadowAudit(
      {} as never,
      {
        viewerUserId: VIEWER,
        sourcePoolType: "onboarding_gated_cohort",
        dryRun: true,
        stage1SelectedCandidateIds: STAGE1,
        stage2Top2CandidateIds: [WINNER, RUNNER_UP],
        selectedBy20DOnlyCandidateId: WINNER,
        selectedByRrmCandidateId: WINNER,
        compareLegacy: true,
        compareM6: true,
      },
    );

    expect(audit.finalShadow.selectedCandidateId).toBe(WINNER);
    expect(audit.legacyComparison.differenceStage).toBe("unknown");
  });

  it("wouldChangeLegacyMatchResult when MatchResult differs", async () => {
    jest.spyOn(p76Legacy, "loadP76LegacyComparisonContext").mockResolvedValue({
      legacy: {
        matchResultCandidateUserId: RUNNER_UP,
        legacyPreviewPoolCandidateIds: STAGE1,
        workerWinnerCandidateUserId: RUNNER_UP,
      },
      loadNotes: [],
    });

    const audit = await p76Audit.runP76R6EndToEndFunnelShadowAudit(
      {} as never,
      {
        viewerUserId: VIEWER,
        sourcePoolType: "onboarding_gated_cohort",
        dryRun: true,
        stage1SelectedCandidateIds: STAGE1,
        stage2Top2CandidateIds: [WINNER, RUNNER_UP],
        selectedBy20DOnlyCandidateId: WINNER,
        selectedByRrmCandidateId: WINNER,
        compareLegacy: true,
        compareM6: false,
      },
    );

    expect(audit.legacyComparison.wouldChangeLegacyMatchResult).toBe(true);
    expect(audit.legacyComparison.differenceStage).toBe("twenty_d_ranking");
  });

  it("stdout privacy safe on audit output", async () => {
    jest.spyOn(p76Legacy, "loadP76LegacyComparisonContext").mockResolvedValue({
      legacy: { matchResultCandidateUserId: WINNER },
      loadNotes: [],
    });

    const audit = await p76Audit.runP76R6EndToEndFunnelShadowAudit(
      {} as never,
      {
        viewerUserId: VIEWER,
        sourcePoolType: "onboarding_gated_cohort",
        dryRun: true,
        stage1SelectedCandidateIds: [],
        stage2Top2CandidateIds: [WINNER, RUNNER_UP],
        selectedBy20DOnlyCandidateId: WINNER,
        selectedByRrmCandidateId: WINNER,
        compareLegacy: true,
        compareM6: true,
      },
    );

    expect(() =>
      p76Legacy.assertP76EndToEndFunnelAuditPrivacySafe(audit),
    ).not.toThrow();
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toContain("detectionScoreJson");
    expect(serialized).not.toContain("imageUrl");
    expect(serialized).not.toContain("rawProfile");
  });
});
