import {
  PHOTO_FIRST_MUTUAL_MATCHING_SCHEMA_VERSION,
  PHOTO_FIRST_MUTUAL_MATCHING_SOURCE_VERSION,
  type PhotoVisualCandidateInput,
  type PhotoVisualPoolInputV1,
} from "../src/modules/onboarding/vision/p76-photovisual-first-pool.types";
import { buildPhotoFirstMutualMatchingShadowV1 } from "../src/modules/onboarding/vision/p76-photovisual-first-pool-shadow";

function okVision(tags: string[]) {
  return {
    visionStatus: "ok" as const,
    photoVisualTags: tags,
    provider: "zhipu",
    sourceVersion: "p7.5-cloud-vision-v1",
  };
}

function passGates(
  overrides: Partial<PhotoVisualCandidateInput["gates"]> = {},
): PhotoVisualCandidateInput["gates"] {
  return {
    isSelf: false,
    genderGatePassed: true,
    preferenceGatePassed: true,
    reviewUsable: true,
    detectionUsable: true,
    userBlocked: false,
    missingProfile: false,
    ...overrides,
  };
}

function candidate(
  id: string,
  styleTags: string[],
  photoTags: string[],
  gates = passGates(),
): PhotoVisualCandidateInput {
  return {
    candidateUserId: id,
    candidateStyleTags: styleTags,
    candidateVision: okVision(photoTags),
    gates,
  };
}

function baseInput(
  overrides: Partial<PhotoVisualPoolInputV1> = {},
): PhotoVisualPoolInputV1 {
  return {
    viewerUserId: "viewer-1",
    viewerStyleTags: ["tag-a", "tag-b"],
    viewerVision: okVision(["tag-x", "tag-y"]),
    candidates: [],
    sourcePoolType: "onboarding_gated_cohort",
    poolId: "pool-1",
    generatedAt: "2026-05-16T00:00:00.000Z",
    ...overrides,
  };
}

