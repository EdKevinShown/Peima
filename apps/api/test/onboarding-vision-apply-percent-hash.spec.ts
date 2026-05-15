import { getStablePercentBucket } from "../src/modules/onboarding/vision/onboarding-vision-apply-percent-hash";

describe("getStablePercentBucket (P7.5-r5-b)", () => {
  it("returns 0–99", () => {
    for (let i = 0; i < 50; i++) {
      const b = getStablePercentBucket(`id-${i}`);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(99);
    }
  });

  it("is stable for the same viewerUserId", () => {
    const id = "cmp70ft7a001e6znksjb2jo03";
    expect(getStablePercentBucket(id)).toBe(getStablePercentBucket(id));
  });

  it("does not use Math.random", () => {
    const spy = jest.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("random should not be used");
    });
    try {
      expect(() => getStablePercentBucket("any")).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});
