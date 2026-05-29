import {
  parseCloudVisionVendorResponse,
  unwrapCloudVisionVendorPayload,
} from "../src/modules/onboarding/vision/cloud-vision.response-parser";

describe("parseCloudVisionVendorResponse", () => {
  it("parses direct labels object", () => {
    const r = parseCloudVisionVendorResponse({
      labels: {
        photoVisual: [{ tag: "清爽自然", score: 0.9 }],
        quality: [{ tag: "清晰", score: 0.8 }],
        scene: [{ tag: "室内日常", score: 0.7 }],
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.labels.photoVisual[0]?.tag).toBe("清爽自然");
  });

  it("parses choices message content JSON string", () => {
    const inner = JSON.stringify({
      labels: {
        photoVisual: [{ tag: "生活感", score: 0.75 }],
        quality: [],
        scene: [],
      },
    });
    const r = parseCloudVisionVendorResponse({
      choices: [{ message: { content: inner } }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.labels.photoVisual[0]?.tag).toBe("生活感");
  });

  it("invalid JSON string fails", () => {
    const r = parseCloudVisionVendorResponse({
      choices: [{ message: { content: "not-json" } }],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("missing_labels");
  });

  it("malformed labels fails", () => {
    const r = parseCloudVisionVendorResponse({
      labels: { photoVisual: "bad" },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("malformed_labels");
  });

  it("strips sensitive fields from payload", () => {
    const unwrapped = unwrapCloudVisionVendorPayload({
      labels: {
        photoVisual: [{ tag: "清爽自然", score: 0.9 }],
        quality: [],
        scene: [],
      },
      beautyScore: 10,
      genderGuess: "x",
    });
    expect(JSON.stringify(unwrapped)).not.toContain("genderGuess");
    expect(JSON.stringify(unwrapped)).not.toContain("beautyScore");
  });

  it("parses refusal without labels", () => {
    const r = parseCloudVisionVendorResponse({
      refusal: { code: "POLICY", message: "nope" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.refusal?.code).toBe("POLICY");
    expect(r.labels.photoVisual).toEqual([]);
  });

  it("fails when labels block omits photoVisual", () => {
    const r = parseCloudVisionVendorResponse({
      labels: { quality: [{ tag: "清晰", score: 0.8 }] },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("malformed_labels");
  });

  it("parses photoVisual-only labels (missing quality/scene keys)", () => {
    const r = parseCloudVisionVendorResponse({
      labels: {
        photoVisual: [{ tag: "生活感", score: 0.8 }],
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.labels.photoVisual[0]?.tag).toBe("生活感");
    expect(r.labels.quality).toEqual([]);
    expect(r.labels.scene).toEqual([]);
  });

  it("parses unknown quality/scene tags for normalizer to drop", () => {
    const r = parseCloudVisionVendorResponse({
      labels: {
        photoVisual: [{ tag: "清爽自然", score: 0.9 }],
        quality: [{ tag: "未知质量", score: 0.99 }],
        scene: [{ tag: "未知场景", score: 0.88 }],
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.labels.quality[0]?.tag).toBe("未知质量");
    expect(r.labels.scene[0]?.tag).toBe("未知场景");
  });
});
