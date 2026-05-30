import {
  assignPreviewPoolTier3121Slots,
  isPreviewPoolShortlistEligibleDisplayMode,
} from "../src/modules/preview-pool/preview-pool-tier3121";
import type { ShadowCandidateInput } from "../src/modules/onboarding/vision/visual-ranking-shadow-scoring";

function candidate(
  id: string,
  overrides: Partial<ShadowCandidateInput> = {},
): ShadowCandidateInput {
  return {
    userId: id,
    createdAt: new Date(2020, 0, Number(id.replace(/\D/g, "") || 1)),
    displaySourceKey: `key-${id}`,
    styleTags: ["clean"],
    vision: null,
    preferenceFields: {
      age: 28,
      city: "上海",
      height: 170,
      education: "本科",
      occupation: "工程师",
      relationshipGoal: "认真恋爱",
    },
    ...overrides,
  };
}

describe("preview-pool-tier3121", () => {
  it("assigns 3+2+1 tiers and display modes", () => {
    const candidates = [
      candidate("u1", { styleTags: ["clean", "warm"] }),
      candidate("u2", { styleTags: ["clean"] }),
      candidate("u3", { styleTags: ["outdoor"] }),
      candidate("u4", { styleTags: ["casual"] }),
      candidate("u5", { styleTags: ["sport"] }),
      candidate("u6", { styleTags: ["vintage"] }),
    ];

    const slots = assignPreviewPoolTier3121Slots({
      candidates,
      viewerStyleTags: ["clean", "warm"],
      viewerPhotoVisualTags: null,
      viewerVisionAvailable: false,
      viewerPref: {
        minAge: null,
        maxAge: null,
        preferredCities: [],
        minHeight: null,
        maxHeight: null,
        educationPreferences: [],
        occupationPreferences: [],
        relationshipGoalPreferences: [],
        styleTags: ["clean", "warm"],
      },
    });

    expect(slots).toHaveLength(6);
    expect(slots.map((s) => s.candidateType)).toEqual([
      "aesthetic_fit",
      "aesthetic_fit",
      "aesthetic_fit",
      "style_similar",
      "style_similar",
      "reflow",
    ]);
    expect(slots.map((s) => s.displayMode)).toEqual([
      "clear",
      "clear",
      "clear",
      "blurred",
      "blurred",
      "hidden",
    ]);
    expect(new Set(slots.map((s) => s.candidateUserId)).size).toBe(6);
  });

  it("shortlist eligibility accepts clear and legacy full", () => {
    expect(isPreviewPoolShortlistEligibleDisplayMode("clear")).toBe(true);
    expect(isPreviewPoolShortlistEligibleDisplayMode("full")).toBe(true);
    expect(isPreviewPoolShortlistEligibleDisplayMode("blurred")).toBe(false);
    expect(isPreviewPoolShortlistEligibleDisplayMode("hidden")).toBe(false);
  });
});
