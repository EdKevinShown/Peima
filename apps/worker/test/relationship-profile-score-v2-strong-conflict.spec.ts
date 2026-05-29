/**
 * M6.0-J5 — synthetic strong / red-flag conflict regression for
 * `computeRelationshipProfileScoreV2` (helper only; no DB / worker ranking).
 * @see docs/M6/M6.0-j5-v2-strong-conflict-regression.md
 */

import {
  computeRelationshipProfileScoreV2,
  display100ToBand,
  G1R_PROFILE_AXIS_KEYS,
  type RelationshipProfileLike,
} from "../src/jobs/relationship-profile-score-v2";

function fullProfile(v: number): RelationshipProfileLike {
  const p: RelationshipProfileLike = {};
  for (const k of G1R_PROFILE_AXIS_KEYS) {
    p[k] = v;
  }
  return p;
}

describe("M6.0-J5 relationshipProfileScore V2 strong conflict regression", () => {
  it("1. single strong conflict: one core axis diff > 0.60 → strongConflictCount >= 1, capApplied <= 0.82", () => {
    const viewer = fullProfile(0.5);
    const candidate = fullProfile(0.5);
    (viewer as RelationshipProfileLike).attachmentStyle = 0;
    (candidate as RelationshipProfileLike).attachmentStyle = 1;
    const r = computeRelationshipProfileScoreV2(viewer, candidate);
    expect(r.strongConflictCount).toBeGreaterThanOrEqual(1);
    expect(r.capApplied).not.toBeNull();
    expect(r.capApplied!).toBeLessThanOrEqual(0.82);
    expect(r.cappedRawScore).toBeLessThanOrEqual(0.82 + 1e-9);
  });

  it("2. multiple core conflict: >=2 core axes diff > 0.45 → coreConflictCount >= 2, capApplied <= 0.78", () => {
    const viewer = fullProfile(0.5);
    const candidate = fullProfile(0.5);
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

  it("3. three+ core conflict: >=3 core axes diff > 0.45 → capApplied <= 0.72", () => {
    const viewer = fullProfile(0.5);
    const candidate = fullProfile(0.5);
    for (const k of [
      "attachmentStyle",
      "communicationStyle",
      "conflictHandling",
    ] as const) {
      (viewer as RelationshipProfileLike)[k] = 0;
      (candidate as RelationshipProfileLike)[k] = 0.55;
    }
    const r = computeRelationshipProfileScoreV2(viewer, candidate);
    expect(r.coreConflictCount).toBeGreaterThanOrEqual(3);
    expect(r.capApplied).not.toBeNull();
    expect(r.capApplied!).toBeLessThanOrEqual(0.72);
  });

  it("4. red-flag conflict: marriageExpectation diff > 0.60 → redFlagConflictCount >= 1, capApplied <= 0.68", () => {
    const viewer = fullProfile(0.5);
    const candidate = fullProfile(0.5);
    (viewer as RelationshipProfileLike).marriageExpectation = 0;
    (candidate as RelationshipProfileLike).marriageExpectation = 1;
    const r = computeRelationshipProfileScoreV2(viewer, candidate);
    expect(r.redFlagConflictCount).toBeGreaterThanOrEqual(1);
    expect(r.capApplied).not.toBeNull();
    expect(r.capApplied!).toBeLessThanOrEqual(0.68);
  });

  it("5. strong-conflict low score: opposite poles → displayScore100 < 40 and band strong_conflict", () => {
    const a = fullProfile(0);
    const b = fullProfile(1);
    const r = computeRelationshipProfileScoreV2(a, b);
    expect(r.displayScore100).toBeLessThan(40);
    expect(r.band).toBe("strong_conflict");
    expect(r.strongConflictCount).toBeGreaterThanOrEqual(1);
    expect(r.cappedRawScore).toBeLessThan(0.55);
  });

  it("6. medium conflict low-adaptation: marriage 0/1 on aligned base → band low or displayScore100 in 40–60", () => {
    const viewer = fullProfile(0.7);
    const candidate = fullProfile(0.7);
    (viewer as RelationshipProfileLike).marriageExpectation = 0;
    (candidate as RelationshipProfileLike).marriageExpectation = 1;
    const r = computeRelationshipProfileScoreV2(viewer, candidate);
    const inLowBand = r.band === "low";
    const inMidDisplay =
      r.displayScore100 >= 40 && r.displayScore100 <= 60;
    expect(inLowBand || inMidDisplay).toBe(true);
    expect(r.displayScore100).toBeGreaterThanOrEqual(40);
    expect(r.displayScore100).toBeLessThan(75);
    expect(r.redFlagConflictCount).toBeGreaterThanOrEqual(1);
  });

  it("7. non-conflict high adaptation: identical profiles → band high, displayScore100 >= 88", () => {
    const p = fullProfile(0.62);
    const r = computeRelationshipProfileScoreV2(p, p);
    expect(r.band).toBe("high");
    expect(r.displayScore100).toBeGreaterThanOrEqual(88);
    expect(r.capApplied).toBeNull();
    expect(r.strongConflictCount).toBe(0);
    expect(r.redFlagConflictCount).toBe(0);
  });

  it("8. capApplied is the strictest cap when multiple rules fire (min of caps)", () => {
    const viewer = fullProfile(0.5);
    const candidate = fullProfile(0.5);
    (viewer as RelationshipProfileLike).marriageExpectation = 0;
    (candidate as RelationshipProfileLike).marriageExpectation = 1;
    for (const k of [
      "attachmentStyle",
      "communicationStyle",
      "conflictHandling",
    ] as const) {
      (viewer as RelationshipProfileLike)[k] = 0;
      (candidate as RelationshipProfileLike)[k] = 0.55;
    }
    const r = computeRelationshipProfileScoreV2(viewer, candidate);
    expect(r.redFlagConflictCount).toBeGreaterThanOrEqual(1);
    expect(r.coreConflictCount).toBeGreaterThanOrEqual(3);
    expect(r.strongConflictCount).toBeGreaterThanOrEqual(1);
    expect(r.capApplied).toBe(0.68);
    expect(r.cappedRawScore).toBeLessThanOrEqual(0.68 + 1e-9);
  });

  it("9. display100ToBand: strong_conflict boundary at display < 40", () => {
    expect(display100ToBand(39)).toBe("strong_conflict");
    expect(display100ToBand(40)).toBe("low");
  });
});
