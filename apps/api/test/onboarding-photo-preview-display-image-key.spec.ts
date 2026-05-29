import {
  extractDisplayImageSourceKeyFromImageUrl,
  previewPoolRowDisplaySourceKey,
  r4hSlugFromDisplaySourceKey,
} from "../src/modules/onboarding/onboarding-photo-preview-display-image-key";

describe("onboarding-photo-preview-display-image-key (P7.5-r4-o2)", () => {
  it("extracts shared slug from per-user r4h marker", () => {
    const u1 =
      "https://h/cmabc-r4h-ucmabc--test_user_images7--.jpg";
    const u2 =
      "https://h/cmxyz-r4h-ucmxyz--test_user_images7--.jpg";
    expect(extractDisplayImageSourceKeyFromImageUrl(u1)).toBe("r4h:test_user_images7");
    expect(extractDisplayImageSourceKeyFromImageUrl(u2)).toBe("r4h:test_user_images7");
  });

  it("extracts legacy -r4h-import- slug", () => {
    const u = "https://h/u1-r4h-import-foo_bar--.jpg";
    expect(extractDisplayImageSourceKeyFromImageUrl(u)).toBe("r4h-import:foo_bar");
  });

  it("falls back to full URL when no marker", () => {
    const u = "https://cdn.example/photo.jpg";
    expect(extractDisplayImageSourceKeyFromImageUrl(u)).toBe(u);
  });

  it("previewPoolRowDisplaySourceKey uses candidate id when image URL empty", () => {
    expect(
      previewPoolRowDisplaySourceKey({ id: "u9", firstImageUrl: null }),
    ).toBe("candidate:u9");
  });

  it("r4hSlugFromDisplaySourceKey strips prefix", () => {
    expect(r4hSlugFromDisplaySourceKey("r4h:abc")).toBe("abc");
    expect(r4hSlugFromDisplaySourceKey("r4h-import:xyz")).toBe("xyz");
    expect(r4hSlugFromDisplaySourceKey("https://x")).toBeNull();
  });
});
