import {
  RRM_TOP2_FINAL_SELECTOR_SCHEMA_VERSION,
  RRM_TOP2_FINAL_SELECTOR_SOURCE_VERSION,
  type RrmTop2CandidateInputV1,
  type RrmTop2FinalSelectorInputV1,
} from "../src/modules/matching/p76-rrm-top2-final-selector.types";
import { buildRrmTop2FinalSelectorShadowV1 } from "../src/modules/matching/p76-rrm-top2-final-selector-shadow";

const TOP2 = ["cmfemn00100016z64seed0001", "cmfemn003000506z64seed0003"] as const;
const WINNER_20D = "cmfemn00100016z64seed0001";

function candidate(
  id: string,
  scores: {
    rhythmScoreAtoB: number | null;
    rhythmScoreBtoA: number | null;
    rhythmRiskFlags?: string[];
    pressureRiskFlags?: string[];
    boundaryRiskFlags?: string[];
    repairPotentialSignals?: string[];
    repairPotentialScore?: number;
  },
): RrmTop2CandidateInputV1 {
  return {
    candidateUserId: id,
    rhythmScoreAtoB: scores.rhythmScoreAtoB,
    rhythmScoreBtoA: scores.rhythmScoreBtoA,
    rhythmRiskFlags: scores.rhythmRiskFlags,
    pressureRiskFlags: scores.pressureRiskFlags,
    boundaryRiskFlags: scores.boundaryRiskFlags,
    repairPotentialSignals: scores.repairPotentialSignals,
    repairPotentialScore: scores.repairPotentialScore,
  };
}

function baseInput(
  overrides: Partial<RrmTop2FinalSelectorInputV1> = {},
): RrmTop2FinalSelectorInputV1 {
  return {
    viewerUserId: "cmo7ksq8s00006znosryc9k0n",
    sourcePoolType: "onboarding_gated_cohort",
    generatedAt: "2026-05-16T14:00:00.000Z",
    stage1: {
      sourceVersion: "p7.6-r3-photovisual-first-pool-shadow-v1",
      selectedCandidateIds: [
        "cmfemn002000306z64seed0002",
        "cmfemn003000506z64seed0003",
        "cmr4hm001016z64demo00m05a",
        WINNER_20D,
        "cmr4hf000716z64demo00f04a",
        "cmr4hf000916z64demo00f05a",
      ],
    },
    stage2TwentyD: {
      sourceVersion: "p7.6-r4a-20d-bidirectional-ranking-shadow-v1",
      top2CandidateIds: [...TOP2],
      selectedBy20DOnlyCandidateId: WINNER_20D,
    },
    viewerRrmProfilePresent: true,
    candidates: [],
    ...overrides,
  };
}

const SENSITIVE_KEYS = [
  "dimensionBranchChatHints",
  "effectiveProfileChatOverlayV1",
  "rawProfile",
  "vendorRaw",
];

