import { readOnboardingVisionEnv } from "../src/modules/onboarding/vision/onboarding-vision-env";
import { ONBOARDING_VISION_SOURCE_CLOUD_DRY_RUN } from "../src/modules/onboarding/vision/cloud-vision.facade";
import { buildVisionProfileFromCloud } from "../src/modules/onboarding/vision/onboarding-vision-cloud-provider";
import { buildVisionProfileFromRules } from "../src/modules/onboarding/vision/onboarding-vision-rules-provider";
import { buildVisionProfileFromStub } from "../src/modules/onboarding/vision/onboarding-vision-stub-provider";
import { buildOnboardingVisionProfileForPersist } from "../src/modules/onboarding/vision/onboarding-vision-persist";
import { OnboardingVisionService } from "../src/modules/onboarding/vision/onboarding-vision.service";
import type { OnboardingVisionProfileV1 } from "../src/modules/onboarding/vision/onboarding-vision.types";

const sampleDetection = {
  quality: { meanLuma: 120, laplacianVariance: 90, width: 800, height: 600 },
  face: {
    faceCount: 1,
    faces: [],
    primaryFace: {
      score: 0.9,
      box: { x: 100, y: 80, width: 200, height: 240 },
      areaRatio: 0.08,
      centerDistance: 0.2,
      primaryScore: 0.85,
      index: 0,
    },
  },
  warnings: [],
  pipeline: ["quality", "face"],
  faceDetectionEnabled: true,
};

function envEnabled(
  overrides: Partial<ReturnType<typeof readOnboardingVisionEnv>> = {},
) {
  return {
    ...readOnboardingVisionEnv({} as NodeJS.ProcessEnv),
    enabled: true,
    provider: "rules" as const,
    cloudDryRun: true,
    cloudVendor: "mock",
    ...overrides,
  };
}

describe("buildVisionProfileFromCloud dry-run", () => {
  it("normal mock returns cloud profile with quality/scene tags", () => {
    const p = buildVisionProfileFromCloud(
      { detectionScoreJson: sampleDetection },
      envEnabled({ provider: "cloud", cloudMockScenario: "normal" }),
    );
    expect(p.provider).toBe("cloud");
    expect(p.sourceVersion).toBe(ONBOARDING_VISION_SOURCE_CLOUD_DRY_RUN);
    expect(p.visionStatus).toBe("ok");
    expect(p.fallbackUsed).toBe(false);
    expect(p.photoVisualTags.length).toBeGreaterThan(0);
    expect(p.qualityTags?.length).toBeGreaterThan(0);
    expect(p.sceneTags?.length).toBeGreaterThan(0);
    expect(p.qualityTaxonomyVersion).toBe("quality-v1");
    expect(JSON.stringify(p)).not.toContain("genderGuess");
  });

  it("empty mock falls back to rules with fallbackUsed", () => {
    const p = buildVisionProfileFromCloud(
      { detectionScoreJson: sampleDetection },
      envEnabled({ provider: "cloud", cloudMockScenario: "empty" }),
    );
    expect(p.fallbackUsed).toBe(true);
    expect(p.fallbackReason).toBe("cloud_empty_photo_tags");
    expect(p.warnings).toContain("VISION_CLOUD_FALLBACK_RULES");
    expect(p.photoVisualTags.length).toBeGreaterThan(0);
  });

  it("timeout mock falls back without throwing", () => {
    expect(() =>
      buildVisionProfileFromCloud(
        { detectionScoreJson: sampleDetection },
        envEnabled({ provider: "cloud", cloudMockScenario: "timeout" }),
      ),
    ).not.toThrow();
    const p = buildVisionProfileFromCloud(
      { detectionScoreJson: sampleDetection },
      envEnabled({ provider: "cloud", cloudMockScenario: "timeout" }),
    );
    expect(p.fallbackUsed).toBe(true);
    expect(p.fallbackReason).toBe("cloud_exception");
  });

  it("refusal mock falls back to rules", () => {
    const p = buildVisionProfileFromCloud(
      { detectionScoreJson: sampleDetection },
      envEnabled({ provider: "cloud", cloudMockScenario: "refusal" }),
    );
    expect(p.fallbackUsed).toBe(true);
    expect(p.fallbackReason).toBe("cloud_refusal");
  });

  it("invalidTag mock drops unknown and sensitive labels", () => {
    const p = buildVisionProfileFromCloud(
      { detectionScoreJson: sampleDetection },
      envEnabled({ provider: "cloud", cloudMockScenario: "invalidTag" }),
    );
    expect(p.photoVisualTags).not.toContain("未知气质标签");
    expect(p.photoVisualTags).not.toContain("颜值超高");
    expect(JSON.stringify(p)).not.toContain("beautyScore");
  });

  it("legacy zhipu routes to cloud dry-run", () => {
    const p = buildOnboardingVisionProfileForPersist(
      sampleDetection,
      envEnabled({ provider: "zhipu" }),
    )!;
    expect(p.provider).toBe("zhipu");
    expect(p.sourceVersion).toBe(ONBOARDING_VISION_SOURCE_CLOUD_DRY_RUN);
    expect(p.visionStatus).toBe("ok");
    expect(p.warnings ?? []).not.toContain(
      "ONBOARDING_VISION_PROVIDER_UNSUPPORTED_IN_R2",
    );
  });
});

describe("rules/stub unchanged", () => {
  it("rules provider profile unchanged shape", () => {
    const p = buildVisionProfileFromRules(
      { detectionScoreJson: sampleDetection },
      envEnabled({ provider: "rules" }),
    );
    expect(p.provider).toBe("rules");
    expect(p.visionStatus).toBe("ok");
    expect(p.photoVisualTags.length).toBeGreaterThan(0);
    expect(p.qualityTags).toBeUndefined();
  });

  it("stub provider unchanged", () => {
    const p = buildVisionProfileFromStub({}, envEnabled({ provider: "stub" }));
    expect(p.provider).toBe("stub");
    expect(p.photoVisualTags).toEqual(["生活感", "简约干净", "清爽自然"]);
  });

  it("persist rules path unchanged sourceVersion", () => {
    const p = buildOnboardingVisionProfileForPersist(
      sampleDetection,
      envEnabled({ provider: "rules" }),
    )!;
    expect(p.sourceVersion).toBe("p7.5-r2-rules");
  });
});

describe("legacy profile without qualityTags/sceneTags", () => {
  it("remains readable for vision extract", () => {
    const legacy: OnboardingVisionProfileV1 = {
      schemaVersion: "onboarding-vision-v1",
      sourceVersion: "p7.5-r2-rules",
      photoVisualTaxonomyVersion: "p7.5-v1",
      provider: "rules",
      generatedAt: new Date().toISOString(),
      visionStatus: "ok",
      fallbackUsed: false,
      photoVisualTags: ["生活感"],
      confidence: 0.5,
    };
    expect(legacy.qualityTags).toBeUndefined();
    expect(legacy.sceneTags).toBeUndefined();
  });
});

describe("OnboardingVisionService cloud branch", () => {
  it("provider=cloud does not throw when enabled", () => {
    const svc = new OnboardingVisionService();
    expect(() =>
      svc.buildVisionProfile(
        { detectionScoreJson: sampleDetection },
        envEnabled({ provider: "cloud" }),
      ),
    ).not.toThrow();
  });
});
