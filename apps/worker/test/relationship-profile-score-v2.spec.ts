import {
  G1R_PROFILE_AXIS_KEYS,
  cappedRawToDisplay100,
  computeRelationshipProfileScoreV2,
  display100ToBand,
  type RelationshipProfileLike,
} from "../src/jobs/relationship-profile-score-v2";

function fullProfile(v: number): RelationshipProfileLike {
  const p: RelationshipProfileLike = {};
  for (const k of G1R_PROFILE_AXIS_KEYS) {
    p[k] = v;
  }
  return p;
}

describe("computeRelationshipProfileScoreV2", () => {
  it("1. identical profiles: high base, no penalty, high band", () => {
    const p = fullProfile(0.62);
    const r = computeRelationshipProfileScoreV2(p, p);
    expect(r.weightedBaseScore).toBeGreaterThan(0.99);
    expect(r.penaltyTotal).toBe(0);
    expect(r.rawCompatibilityScore).toBeGreaterThan(0.99);
    expect(r.cappedRawScore).toBeGreaterThan(0.99);
    expect(r.displayScore100).toBeGreaterThanOrEqual(95);
    expect(r.band).toBe("high");
    expect(r.source).toBe("profile_v2_shadow");
    expect(Number.isFinite(r.displayScore100)).toBe(true);
  });

  it("2. opposite core axes: penalty, cap, low or strong_conflict band", () => {
    const a = fullProfile(0);
    const b = fullProfile(1);
    const r = computeRelationshipProfileScoreV2(a, b);
    expect(r.penaltyTotal).toBe(0.3);
    expect(r.weightedBaseScore).toBe(0);
    expect(r.rawCompatibilityScore).toBe(0);
    expect(r.displayScore100).toBeLessThanOrEqual(40);
    expect(["low", "strong_conflict"]).toContain(r.band);
    expect(r.strongConflictCount).toBeGreaterThanOrEqual(1);
  });

  it("3. strongConflictCount >= 1 implies capApplied <= 0.82", () => {
    const viewer = fullProfile(0.5);
    const candidate = { ...fullProfile(0.5), attachmentStyle: 1 };
    (viewer as RelationshipProfileLike).attachmentStyle = 0;
    const r = computeRelationshipProfileScoreV2(viewer, candidate);
    expect(r.strongConflictCount).toBeGreaterThanOrEqual(1);
    expect(r.capApplied).not.toBeNull();
    expect(r.capApplied!).toBeLessThanOrEqual(0.82);
    expect(r.cappedRawScore).toBeLessThanOrEqual(0.82 + 1e-9);
  });

  it("4. coreConflictCount >= 2 implies capApplied <= 0.78", () => {
    const viewer = fullProfile(0.5);
    const candidate = { ...fullProfile(0.5) };
    (viewer as RelationshipProfileLike).attachmentStyle = 0;
    (candidate as RelationshipProfileLike).attachmentStyle = 0.55;
    (viewer as RelationshipProfileLike).communicationStyle = 0;
    (candidate as RelationshipProfileLike).communicationStyle = 0.55;
    const r = computeRelationshipProfileScoreV2(viewer, candidate);
    expect(r.coreConflictCount).toBeGreaterThanOrEqual(2);
    expect(r.strongConflictCount).toBe(0);
    expect(r.capApplied).not.toBeNull();
    expect(r.capApplied!).toBeLessThanOrEqual(0.78);
  });

  it("5. coreConflictCount >= 3 implies capApplied <= 0.72", () => {
    const viewer = fullProfile(0.5);
    const candidate = { ...fullProfile(0.5) };
    const keys: (keyof RelationshipProfileLike)[] = [
      "attachmentStyle",
      "communicationStyle",
      "conflictHandling",
    ];
    for (const k of keys) {
      (viewer as RelationshipProfileLike)[k] = 0;
      (candidate as RelationshipProfileLike)[k] = 0.55;
    }
    const r = computeRelationshipProfileScoreV2(viewer, candidate);
    expect(r.coreConflictCount).toBeGreaterThanOrEqual(3);
    expect(r.strongConflictCount).toBe(0);
    expect(r.capApplied).not.toBeNull();
    expect(r.capApplied!).toBeLessThanOrEqual(0.72);
  });

  it("6. redFlagConflictCount >= 1 implies capApplied <= 0.68", () => {
    const viewer = fullProfile(0.5);
    const candidate = { ...fullProfile(0.5) };
    (viewer as RelationshipProfileLike).marriageExpectation = 0;
    (candidate as RelationshipProfileLike).marriageExpectation = 1;
    const r = computeRelationshipProfileScoreV2(viewer, candidate);
    expect(r.redFlagConflictCount).toBeGreaterThanOrEqual(1);
    expect(r.capApplied).not.toBeNull();
    expect(r.capApplied!).toBeLessThanOrEqual(0.68);
  });

  it("7. penaltyTotal is capped at 0.30 under many core conflicts", () => {
    const viewer = fullProfile(0);
    const candidate = fullProfile(1);
    const r = computeRelationshipProfileScoreV2(viewer, candidate);
    expect(r.penaltyTotal).toBeLessThanOrEqual(0.3);
    expect(r.penaltyTotal).toBe(0.3);
  });

  it("8. null axes are skipped (not treated as 0) and do not throw", () => {
    const sparseA: RelationshipProfileLike = {};
    const sparseB: RelationshipProfileLike = {};
    for (let i = 0; i < 10; i += 1) {
      const k = G1R_PROFILE_AXIS_KEYS[i];
      sparseA[k] = 0.5;
      sparseB[k] = 0.5;
    }
    sparseA.emotionalExpression = undefined;
    sparseA.loveLanguage = null;
    sparseB.emotionalExpression = 0.9;
    sparseB.loveLanguage = 0.1;
    expect(() =>
      computeRelationshipProfileScoreV2(sparseA, sparseB),
    ).not.toThrow();
    const r = computeRelationshipProfileScoreV2(sparseA, sparseB);
    expect(r.validAxisCount).toBeGreaterThanOrEqual(8);
    expect(r.skippedAxisCount).toBeGreaterThan(0);
    expect(Number.isNaN(r.displayScore100)).toBe(false);
  });

  it("9. insufficient_profile when validAxisCount < 8; finite safe numbers", () => {
    const thin: RelationshipProfileLike = {
      attachmentStyle: 0.5,
      communicationStyle: 0.5,
      conflictHandling: 0.5,
      securityNeed: 0.5,
      emotionalStability: 0.5,
      lifePace: 0.5,
      familyView: 0.5,
    };
    const r = computeRelationshipProfileScoreV2(thin, thin);
    expect(r.validAxisCount).toBe(7);
    expect(r.source).toBe("insufficient_profile");
    expect(r.displayScore100).toBeLessThanOrEqual(62);
    expect(Number.isFinite(r.displayScore100)).toBe(true);
    expect(Number.isFinite(r.rawCompatibilityScore)).toBe(true);
    expect(Number.isFinite(r.cappedRawScore)).toBe(true);
  });

  it("10. display mapping monotone in cappedRawScore", () => {
    const inputs = [
      0, 0.1, 0.3, 0.54, 0.55, 0.6, 0.71, 0.72, 0.75, 0.81, 0.82, 0.85, 0.89,
      0.9, 0.95, 1,
    ];
    let prev = -1;
    for (const raw of inputs) {
      const d = cappedRawToDisplay100(raw);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });

  it("11. five display bands are reachable via cappedRawScore mapping", () => {
    const samples: { raw: number; band: ReturnType<typeof display100ToBand> }[] =
      [
        { raw: 0.2, band: "strong_conflict" },
        { raw: 0.56, band: "low" },
        { raw: 0.73, band: "medium" },
        { raw: 0.83, band: "good" },
        { raw: 0.95, band: "high" },
      ];
    for (const { raw, band } of samples) {
      const d = cappedRawToDisplay100(raw);
      expect(display100ToBand(d)).toBe(band);
    }
  });

  it("12. piecewise display stretches relative to raw × 100 in a G3-like plateau", () => {
    const plateauRaw = 0.82;
    const d = cappedRawToDisplay100(plateauRaw);
    const naive = Math.round(plateauRaw * 100);
    expect(d).toBeLessThan(naive);
    expect(d).toBe(78);
  });
});
