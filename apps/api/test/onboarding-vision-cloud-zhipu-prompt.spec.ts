import { buildZhipuCloudVisionPrompt } from "../src/modules/onboarding/vision/cloud-vision.zhipu-prompt";
import { PHOTO_VISUAL_TAGS } from "../src/modules/onboarding/vision/onboarding-vision-taxonomy";
import {
  QUALITY_TAGS,
  QUALITY_TAXONOMY_VERSION,
  SCENE_TAGS,
  SCENE_TAXONOMY_VERSION,
} from "../src/modules/onboarding/vision/onboarding-vision-quality-scene-taxonomy";

const taxonomyHints = {
  photoVisual: PHOTO_VISUAL_TAGS,
  quality: QUALITY_TAGS,
  scene: SCENE_TAGS,
};

describe("buildZhipuCloudVisionPrompt", () => {
  it("requires photoVisual quality scene groups and closed taxonomies", () => {
    const prompt = buildZhipuCloudVisionPrompt({ taxonomyHints });
    expect(prompt).toContain("photoVisual");
    expect(prompt).toContain("labels.quality");
    expect(prompt).toContain("labels.scene");
    expect(prompt).toContain(QUALITY_TAXONOMY_VERSION);
    expect(prompt).toContain(SCENE_TAXONOMY_VERSION);
    expect(prompt).toContain("清晰");
    expect(prompt).toContain("室内日常");
    expect(prompt).toContain('"quality":[{"tag":"清晰"');
    expect(prompt).toContain('"scene":[{"tag":"室内日常"');
  });

  it("does not embed imageId in prompt", () => {
    const prompt = buildZhipuCloudVisionPrompt({
      taxonomyHints,
      imageId: "secret-image-id",
    });
    expect(prompt).not.toContain("secret-image-id");
  });
});
