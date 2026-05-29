import {
  assertP76AuditReportPrivacySafe,
  buildP76CandidateGates,
  buildPhotoVisualPoolInputV1FromLoadedContext,
  buildPhotoVisualPoolShadowAuditReport,
  extractP76UsableVisionFromImageRow,
  normalizeP76StyleTags,
  pickP76CandidateUsableVision,
  pickP76ViewerUsableVision,
  P76_PREFERRED_VISION_SOURCE_VERSION,
} from "../src/modules/onboarding/vision/p76-photovisual-first-pool-db-adapter";
import { buildPhotoFirstMutualMatchingShadowV1 } from "../src/modules/onboarding/vision/p76-photovisual-first-pool-shadow";
import type { P76LoadedPhotoVisualPoolAuditContext } from "../src/modules/onboarding/vision/p76-photovisual-first-pool-db-adapter";

function visionJson(overrides: Record<string, unknown> = {}) {
  return {
    vision: {
      schemaVersion: "onboarding-vision-v1",
      sourceVersion: P76_PREFERRED_VISION_SOURCE_VERSION,
      photoVisualTaxonomyVersion: "p7.5-v1",
      provider: "zhipu",
      generatedAt: "2026-01-01T00:00:00.000Z",
      visionStatus: "ok",
      fallbackUsed: false,
      photoVisualTags: ["清爽自然"],
      qualityTags: ["清晰"],
      sceneTags: ["室内日常"],
      confidence: 0.7,
      ...overrides,
    },
  };
}

describe("p76 photovisual pool db adapter", () => {
  it("normalize viewer styleTags trims and dedupes", () => {
    expect(normalizeP76StyleTags([" 生活感 ", "生活感", ""])).toEqual([
      "生活感",
    ]);
  });

  it("usable vision ok with preferred sourceVersion", () => {
    const vision = extractP76UsableVisionFromImageRow({
      detectionScoreJson: visionJson(),
      reviewStatus: "not_required",
      detectionStatus: "passed",
    });
    expect(vision?.sourceVersion).toBe(P76_PREFERRED_VISION_SOURCE_VERSION);
    expect(vision?.photoVisualTags).toEqual(["清爽自然"]);
    expect(vision?.qualityTags).toEqual(["清晰"]);
  });

  it("missing vision → null", () => {
    expect(
      extractP76UsableVisionFromImageRow({
        detectionScoreJson: {},
        reviewStatus: "not_required",
        detectionStatus: "passed",
      }),
    ).toBeNull();
  });

  it("pickP76ViewerUsableVision prefers zhipu over older vision", () => {
    const picked = pickP76ViewerUsableVision([
      {
        id: "i1",
        userId: "u1",
        createdAt: new Date("2026-01-02"),
        detectionScoreJson: visionJson({
          sourceVersion: "rules-v1",
          photoVisualTags: ["旧标签"],
        }),
        detectionStatus: "passed",
        reviewStatus: "not_required",
      },
      {
        id: "i2",
        userId: "u1",
        createdAt: new Date("2026-01-01"),
        detectionScoreJson: visionJson({ photoVisualTags: ["清爽自然"] }),
        detectionStatus: "passed",
        reviewStatus: "not_required",
      },
    ]);
    expect(picked?.photoVisualTags).toEqual(["清爽自然"]);
    expect(picked?.sourceVersion).toBe(P76_PREFERRED_VISION_SOURCE_VERSION);
  });

  it("buildPhotoVisualPoolInputV1FromLoadedContext maps candidates", () => {
    const loaded: P76LoadedPhotoVisualPoolAuditContext = {
      viewerUserId: "viewer",
      viewerStyleTags: ["生活感"],
      viewerVision: {
        visionStatus: "ok",
        photoVisualTags: ["精致感"],
        sourceVersion: P76_PREFERRED_VISION_SOURCE_VERSION,
      },
      viewerGenderNorm: "male",
      gatePref: null,
      candidates: [
        {
          candidateUserId: "c1",
          candidateStyleTags: [" 生活感 "],
          firstImageReviewStatus: "not_required",
          firstImageDetectionStatus: "passed",
          gates: buildP76CandidateGates({
            viewerUserId: "viewer",
            candidateUserId: "c1",
            genderGatePassed: true,
            preferenceGatePassed: true,
            firstImageReviewStatus: "not_required",
            firstImageDetectionStatus: "passed",
            missingProfile: false,
          }),
          preferenceFields: {
            age: 25,
            city: "上海",
            height: 170,
            education: "本科",
            occupation: "工程师",
            relationshipGoal: "恋爱",
          },
        },
      ],
      candidateImagesByUserId: new Map([
        [
          "c1",
          [
            {
              id: "img1",
              userId: "c1",
              createdAt: new Date(),
              detectionScoreJson: visionJson({ photoVisualTags: ["生活感"] }),
              detectionStatus: "passed",
              reviewStatus: "not_required",
            },
          ],
        ],
      ]),
      viewerImages: [],
    };

    const input = buildPhotoVisualPoolInputV1FromLoadedContext(loaded, {
      sourcePoolType: "onboarding_gated_cohort",
      poolId: "pool-1",
      generatedAt: "2026-05-16T00:00:00.000Z",
      selectionLimit: 6,
    });

    expect(input.viewerStyleTags).toEqual(["生活感"]);
    expect(input.candidates[0]?.candidateStyleTags).toEqual(["生活感"]);
    expect(input.candidates[0]?.candidateVision?.photoVisualTags).toEqual([
      "生活感",
    ]);
  });

  it("audit report has no imageUrl or detectionScoreJson", () => {
    const shadow = buildPhotoFirstMutualMatchingShadowV1({
      viewerUserId: "v",
      viewerStyleTags: ["a"],
      viewerVision: { visionStatus: "ok", photoVisualTags: ["x"] },
      candidates: [],
      sourcePoolType: "onboarding_gated_cohort",
      poolId: "p",
      generatedAt: "2026-05-16T00:00:00.000Z",
    });

    const report = buildPhotoVisualPoolShadowAuditReport({
      cli: {
        viewerUserId: "v",
        sourcePoolType: "onboarding_gated_cohort",
        limit: 20,
        selectionLimit: 6,
        dryRun: true,
      },
      scannedCandidates: 0,
      shadow,
      generatedAt: "2026-05-16T00:00:00.000Z",
    });

    const json = JSON.stringify(report);
    expect(json).not.toContain("imageUrl");
    expect(json).not.toContain("detectionScoreJson");
    expect(() => assertP76AuditReportPrivacySafe(report)).not.toThrow();
    expect(report.applied).toBe(false);
  });
});
