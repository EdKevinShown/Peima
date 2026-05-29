import {
  computeDifferenceStage,
  computeWouldChange20DWinner,
  computeWouldChangeDisplayCandidate,
  computeWouldChangeLegacyMatchResult,
  computeWouldChangeM6Top2,
  computeWouldChangeWorkerWinner,
  hasLegacyComparisonContext,
} from "../src/modules/matching/p76-end-to-end-funnel-comparison";

const WINNER = "cmfemn00100016z64seed0001";
const RUNNER_UP = "cmfemn003000506z64seed0003";
const OTHER = "cmfemn002000306z64seed0002";

describe("p76 end-to-end funnel comparison", () => {
  describe("computeWouldChange20DWinner", () => {
    it("RRM selected same as 20D winner → false", () => {
      expect(
        computeWouldChange20DWinner(
          { selectedBy20DOnlyCandidateId: WINNER },
          { selectedByRrmCandidateId: WINNER },
        ),
      ).toBe(false);
    });

    it("RRM selected differs from 20D winner → true", () => {
      expect(
        computeWouldChange20DWinner(
          { selectedBy20DOnlyCandidateId: WINNER },
          { selectedByRrmCandidateId: RUNNER_UP },
        ),
      ).toBe(true);
    });

    it("null on either side → false", () => {
      expect(
        computeWouldChange20DWinner(
          { selectedBy20DOnlyCandidateId: null },
          { selectedByRrmCandidateId: WINNER },
        ),
      ).toBe(false);
    });
  });

  describe("computeWouldChangeLegacyMatchResult", () => {
    it("final matches MatchResult candidate → false", () => {
      expect(
        computeWouldChangeLegacyMatchResult(WINNER, WINNER),
      ).toBe(false);
    });

    it("final differs from MatchResult candidate → true", () => {
      expect(
        computeWouldChangeLegacyMatchResult(WINNER, OTHER),
      ).toBe(true);
    });

    it("null legacy → false", () => {
      expect(computeWouldChangeLegacyMatchResult(WINNER, null)).toBe(false);
    });
  });

  describe("computeWouldChangeDisplayCandidate", () => {
    it("final matches display → false", () => {
      expect(
        computeWouldChangeDisplayCandidate(WINNER, WINNER),
      ).toBe(false);
    });

    it("final differs from display → true", () => {
      expect(
        computeWouldChangeDisplayCandidate(WINNER, OTHER),
      ).toBe(true);
    });
  });

  describe("computeWouldChangeWorkerWinner", () => {
    it("final matches worker winner → false", () => {
      expect(
        computeWouldChangeWorkerWinner(WINNER, WINNER),
      ).toBe(false);
    });

    it("final differs from worker winner → true", () => {
      expect(
        computeWouldChangeWorkerWinner(WINNER, OTHER),
      ).toBe(true);
    });
  });

  describe("computeWouldChangeM6Top2", () => {
    const top2 = [WINNER, RUNNER_UP];

    it("M6 Top2 set matches stage2 → false when selected matches", () => {
      expect(
        computeWouldChangeM6Top2(top2, [...top2], WINNER, WINNER),
      ).toBe(false);
    });

    it("M6 Top2 set differs → true", () => {
      expect(
        computeWouldChangeM6Top2(top2, [OTHER, RUNNER_UP], WINNER, WINNER),
      ).toBe(true);
    });

    it("M6 selected differs from stage3 → true", () => {
      expect(
        computeWouldChangeM6Top2(top2, [...top2], WINNER, RUNNER_UP),
      ).toBe(true);
    });
  });

  describe("computeDifferenceStage", () => {
    const stage1Ids = [
      "cmfemn002000306z64seed0002",
      RUNNER_UP,
      "cmr4hm001016z64demo00m05a",
      WINNER,
      "cmr4hf000716z64demo00f04a",
      "cmr4hf000916z64demo00f05a",
    ];

    it("no material difference → no_change", () => {
      expect(
        computeDifferenceStage({
          finalSelectedCandidateId: WINNER,
          wouldChange20DWinner: false,
          wouldChangeLegacyMatchResult: false,
          wouldChangeWorkerWinner: false,
          wouldChangeDisplayCandidate: false,
          stage1SelectedCandidateIds: stage1Ids,
          legacyPreviewPoolCandidateIds: [...stage1Ids],
          stage2Top2CandidateIds: [WINNER, RUNNER_UP],
          workerWinnerCandidateUserId: WINNER,
          hasLegacyContext: true,
        }),
      ).toBe("no_change");
    });

    it("RRM differs from 20D → rrm_selector", () => {
      expect(
        computeDifferenceStage({
          finalSelectedCandidateId: RUNNER_UP,
          wouldChange20DWinner: true,
          wouldChangeLegacyMatchResult: false,
          wouldChangeWorkerWinner: false,
          wouldChangeDisplayCandidate: false,
          stage1SelectedCandidateIds: stage1Ids,
          legacyPreviewPoolCandidateIds: [...stage1Ids],
          stage2Top2CandidateIds: [WINNER, RUNNER_UP],
          workerWinnerCandidateUserId: WINNER,
          hasLegacyContext: true,
        }),
      ).toBe("rrm_selector");
    });

    it("legacy MatchResult differs, 20D agrees → legacy_mismatch", () => {
      expect(
        computeDifferenceStage({
          finalSelectedCandidateId: WINNER,
          wouldChange20DWinner: false,
          wouldChangeLegacyMatchResult: true,
          wouldChangeWorkerWinner: false,
          wouldChangeDisplayCandidate: false,
          stage1SelectedCandidateIds: stage1Ids,
          legacyPreviewPoolCandidateIds: [...stage1Ids],
          stage2Top2CandidateIds: [WINNER, RUNNER_UP],
          workerWinnerCandidateUserId: OTHER,
          hasLegacyContext: true,
        }),
      ).toBe("legacy_mismatch");
    });

    it("worker winner in top2 but not final → twenty_d_ranking", () => {
      expect(
        computeDifferenceStage({
          finalSelectedCandidateId: WINNER,
          wouldChange20DWinner: false,
          wouldChangeLegacyMatchResult: true,
          wouldChangeWorkerWinner: true,
          wouldChangeDisplayCandidate: false,
          stage1SelectedCandidateIds: stage1Ids,
          legacyPreviewPoolCandidateIds: [...stage1Ids],
          stage2Top2CandidateIds: [WINNER, RUNNER_UP],
          workerWinnerCandidateUserId: RUNNER_UP,
          hasLegacyContext: true,
        }),
      ).toBe("twenty_d_ranking");
    });

    it("missing legacy context → unknown", () => {
      expect(hasLegacyComparisonContext(undefined)).toBe(false);
      expect(
        computeDifferenceStage({
          finalSelectedCandidateId: WINNER,
          wouldChange20DWinner: false,
          wouldChangeLegacyMatchResult: false,
          wouldChangeWorkerWinner: false,
          wouldChangeDisplayCandidate: false,
          stage1SelectedCandidateIds: stage1Ids,
          legacyPreviewPoolCandidateIds: [],
          stage2Top2CandidateIds: [WINNER, RUNNER_UP],
          workerWinnerCandidateUserId: null,
          hasLegacyContext: false,
        }),
      ).toBe("unknown");
    });

    it("missing final selected → unknown", () => {
      expect(
        computeDifferenceStage({
          finalSelectedCandidateId: null,
          wouldChange20DWinner: false,
          wouldChangeLegacyMatchResult: false,
          wouldChangeWorkerWinner: false,
          wouldChangeDisplayCandidate: false,
          stage1SelectedCandidateIds: stage1Ids,
          legacyPreviewPoolCandidateIds: [...stage1Ids],
          stage2Top2CandidateIds: [WINNER, RUNNER_UP],
          workerWinnerCandidateUserId: WINNER,
          hasLegacyContext: true,
        }),
      ).toBe("unknown");
    });
  });
});