describe("p76 photovisual first pool shadow", () => {
  it("eligible candidates sorted by mutual desc", () => {
    const shadow = buildPhotoFirstMutualMatchingShadowV1(
      baseInput({
        candidates: [
          candidate("low", ["tag-a"], ["tag-a"]),
          candidate("high", ["tag-a", "tag-b"], ["tag-a", "tag-b"]),
        ],
      }),
    );
    expect(shadow.stage1PhotoVisualPool.selectedCandidateIds).toEqual([
      "high",
      "low",
    ]);
  });

  it("mutual tie by AtoB desc", () => {
    const shadow = buildPhotoFirstMutualMatchingShadowV1(
      baseInput({
        viewerStyleTags: ["s1"],
        viewerVision: okVision(["p1"]),
        candidates: [
          candidate("low-atob", [], ["s1"]),
          candidate("high-atob", ["p1"], ["none"]),
        ],
      }),
    );
    expect(shadow.stage1PhotoVisualPool.selectedCandidateIds[0]).toBe(
      "low-atob",
    );
  });

  it("mutual + AtoB tie by candidateUserId asc", () => {
    const shadow = buildPhotoFirstMutualMatchingShadowV1(
      baseInput({
        candidates: [
          candidate("z-id", ["tag-a"], ["tag-a"]),
          candidate("a-id", ["tag-a"], ["tag-a"]),
        ],
      }),
    );
    expect(shadow.stage1PhotoVisualPool.selectedCandidateIds).toEqual([
      "a-id",
      "z-id",
    ]);
  });

  it("selectionLimit respected", () => {
    const shadow = buildPhotoFirstMutualMatchingShadowV1(
      baseInput({
        selectionLimit: 1,
        candidates: [
          candidate("c1", ["tag-a"], ["tag-a"]),
          candidate("c2", ["tag-b"], ["tag-b"]),
        ],
      }),
    );
    expect(shadow.stage1PhotoVisualPool.selectedCandidateIds).toHaveLength(1);
  });

  it("ineligible pairs retained in pairs", () => {
    const shadow = buildPhotoFirstMutualMatchingShadowV1(
      baseInput({
        candidates: [
          candidate("blocked", ["tag-a"], ["tag-a"], passGates({ userBlocked: true })),
          candidate("ok", ["tag-a"], ["tag-a"]),
        ],
      }),
    );
    expect(shadow.stage1PhotoVisualPool.pairs).toHaveLength(2);
    const blocked = shadow.stage1PhotoVisualPool.pairs.find(
      (p) => p.candidateUserId === "blocked",
    );
    expect(blocked?.eligible).toBe(false);
    expect(blocked?.mutualPhotoVisualFit).toBeNull();
  });

  it("ineligible not included in selectedCandidateIds", () => {
    const shadow = buildPhotoFirstMutualMatchingShadowV1(
      baseInput({
        candidates: [
          candidate("bad", ["tag-a"], ["tag-a"], passGates({ isSelf: true })),
          candidate("good", ["tag-a"], ["tag-a"]),
        ],
      }),
    );
    expect(shadow.stage1PhotoVisualPool.selectedCandidateIds).toEqual(["good"]);
  });

  it("all applied flags false", () => {
    const shadow = buildPhotoFirstMutualMatchingShadowV1(
      baseInput({
        candidates: [candidate("c1", ["tag-a"], ["tag-a"])],
      }),
    );
    expect(shadow.stage1PhotoVisualPool.appliedToPool).toBe(false);
    expect(shadow.finalShadow.applied).toBe(false);
    expect(shadow.finalShadow.appliedToPool).toBe(false);
    expect(shadow.finalShadow.appliedToFinalScore).toBe(false);
    expect(shadow.finalShadow.appliedToMatchResult).toBe(false);
    expect(shadow.finalShadow.appliedToWorkerRanking).toBe(false);
  });

  it("no throw when qualityTags / sceneTags missing", () => {
    const shadow = buildPhotoFirstMutualMatchingShadowV1(
      baseInput({
        viewerVision: {
          visionStatus: "ok",
          photoVisualTags: ["tag-x"],
        },
        candidates: [
          {
            candidateUserId: "c1",
            candidateStyleTags: ["tag-a"],
            candidateVision: {
              visionStatus: "ok",
              photoVisualTags: ["tag-a"],
            },
            gates: passGates(),
          },
        ],
      }),
    );
    expect(shadow.stage1PhotoVisualPool.selectedCandidateIds).toEqual(["c1"]);
  });

  it("empty candidates → selectedCandidateIds=[]", () => {
    const shadow = buildPhotoFirstMutualMatchingShadowV1(baseInput());
    expect(shadow.stage1PhotoVisualPool.selectedCandidateIds).toEqual([]);
    expect(shadow.stage1PhotoVisualPool.eligibleCandidatesCount).toBe(0);
  });

  it("sourceVersion/schemaVersion fixed", () => {
    const shadow = buildPhotoFirstMutualMatchingShadowV1(baseInput());
    expect(shadow.schemaVersion).toBe(PHOTO_FIRST_MUTUAL_MATCHING_SCHEMA_VERSION);
    expect(shadow.sourceVersion).toBe(PHOTO_FIRST_MUTUAL_MATCHING_SOURCE_VERSION);
  });

  it("sourcePoolType only onboarding_gated_cohort", () => {
    const shadow = buildPhotoFirstMutualMatchingShadowV1(baseInput());
    expect(shadow.sourcePoolType).toBe("onboarding_gated_cohort");
    expect(() =>
      buildPhotoFirstMutualMatchingShadowV1({
        ...baseInput(),
        // @ts-expect-error r3a rejects non-A pool types at runtime
        sourcePoolType: "legacy_preview_pool",
      }),
    ).toThrow(/onboarding_gated_cohort/);
  });
});
