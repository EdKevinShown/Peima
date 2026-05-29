import {
  TWENTY_D_BIDIRECTIONAL_RANKING_SCHEMA_VERSION,
  TWENTY_D_BIDIRECTIONAL_RANKING_SOURCE_VERSION,
  type TwentyDBidirectionalRankingInputV1,
  type TwentyDCandidateInputV1,
} from "../src/modules/matching/p76-20d-bidirectional-ranking.types";
import { buildTwentyDBidirectionalRankingShadowV1 } from "../src/modules/matching/p76-20d-bidirectional-ranking-shadow";
import { computeMutual20DFit } from "../src/modules/matching/p76-20d-bidirectional-ranking-scoring";

const STAGE1_IDS = [
  "cmfemn002000306z64seed0002",
  "cmfemn003000506z64seed0003",
  "cmr4hm001016z64demo00m05a",
  "cmfemn00100016z64seed0001",
  "cmr4hf000716z64demo00f04a",
  "cmr4hf000916z64demo00f05a",
];

function candidate(
  id: string,
  scores: {
    profileScoreAtoB: number;
    preferenceScoreAtoB: number;
    profileScoreBtoA: number;
    preferenceScoreBtoA: number;
  },
): TwentyDCandidateInputV1 {
  return {
    candidateUserId: id,
    ...scores,
  };
}

function baseInput(
  overrides: Partial<TwentyDBidirectionalRankingInputV1> = {},
): TwentyDBidirectionalRankingInputV1 {
  return {
    viewerUserId: "cmo7ksq8s00006znosryc9k0n",
    sourcePoolType: "onboarding_gated_cohort",
    generatedAt: "2026-05-16T12:00:00.000Z",
    stage1: {
      sourceVersion: "p7.6-r3-photovisual-first-pool-shadow-v1",
      selectedCandidateIds: [...STAGE1_IDS],
      poolId: "p76-r4a-test",
    },
    viewerProfilePresent: true,
    candidates: [],
    ...overrides,
  };
}

