import {
  PHOTO_VISUAL_TAGS,
  PHOTO_VISUAL_TAXONOMY_VERSION,
  isKnownPhotoVisualTag,
  normalizePhotoVisualTags,
} from "../src/modules/onboarding/vision/onboarding-vision-taxonomy";
import { ONBOARDING_VISION_SCHEMA_VERSION } from "../src/modules/onboarding/vision/onboarding-vision.types";
import { buildVisionProfileFromStub } from "../src/modules/onboarding/vision/onboarding-vision-stub-provider";

describe("onboarding vision taxonomy", () => {
  it("uses taxonomy version p7.5-v1 with 18 tags", () => {
    expect(PHOTO_VISUAL_TAXONOMY_VERSION).toBe("p7.5-v1");
    expect(PHOTO_VISUAL_TAGS).toHaveLength(18);
    expect(isKnownPhotoVisualTag("清爽自然")).toBe(true);
    expect(isKnownPhotoVisualTag("未知标签")).toBe(false);
  });

  it("filters unknown tags and respects maxTags", () => {
    const out = normalizePhotoVisualTags(
      ["清爽自然", "未知", "清爽自然", "生活感", "精致感", "氛围感", "高级感", "户外感"],
      3,
    );
    expect(out).toEqual(["清爽自然", "生活感", "精致感"]);
  });
});

describe("stub provider profile shape", () => {
  it("returns fixed profile with correct schemaVersion", () => {
    const p = buildVisionProfileFromStub();
    expect(p.schemaVersion).toBe(ONBOARDING_VISION_SCHEMA_VERSION);
    expect(p.provider).toBe("stub");
    expect(p.sourceVersion).toBe("p7.5-r1-stub");
    expect(p.visionStatus).toBe("ok");
    expect(p.photoVisualTags).toEqual(["生活感", "简约干净", "清爽自然"]);
    expect(p.confidence).toBe(0.5);
    expect(p.rawProviderMeta).toBeUndefined();
  });
});
