import { buildActivePoolAuditReport } from "../src/modules/onboarding/onboarding-photo-preview-pool-active-audit";

describe("onboarding-photo-preview-pool-active-audit (P7.5-r4-o2)", () => {
  it("buildActivePoolAuditReport marks duplicate source keys and opposite-gender violations", () => {
    const r = buildActivePoolAuditReport({
      viewerUserId: "viewer-m",
      viewerGenderRaw: "male",
      pool: { id: "poolidlongenough", status: "active" },
      items: [
        {
          rankInPool: 1,
          tier: "aesthetic_fit",
          displayMode: "clear",
          candidateUserId: "fa",
          candidateGenderRaw: "female",
          firstImageUrl: "https://h/a-r4h-ux--kimono--.jpg",
        },
        {
          rankInPool: 2,
          tier: "style_similar",
          displayMode: "blurred",
          candidateUserId: "fb",
          candidateGenderRaw: "female",
          firstImageUrl: "https://h/b-r4h-uy--kimono--.jpg",
        },
        {
          rankInPool: 3,
          tier: "aesthetic_fit",
          displayMode: "clear",
          candidateUserId: "viewer-m",
          candidateGenderRaw: "male",
          firstImageUrl: "https://h/self.jpg",
        },
        {
          rankInPool: 4,
          tier: "aesthetic_fit",
          displayMode: "clear",
          candidateUserId: "xm",
          candidateGenderRaw: "male",
          firstImageUrl: "https://h/x.jpg",
        },
      ],
      mappingItems: [{ file: "kimono.jpg", gender: "female" }],
    });
    expect(r.pool_item_count).toBe(4);
    const dupKey = r.items.filter((i) => i.duplicate_image_source_key);
    expect(dupKey.length).toBeGreaterThanOrEqual(1);
    expect(r.items.some((i) => i.is_viewer_self)).toBe(true);
    expect(r.items.some((i) => i.violates_opposite_gender_gate)).toBe(true);
  });
});