describe("p76 20d bidirectional ranking shadow", () => {
  it("rankedCandidates and top2 output", () => {
    const shadow = buildTwentyDBidirectionalRankingShadowV1(
      baseInput({
        candidates: [
          candidate("c-low", {
            profileScoreAtoB: 0.3,
            preferenceScoreAtoB: 0.3,
            profileScoreBtoA: 0.3,
            preferenceScoreBtoA: 0.3,
          }),
          candidate("c-high", {
            profileScoreAtoB: 0.9,
            preferenceScoreAtoB: 0.9,
            profileScoreBtoA: 0.9,
            preferenceScoreBtoA: 0.9,
          }),
        ],
        stage1: {
          sourceVersion: "p7.6-r3-photovisual-first-pool-shadow-v1",
          selectedCandidateIds: ["c-low", "c-high"],
        },
      }),
    );

    expect(shadow.stage2TwentyD.rankedCandidates).toHaveLength(2);
    expect(shadow.stage2TwentyD.top2CandidateIds).toEqual(["c-high", "c-low"]);
    expect(shadow.stage2TwentyD.selectedBy20DOnlyCandidateId).toBe("c-high");

    const high = shadow.stage2TwentyD.rankedCandidates.find(
      (r) => r.candidateUserId === "c-high",
    );
    expect(high?.eligible).toBe(true);
    expect(high?.mutual20DFit).not.toBeNull();
    expect(high?.rank).toBe(1);
  });

  it("selectedBy20DOnlyCandidateId is first of top2", () => {
    const shadow = buildTwentyDBidirectionalRankingShadowV1(
      baseInput({
        candidates: [
          candidate("first", {
            profileScoreAtoB: 0.8,
            preferenceScoreAtoB: 0.8,
            profileScoreBtoA: 0.8,
            preferenceScoreBtoA: 0.8,
          }),
          candidate("second", {
            profileScoreAtoB: 0.6,
            preferenceScoreAtoB: 0.6,
            profileScoreBtoA: 0.6,
            preferenceScoreBtoA: 0.6,
          }),
        ],
        stage1: {
          sourceVersion: "x",
          selectedCandidateIds: ["first", "second"],
        },
      }),
    );
    expect(shadow.stage2TwentyD.selectedBy20DOnlyCandidateId).toBe("first");
  });

  it("missing viewer profile → top2 empty", () => {
    const shadow = buildTwentyDBidirectionalRankingShadowV1(
      baseInput({
        viewerProfilePresent: false,
        candidates: [
          candidate("c1", {
            profileScoreAtoB: 0.5,
            preferenceScoreAtoB: 0.5,
            profileScoreBtoA: 0.5,
            preferenceScoreBtoA: 0.5,
          }),
        ],
        stage1: {
          sourceVersion: "x",
          selectedCandidateIds: ["c1"],
        },
      }),
    );
    expect(shadow.stage2TwentyD.top2CandidateIds).toEqual([]);
    expect(shadow.stage2TwentyD.selectedBy20DOnlyCandidateId).toBeNull();
    expect(
      shadow.stage2TwentyD.rankedCandidates.every((r) => !r.eligible),
    ).toBe(true);
  });

  it("missing candidate profile → candidate fallback", () => {
    const shadow = buildTwentyDBidirectionalRankingShadowV1(
      baseInput({
        candidates: [
          {
            candidateUserId: "bad",
            profileScoreAtoB: null,
            preferenceScoreAtoB: 0.5,
            profileScoreBtoA: 0.5,
            preferenceScoreBtoA: 0.5,
          },
          candidate("good", {
            profileScoreAtoB: 0.7,
            preferenceScoreAtoB: 0.7,
            profileScoreBtoA: 0.7,
            preferenceScoreBtoA: 0.7,
          }),
        ],
        stage1: {
          sourceVersion: "x",
          selectedCandidateIds: ["bad", "good"],
        },
      }),
    );
    const bad = shadow.stage2TwentyD.rankedCandidates.find(
      (r) => r.candidateUserId === "bad",
    );
    expect(bad?.eligible).toBe(false);
    expect(bad?.mutual20DFit).toBeNull();
    expect(bad?.ineligibleReasons).toContain("CANDIDATE_PROFILE_MISSING");
    expect(shadow.stage2TwentyD.top2CandidateIds).toEqual(["good"]);
  });

  it("invalid score input does not throw", () => {
    expect(() =>
      buildTwentyDBidirectionalRankingShadowV1(
        baseInput({
          candidates: [
            {
              candidateUserId: "nan",
              profileScoreAtoB: Number.NaN,
              preferenceScoreAtoB: 0.5,
              profileScoreBtoA: 0.5,
              preferenceScoreBtoA: 0.5,
            },
          ],
          stage1: {
            sourceVersion: "x",
            selectedCandidateIds: ["nan"],
          },
        }),
      ),
    ).not.toThrow();
  });

  it("all applied flags false", () => {
    const shadow = buildTwentyDBidirectionalRankingShadowV1(
      baseInput({
        candidates: [
          candidate("c1", {
            profileScoreAtoB: 0.5,
            preferenceScoreAtoB: 0.5,
            profileScoreBtoA: 0.5,
            preferenceScoreBtoA: 0.5,
          }),
        ],
        stage1: {
          sourceVersion: "x",
          selectedCandidateIds: ["c1"],
        },
      }),
    );
    expect(shadow.stage2TwentyD.appliedToFinalScore).toBe(false);
    expect(shadow.finalShadow.applied).toBe(false);
    expect(shadow.finalShadow.appliedToPool).toBe(false);
    expect(shadow.finalShadow.appliedToFinalScore).toBe(false);
    expect(shadow.finalShadow.appliedToMatchResult).toBe(false);
    expect(shadow.finalShadow.appliedToWorkerRanking).toBe(false);
  });

  it("only consumes provided Stage 1 candidate ids", () => {
    const ids = ["only-a", "only-b"];
    const shadow = buildTwentyDBidirectionalRankingShadowV1(
      baseInput({
        stage1: {
          sourceVersion: "x",
          selectedCandidateIds: ids,
        },
        candidates: ids.map((id) =>
          candidate(id, {
            profileScoreAtoB: 0.5,
            preferenceScoreAtoB: 0.5,
            profileScoreBtoA: 0.5,
            preferenceScoreBtoA: 0.5,
          }),
        ),
      }),
    );
    expect(shadow.stage1.selectedCandidateIds).toEqual(ids);
    expect(
      shadow.stage2TwentyD.rankedCandidates.map((r) => r.candidateUserId).sort(),
    ).toEqual(ids.sort());
  });

  it("empty candidates → top2CandidateIds=[]", () => {
    const shadow = buildTwentyDBidirectionalRankingShadowV1(
      baseInput({
        candidates: [],
        stage1: {
          sourceVersion: "x",
          selectedCandidateIds: [],
        },
      }),
    );
    expect(shadow.stage2TwentyD.top2CandidateIds).toEqual([]);
    expect(shadow.stage2TwentyD.topNCandidateIds).toEqual([]);
  });

  it("schemaVersion and sourceVersion fixed", () => {
    const shadow = buildTwentyDBidirectionalRankingShadowV1(baseInput());
    expect(shadow.schemaVersion).toBe(TWENTY_D_BIDIRECTIONAL_RANKING_SCHEMA_VERSION);
    expect(shadow.sourceVersion).toBe(TWENTY_D_BIDIRECTIONAL_RANKING_SOURCE_VERSION);
  });

  it("harmonic mutual used in ranking", () => {
    const aToB = 0.8;
    const bToA = 0.2;
    const mutual = computeMutual20DFit(aToB, bToA);
    const shadow = buildTwentyDBidirectionalRankingShadowV1(
      baseInput({
        candidates: [
          candidate("asym", {
            profileScoreAtoB: aToB,
            preferenceScoreAtoB: aToB,
            profileScoreBtoA: bToA,
            preferenceScoreBtoA: bToA,
          }),
          candidate("sym", {
            profileScoreAtoB: 0.6,
            preferenceScoreAtoB: 0.6,
            profileScoreBtoA: 0.6,
            preferenceScoreBtoA: 0.6,
          }),
        ],
        stage1: {
          sourceVersion: "x",
          selectedCandidateIds: ["asym", "sym"],
        },
      }),
    );
    const asym = shadow.stage2TwentyD.rankedCandidates.find(
      (r) => r.candidateUserId === "asym",
    );
    expect(asym?.mutual20DFit).toBeCloseTo(mutual, 5);
  });

  it("sourcePoolType only onboarding_gated_cohort", () => {
    expect(() =>
      buildTwentyDBidirectionalRankingShadowV1({
        ...baseInput(),
        // @ts-expect-error r4a rejects non-A pool types
        sourcePoolType: "legacy_preview_pool",
      }),
    ).toThrow(/onboarding_gated_cohort/);
  });
});
