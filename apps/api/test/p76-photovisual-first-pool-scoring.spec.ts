import {
  computeAtoBPhotoVisualFit,
  computeBtoAPhotoVisualFit,
  computeMutualPhotoVisualFit,
  harmonicMeanMutualPhotoVisualFit,
  sortPhotoVisualPairs,
} from "../src/modules/onboarding/vision/p76-photovisual-first-pool-scoring";
import {
  overlapTags,
  tagJaccard,
} from "../src/modules/onboarding/vision/visual-ranking-shadow-scoring";

describe("p76 photovisual first pool scoring", () => {
  it("full overlap = 1", () => {
    const tags = ["清爽自然", "生活感"];
    expect(computeAtoBPhotoVisualFit(tags, tags)).toBe(1);
    expect(computeBtoAPhotoVisualFit(tags, tags)).toBe(1);
  });

  it("no overlap = 0", () => {
    expect(computeAtoBPhotoVisualFit(["a"], ["b"])).toBe(0);
    expect(computeBtoAPhotoVisualFit(["x"], ["y"])).toBe(0);
  });

  it("partial overlap", () => {
    const score = computeAtoBPhotoVisualFit(
      ["a", "b", "c"],
      ["b", "c", "d"],
    );
    expect(score).toBeCloseTo(2 / 4, 5);
  });

  it("empty viewer tags = 0", () => {
    expect(computeAtoBPhotoVisualFit([], ["a"])).toBe(0);
  });

  it("empty candidate tags = 0", () => {
    expect(computeAtoBPhotoVisualFit(["a"], [])).toBe(0);
  });

  it("mutual average", () => {
    const mutual = computeMutualPhotoVisualFit(0.8, 0.4);
    expect(mutual).toBeCloseTo(0.6, 5);
  });

  it("harmonicMean optional", () => {
    expect(harmonicMeanMutualPhotoVisualFit(0.8, 0.4)).toBeCloseTo(
      (2 * 0.8 * 0.4) / 1.2,
      5,
    );
    expect(harmonicMeanMutualPhotoVisualFit(0, 0.5)).toBe(0);
  });

  it("trim / dedupe consistent with tagJaccard", () => {
    const a = [" 清爽自然 ", "清爽自然", ""];
    const b = ["生活感", " 生活感"];
    expect(computeAtoBPhotoVisualFit(a, b)).toBe(tagJaccard(a, b));
    expect(overlapTags(a, b)).toEqual([]);
  });

  it("sorting mutual desc", () => {
    const sorted = sortPhotoVisualPairs([
      {
        candidateUserId: "c-low",
        AtoBPhotoVisualFit: 1,
        BtoAPhotoVisualFit: 0,
        mutualPhotoVisualFit: 0.5,
      },
      {
        candidateUserId: "c-high",
        AtoBPhotoVisualFit: 1,
        BtoAPhotoVisualFit: 1,
        mutualPhotoVisualFit: 1,
      },
    ]);
    expect(sorted.map((p) => p.candidateUserId)).toEqual(["c-high", "c-low"]);
  });

  it("sorting tie by AtoB desc", () => {
    const sorted = sortPhotoVisualPairs([
      {
        candidateUserId: "b",
        AtoBPhotoVisualFit: 0.5,
        BtoAPhotoVisualFit: 1,
        mutualPhotoVisualFit: 0.75,
      },
      {
        candidateUserId: "a",
        AtoBPhotoVisualFit: 1,
        BtoAPhotoVisualFit: 0.5,
        mutualPhotoVisualFit: 0.75,
      },
    ]);
    expect(sorted.map((p) => p.candidateUserId)).toEqual(["a", "b"]);
  });

  it("sorting tie by candidateUserId asc", () => {
    const sorted = sortPhotoVisualPairs([
      {
        candidateUserId: "z-user",
        AtoBPhotoVisualFit: 0.6,
        BtoAPhotoVisualFit: 0.6,
        mutualPhotoVisualFit: 0.6,
      },
      {
        candidateUserId: "a-user",
        AtoBPhotoVisualFit: 0.6,
        BtoAPhotoVisualFit: 0.6,
        mutualPhotoVisualFit: 0.6,
      },
    ]);
    expect(sorted.map((p) => p.candidateUserId)).toEqual([
      "a-user",
      "z-user",
    ]);
  });
});
