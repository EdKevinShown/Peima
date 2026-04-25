import type { PrescreenV0Bucket } from "../src/modules/prescreen-v0/prescreen-v0.types";
import {
  bucketFromTiers,
  comparePrescreenRows,
  computePrescreenScore,
  staticTierFromScore,
} from "../src/modules/prescreen-v0/prescreen-v0.rule";
import {
  PRESCREEN_W_BANDS,
  PRESCREEN_W_STATIC,
  PRESCREEN_W_VERDICT,
} from "../src/modules/prescreen-v0/prescreen-v0.constants";

describe("prescreen-v0.rule", () => {
  describe("bucketFromTiers (§3.2 truth table)", () => {
    const cases: Array<{
      s: "up" | "mid" | "down";
      v: "up" | "mid" | "down";
      bucket: PrescreenV0Bucket;
    }> = [
      { s: "up", v: "up", bucket: "promote" },
      { s: "up", v: "mid", bucket: "neutral" },
      { s: "up", v: "down", bucket: "neutral" },
      { s: "mid", v: "up", bucket: "neutral" },
      { s: "mid", v: "mid", bucket: "neutral" },
      { s: "mid", v: "down", bucket: "demote" },
      { s: "down", v: "up", bucket: "neutral" },
      { s: "down", v: "mid", bucket: "demote" },
      { s: "down", v: "down", bucket: "demote" },
    ];

    it.each(cases)("S=$s V=$v → $bucket", ({ s, v, bucket }) => {
      expect(bucketFromTiers(s, v)).toBe(bucket);
    });
  });

  describe("staticTierFromScore", () => {
    it("maps thresholds per implementation notes", () => {
      expect(staticTierFromScore(58)).toBe("up");
      expect(staticTierFromScore(57)).toBe("mid");
      expect(staticTierFromScore(40)).toBe("mid");
      expect(staticTierFromScore(39)).toBe("down");
    });
  });

  describe("computePrescreenScore", () => {
    it("uses weights that sum to 1", () => {
      expect(PRESCREEN_W_STATIC + PRESCREEN_W_VERDICT + PRESCREEN_W_BANDS).toBeCloseTo(1, 10);
    });

    it("stays in [0, 1] and rises with static when verdict and bands fixed", () => {
      const low = computePrescreenScore({
        reviewStaticScore: 20,
        verdict: "cautious",
        pickup: "medium",
        cold: "medium",
        mis: "medium",
        cont: "medium",
      });
      const high = computePrescreenScore({
        reviewStaticScore: 90,
        verdict: "cautious",
        pickup: "medium",
        cold: "medium",
        mis: "medium",
        cont: "medium",
      });
      expect(low).toBeGreaterThanOrEqual(0);
      expect(high).toBeLessThanOrEqual(1);
      expect(high).toBeGreaterThan(low);
    });
  });

  describe("comparePrescreenRows", () => {
    it("orders promote before neutral even when neutral has higher score", () => {
      const a = { candidateUserId: "z", bucket: "neutral" as const, prescreenScore: 0.99 };
      const b = { candidateUserId: "a", bucket: "promote" as const, prescreenScore: 0.1 };
      const sorted = [a, b].sort(comparePrescreenRows);
      expect(sorted[0].bucket).toBe("promote");
    });

    it("within same bucket sorts by prescreenScore descending then id ascending", () => {
      const rows = [
        { candidateUserId: "b", bucket: "neutral" as const, prescreenScore: 0.5 },
        { candidateUserId: "a", bucket: "neutral" as const, prescreenScore: 0.6 },
        { candidateUserId: "c", bucket: "neutral" as const, prescreenScore: 0.6 },
      ];
      const sorted = [...rows].sort(comparePrescreenRows);
      expect(sorted.map((r) => r.candidateUserId)).toEqual(["a", "c", "b"]);
    });
  });
});