describe("p76 rrm top2 final selector shadow", () => {
  it("top2 normal → selectedByRrmCandidateId non-empty", () => {
    const shadow = buildRrmTop2FinalSelectorShadowV1(
      baseInput({
        candidates: [
          candidate(WINNER_20D, {
            rhythmScoreAtoB: 0.92,
            rhythmScoreBtoA: 0.32,
          }),
          candidate("cmfemn003000506z64seed0003", {
            rhythmScoreAtoB: 0.91,
            rhythmScoreBtoA: 0.31,
            rhythmRiskFlags: ["pace_mismatch"],
          }),
        ],
      }),
    );

    expect(shadow.schemaVersion).toBe(RRM_TOP2_FINAL_SELECTOR_SCHEMA_VERSION);
    expect(shadow.sourceVersion).toBe(RRM_TOP2_FINAL_SELECTOR_SOURCE_VERSION);
    expect(shadow.stage3Rrm.evaluatedCandidateIds).toEqual([...TOP2]);
    expect(shadow.stage3Rrm.selectedByRrmCandidateId).toBeTruthy();
    expect(shadow.stage3Rrm.rankedCandidates).toHaveLength(2);
    expect(shadow.finalShadow.stage3SelectedCandidateId).toBe(
      shadow.stage3Rrm.selectedByRrmCandidateId,
    );
  });

  it("RRM winner same as 20D → wouldChange20DWinner=false", () => {
    const shadow = buildRrmTop2FinalSelectorShadowV1(
      baseInput({
        candidates: [
          candidate(WINNER_20D, {
            rhythmScoreAtoB: 0.95,
            rhythmScoreBtoA: 0.9,
          }),
          candidate("cmfemn003000506z64seed0003", {
            rhythmScoreAtoB: 0.5,
            rhythmScoreBtoA: 0.5,
            rhythmRiskFlags: ["high_pressure"],
            pressureRiskFlags: ["boundary"],
            boundaryRiskFlags: ["overstep"],
          }),
        ],
      }),
    );

    expect(shadow.stage3Rrm.selectedByRrmCandidateId).toBe(WINNER_20D);
    expect(shadow.stage3Rrm.wouldChange20DWinner).toBe(false);
  });

  it("RRM winner differs from 20D → wouldChange20DWinner=true", () => {
    const shadow = buildRrmTop2FinalSelectorShadowV1(
      baseInput({
        candidates: [
          candidate(WINNER_20D, {
            rhythmScoreAtoB: 0.5,
            rhythmScoreBtoA: 0.5,
            rhythmRiskFlags: ["a", "b", "c"],
            pressureRiskFlags: ["p"],
            boundaryRiskFlags: ["x"],
          }),
          candidate("cmfemn003000506z64seed0003", {
            rhythmScoreAtoB: 0.92,
            rhythmScoreBtoA: 0.88,
            repairPotentialSignals: ["strong_repair"],
            repairPotentialScore: 0.9,
          }),
        ],
      }),
    );

    expect(shadow.stage3Rrm.selectedByRrmCandidateId).toBe(
      "cmfemn003000506z64seed0003",
    );
    expect(shadow.stage3Rrm.wouldChange20DWinner).toBe(true);
  });

  it("top2 fewer than 2 → TOP2_NOT_AVAILABLE", () => {
    const shadow = buildRrmTop2FinalSelectorShadowV1(
      baseInput({
        stage2TwentyD: {
          sourceVersion: "p7.6-r4a-20d-bidirectional-ranking-shadow-v1",
          top2CandidateIds: [WINNER_20D],
          selectedBy20DOnlyCandidateId: WINNER_20D,
        },
        candidates: [
          candidate(WINNER_20D, {
            rhythmScoreAtoB: 0.8,
            rhythmScoreBtoA: 0.8,
          }),
        ],
      }),
    );

    expect(shadow.stage3Rrm.evaluatedCandidateIds).toEqual([]);
    expect(shadow.stage3Rrm.selectedByRrmCandidateId).toBeNull();
    expect(shadow.stage3Rrm.reasonSummary).toContain("top2_not_available");
  });

  it("viewer RRM profile missing → fallback to 20D winner", () => {
    const shadow = buildRrmTop2FinalSelectorShadowV1(
      baseInput({
        viewerRrmProfilePresent: false,
        candidates: [
          candidate(WINNER_20D, {
            rhythmScoreAtoB: 0.9,
            rhythmScoreBtoA: 0.9,
          }),
          candidate("cmfemn003000506z64seed0003", {
            rhythmScoreAtoB: 0.3,
            rhythmScoreBtoA: 0.3,
          }),
        ],
      }),
    );

    expect(shadow.stage3Rrm.selectedByRrmCandidateId).toBe(WINNER_20D);
    expect(shadow.stage3Rrm.wouldChange20DWinner).toBe(false);
    expect(
      shadow.stage3Rrm.rankedCandidates.every((r) => !r.eligible),
    ).toBe(true);
    expect(
      shadow.stage3Rrm.rankedCandidates[0]?.ineligibleReasons,
    ).toContain("VIEWER_RRM_PROFILE_MISSING");
  });

  it("candidate RRM profile missing → candidate ineligible", () => {
    const shadow = buildRrmTop2FinalSelectorShadowV1(
      baseInput({
        candidates: [
          candidate(WINNER_20D, {
            rhythmScoreAtoB: 0.85,
            rhythmScoreBtoA: 0.85,
          }),
          candidate("cmfemn003000506z64seed0003", {
            rhythmScoreAtoB: null,
            rhythmScoreBtoA: 0.8,
          }),
        ],
      }),
    );

    const missing = shadow.stage3Rrm.rankedCandidates.find(
      (r) => r.candidateUserId === "cmfemn003000506z64seed0003",
    );
    expect(missing?.eligible).toBe(false);
    expect(missing?.fallbackReason).toBe("CANDIDATE_RRM_PROFILE_MISSING");
    expect(shadow.stage3Rrm.selectedByRrmCandidateId).toBe(WINNER_20D);
  });

  it("invalid score input does not throw", () => {
    expect(() =>
      buildRrmTop2FinalSelectorShadowV1(
        baseInput({
          candidates: [
            candidate(WINNER_20D, {
              rhythmScoreAtoB: Number.NaN,
              rhythmScoreBtoA: 0.8,
            }),
            candidate("cmfemn003000506z64seed0003", {
              rhythmScoreAtoB: 0.8,
              rhythmScoreBtoA: 0.8,
            }),
          ],
        }),
      ),
    ).not.toThrow();

    const shadow = buildRrmTop2FinalSelectorShadowV1(
      baseInput({
        candidates: [
          candidate(WINNER_20D, {
            rhythmScoreAtoB: Number.NaN,
            rhythmScoreBtoA: 0.8,
          }),
          candidate("cmfemn003000506z64seed0003", {
            rhythmScoreAtoB: 0.8,
            rhythmScoreBtoA: 0.8,
          }),
        ],
      }),
    );
    const bad = shadow.stage3Rrm.rankedCandidates.find(
      (r) => r.candidateUserId === WINNER_20D,
    );
    expect(bad?.eligible).toBe(false);
    expect(bad?.ineligibleReasons).toContain("RRM_INPUT_INVALID");
  });

  it("RRM_INSUFFICIENT_SIGNAL ties fallback to 20D winner", () => {
    const shadow = buildRrmTop2FinalSelectorShadowV1(
      baseInput({
        candidates: [
          candidate(WINNER_20D, {
            rhythmScoreAtoB: 0.7,
            rhythmScoreBtoA: 0.7,
            repairPotentialScore: 0.4,
          }),
          candidate("cmfemn003000506z64seed0003", {
            rhythmScoreAtoB: 0.7,
            rhythmScoreBtoA: 0.7,
            repairPotentialScore: 0.4,
          }),
        ],
      }),
    );

    expect(shadow.stage3Rrm.selectedByRrmCandidateId).toBe(WINNER_20D);
    expect(shadow.stage3Rrm.wouldChange20DWinner).toBe(false);
    expect(shadow.stage3Rrm.reasonSummary).toContain("insufficient_signal");
  });

  it("all applied flags false", () => {
    const shadow = buildRrmTop2FinalSelectorShadowV1(
      baseInput({
        candidates: [
          candidate(WINNER_20D, {
            rhythmScoreAtoB: 0.8,
            rhythmScoreBtoA: 0.8,
          }),
          candidate("cmfemn003000506z64seed0003", {
            rhythmScoreAtoB: 0.7,
            rhythmScoreBtoA: 0.7,
          }),
        ],
      }),
    );

    expect(shadow.finalShadow.applied).toBe(false);
    expect(shadow.finalShadow.appliedToPool).toBe(false);
    expect(shadow.finalShadow.appliedToFinalScore).toBe(false);
    expect(shadow.finalShadow.appliedToMatchResult).toBe(false);
    expect(shadow.finalShadow.appliedToWorkerRanking).toBe(false);
    expect(shadow.stage3Rrm.appliedToMatchResult).toBe(false);
  });

  it("does not output sensitive raw profile fields", () => {
    const shadow = buildRrmTop2FinalSelectorShadowV1(
      baseInput({
        candidates: [
          candidate(WINNER_20D, {
            rhythmScoreAtoB: 0.8,
            rhythmScoreBtoA: 0.8,
          }),
          candidate("cmfemn003000506z64seed0003", {
            rhythmScoreAtoB: 0.75,
            rhythmScoreBtoA: 0.75,
          }),
        ],
      }),
    );

    const serialized = JSON.stringify(shadow);
    for (const key of SENSITIVE_KEYS) {
      expect(serialized).not.toContain(key);
    }
  });
});
