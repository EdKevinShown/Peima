import {
  applyPreviewVisualEnhanceStubGAll,
  parseVisualEnhancePayload,
  resolvePreviewVisualEnhanceLlmModel,
  StubPreviewVisualEnhanceClient,
  type VisualEnhanceInput,
} from "../src/modules/preview-pool/visual-signal-enhance-stub";
import type { GatedCandidateForLayering } from "../src/modules/preview-pool/preview-pool-layered-selection";

/** Subclass stub so `instanceof StubPreviewVisualEnhanceClient` stays true → no cross-fallback to real stub. */
class NeverResolvingStub extends StubPreviewVisualEnhanceClient {
  override enhance(_input: VisualEnhanceInput): Promise<unknown> {
    return new Promise(() => {
      /* never */
    });
  }
}

describe("visual-signal-enhance-stub", () => {
  it("resolvePreviewVisualEnhanceLlmModel: explicit overrides host", () => {
    expect(
      resolvePreviewVisualEnhanceLlmModel(
        "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        "custom-model",
      ),
    ).toBe("custom-model");
  });

  it("resolvePreviewVisualEnhanceLlmModel: intl host → qwen-vl-plus", () => {
    expect(
      resolvePreviewVisualEnhanceLlmModel(
        "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        "",
      ),
    ).toBe("qwen-vl-plus");
  });

  it("resolvePreviewVisualEnhanceLlmModel: mainland host → qwen3-vl-plus", () => {
    expect(
      resolvePreviewVisualEnhanceLlmModel(
        "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "",
      ),
    ).toBe("qwen3-vl-plus");
  });

  it("timeout: never-resolving client leaves visualEnhance unset", async () => {
    const row: GatedCandidateForLayering = {
      id: "u1",
      createdAt: new Date(),
      age: 28,
      city: "上海",
      height: 170,
      education: "本科",
      occupation: "工程师",
      relationshipGoal: "认真恋爱",
      firstImageStyleTags: [],
      firstImageId: "img_slow",
      hasImage: true,
    };
    await applyPreviewVisualEnhanceStubGAll([row], new NeverResolvingStub(), 5);
    expect(row.visualEnhance).toBeUndefined();
  });

  it("StubPreviewVisualEnhanceClient returns payload that parses", async () => {
    const raw = await new StubPreviewVisualEnhanceClient().enhance({
      imageId: "abc",
      imageUrl: null,
    });
    const p = parseVisualEnhancePayload(raw, "abc");
    expect(p?.visualConfidence).toBe(0.9);
    expect(typeof p?.visualSignalScore).toBe("number");
    expect(p?.visualTags).toContain("stub_visual_v1");
  });
});
