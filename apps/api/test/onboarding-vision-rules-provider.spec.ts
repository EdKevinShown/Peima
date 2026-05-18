import { readOnboardingVisionEnv } from "../src/modules/onboarding/vision/onboarding-vision-env";
import { buildVisionProfileFromRules } from "../src/modules/onboarding/vision/onboarding-vision-rules-provider";
import { OnboardingVisionService } from "../src/modules/onboarding/vision/onboarding-vision.service";
import { isKnownPhotoVisualTag } from "../src/modules/onboarding/vision/onboarding-vision-taxonomy";

const env = { ...readOnboardingVisionEnv(), maxTags: 6 };

function detectionJson(overrides: {
  meanLuma?: number;
  laplacianVariance?: number;
  faceCount?: number;
  areaRatio?: number;
  centerDistance?: number;
  warnings?: string[];
}) {
  return {
    quality: {
      meanLuma: overrides.meanLuma ?? 120,
      laplacianVariance: overrides.laplacianVariance ?? 120,
      width: 800,
      height: 600,
    },
    face: {
      faceCount: overrides.faceCount ?? 1,
      faces: [],
      primaryFace: {
        score: 0.9,
        box: { x: 100, y: 80, width: 200, height: 240 },
        areaRatio: overrides.areaRatio ?? 0.08,
        centerDistance: overrides.centerDistance ?? 0.2,
        primaryScore: 0.85,
        index: 0,
      },
    },
    warnings: overrides.warnings ?? [],
    pipeline: ["quality", "face"],
    faceDetectionEnabled: true,
  };
}

describe("buildVisionProfileFromRules", () => {
  it("bright centered face includes 清爽自然 and 简约干净", () => {
    const p = buildVisionProfileFromRules(
      {
        detectionScoreJson: detectionJson({
          meanLuma: 190,
          laplacianVariance: 100,
          areaRatio: 0.1,
          centerDistance: 0.15,
        }),
      },
      env,
    );
    expect(p.visionStatus).toBe("ok");
    expect(p.fallbackUsed).toBe(false);
    expect(p.photoVisualTags).toEqual(
      expect.arrayContaining(["清爽自然", "简约干净"]),
    );
    expect(p.qualitySignals?.lighting).toBe("bright");
    expect(p.qualitySignals?.composition).toBe("centered_face");
  });

  it("high clarity includes 精致感", () => {
    const p = buildVisionProfileFromRules(
      {
        detectionScoreJson: detectionJson({
          laplacianVariance: 220,
        }),
      },
      env,
    );
    expect(p.photoVisualTags).toContain("精致感");
    expect(p.qualitySignals?.clarity).toBe("high");
  });

  it("dark lighting lowers confidence and may include 氛围感", () => {
    const p = buildVisionProfileFromRules(
      {
        detectionScoreJson: detectionJson({ meanLuma: 30 }),
      },
      env,
    );
    expect(p.qualitySignals?.lighting).toBe("dark");
    expect(p.photoVisualTags).toContain("氛围感");
    expect(p.confidence).toBeLessThan(0.52);
    expect(p.warnings).toEqual(expect.arrayContaining(["VISION_LOW_LIGHT"]));
  });

  it("MULTIPLE_FACES sets multipleFacesWarning and keeps warning code", () => {
    const p = buildVisionProfileFromRules(
      {
        detectionScoreJson: detectionJson({
          faceCount: 2,
          warnings: ["MULTIPLE_FACES"],
        }),
      },
      env,
    );
    expect(p.faceSignals?.multipleFacesWarning).toBe(true);
    expect(p.photoVisualTags).toContain("社交感");
    expect(p.warnings).toEqual(
      expect.arrayContaining(["VISION_MULTIPLE_FACES_WARNING"]),
    );
  });

  it("missing detectionScoreJson → skipped with fallbackUsed", () => {
    const p = buildVisionProfileFromRules({}, env);
    expect(p.visionStatus).toBe("skipped");
    expect(p.fallbackUsed).toBe(true);
    expect(p.warnings).toEqual(
      expect.arrayContaining(["ONBOARDING_VISION_MISSING_DETECTION_SIGNALS"]),
    );
  });

  it("respects maxTags and drops unknown tags", () => {
    const p = buildVisionProfileFromRules(
      {
        detectionScoreJson: detectionJson({
          meanLuma: 190,
          laplacianVariance: 250,
        }),
        viewerStyleTags: ["清爽自然", "伪造标签", "高级感"],
      },
      { ...env, maxTags: 4 },
    );
    expect(p.photoVisualTags.length).toBeLessThanOrEqual(4);
    for (const t of p.photoVisualTags) {
      expect(isKnownPhotoVisualTag(t)).toBe(true);
    }
    expect(p.photoVisualTags).toContain("清爽自然");
  });

  it("viewerStyleTags boost overlap without copying all", () => {
    const p = buildVisionProfileFromRules(
      {
        detectionScoreJson: detectionJson({ meanLuma: 120, laplacianVariance: 90 }),
        viewerStyleTags: ["文艺温柔", "笑容", "成熟稳重"],
      },
      env,
    );
    expect(p.photoVisualTags).toContain("文艺温柔");
    expect(p.photoVisualTags).not.toContain("笑容");
  });
});

describe("OnboardingVisionService.buildVisionProfile", () => {
  it("returns skipped profile when env disabled", () => {
    const svc = new OnboardingVisionService();
    const p = svc.buildVisionProfile(
      { detectionScoreJson: detectionJson({}) },
      { ...readOnboardingVisionEnv(), enabled: false },
    );
    expect(p.visionStatus).toBe("skipped");
    expect(p.fallbackUsed).toBe(true);
    expect(p.warnings).toEqual(
      expect.arrayContaining(["ONBOARDING_VISION_DISABLED"]),
    );
  });

  it("zhipu provider routes to cloud dry-run mock without network", () => {
    const svc = new OnboardingVisionService();
    const p = svc.buildVisionProfile(
      { detectionScoreJson: detectionJson({}) },
      {
        ...readOnboardingVisionEnv(),
        enabled: true,
        provider: "zhipu",
        cloudMockScenario: "normal",
        cloudDryRun: true,
      },
    );
    expect(p.visionStatus).toBe("ok");
    expect(p.provider).toBe("zhipu");
    expect(p.photoVisualTags.length).toBeGreaterThan(0);
    expect(p.warnings ?? []).not.toContain(
      "ONBOARDING_VISION_PROVIDER_UNSUPPORTED_IN_R1",
    );
  });
});
