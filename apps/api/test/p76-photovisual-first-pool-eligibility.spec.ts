import {
  buildIneligibleReasons,
  evaluatePhotoVisualPairEligibility,
} from "../src/modules/onboarding/vision/p76-photovisual-first-pool-eligibility";
import type {
  PhotoVisualPairEligibilityInput,
  UsableVisionInput,
} from "../src/modules/onboarding/vision/p76-photovisual-first-pool.types";

function okVision(overrides: Partial<UsableVisionInput> = {}): UsableVisionInput {
  return {
    visionStatus: "ok",
    photoVisualTags: ["清爽自然"],
    ...overrides,
  };
}

function baseInput(
  overrides: Partial<PhotoVisualPairEligibilityInput> = {},
): PhotoVisualPairEligibilityInput {
  return {
    viewerUserId: "viewer-1",
    viewerStyleTags: ["生活感"],
    viewerVision: okVision({ photoVisualTags: ["精致感"] }),
    candidateUserId: "candidate-1",
    candidateStyleTags: ["生活感"],
    candidateVision: okVision(),
    gates: {
      isSelf: false,
      genderGatePassed: true,
      preferenceGatePassed: true,
      reviewUsable: true,
      detectionUsable: true,
      userBlocked: false,
      missingProfile: false,
    },
    ...overrides,
  };
}

describe("p76 photovisual first pool eligibility", () => {
  const reasonCases: Array<{
    name: string;
    patch: Partial<PhotoVisualPairEligibilityInput>;
    expected: string;
  }> = [
    {
      name: "SELF",
      patch: { gates: { ...baseInput().gates, isSelf: true } },
      expected: "SELF",
    },
    {
      name: "GENDER_GATE",
      patch: {
        gates: { ...baseInput().gates, genderGatePassed: false },
      },
      expected: "GENDER_GATE",
    },
    {
      name: "PREFERENCE_GATE",
      patch: {
        gates: { ...baseInput().gates, preferenceGatePassed: false },
      },
      expected: "PREFERENCE_GATE",
    },
    {
      name: "REVIEW_BLOCKED",
      patch: {
        gates: { ...baseInput().gates, reviewUsable: false },
      },
      expected: "REVIEW_BLOCKED",
    },
    {
      name: "DETECTION_UNAVAILABLE",
      patch: {
        gates: { ...baseInput().gates, detectionUsable: false },
      },
      expected: "DETECTION_UNAVAILABLE",
    },
    {
      name: "VISION_NOT_OK",
      patch: {
        candidateVision: okVision({ visionStatus: "failed" }),
      },
      expected: "VISION_NOT_OK",
    },
    {
      name: "EMPTY_PHOTO_VISUAL_TAGS",
      patch: {
        candidateVision: okVision({ photoVisualTags: [] }),
      },
      expected: "EMPTY_PHOTO_VISUAL_TAGS",
    },
    {
      name: "VIEWER_VISION_MISSING",
      patch: { viewerVision: null },
      expected: "VIEWER_VISION_MISSING",
    },
    {
      name: "USER_BLOCKED",
      patch: {
        gates: { ...baseInput().gates, userBlocked: true },
      },
      expected: "USER_BLOCKED",
    },
    {
      name: "MISSING_PROFILE",
      patch: {
        gates: { ...baseInput().gates, missingProfile: true },
      },
      expected: "MISSING_PROFILE",
    },
    {
      name: "MISSING_STYLE_TAGS",
      patch: {
        viewerStyleTags: [],
        candidateStyleTags: [],
      },
      expected: "MISSING_STYLE_TAGS",
    },
  ];

  it.each(reasonCases)(
    "flags $name",
    ({ patch, expected }) => {
      const reasons = buildIneligibleReasons(baseInput(patch));
      expect(reasons).toContain(expected);
      expect(evaluatePhotoVisualPairEligibility(baseInput(patch)).eligible).toBe(
        false,
      );
    },
  );

  it("all gates pass + ok vision → eligible true", () => {
    const result = evaluatePhotoVisualPairEligibility(baseInput());
    expect(result.eligible).toBe(true);
    expect(result.ineligibleReasons).toEqual([]);
  });

  it("candidate styleTags empty → not ineligible by itself", () => {
    const result = evaluatePhotoVisualPairEligibility(
      baseInput({ candidateStyleTags: [] }),
    );
    expect(result.eligible).toBe(true);
    expect(result.ineligibleReasons).not.toContain("MISSING_STYLE_TAGS");
  });
});
