/**
 * M6.0-R3 — matchInsights.rrmV2Top2Selector shadow wiring.
 * @see docs/M6/M6.0-r3-rrm-v2-top2-selector-shadow.md
 */

import {
  buildWorkerMatchInsightsForBestMatch,
  matchInsightsRrmV2Top2SelectorShadowFromCandidateRows,
} from "../src/jobs/batch-match-match-insights";
import { SCORING_VERSION_M60_SHADOW } from "../src/jobs/matching-score";
import type { UserProfileLike } from "../src/jobs/matching-score";
import { G1R_PROFILE_AXIS_KEYS } from "../src/jobs/relationship-profile-score-v2";
import { RELATIONSHIP_PROFILE_SCORE_V2_VERSION } from "../src/jobs/relationship-profile-score-v2";
import { type RrmV2Top2CandidateInput } from "../src/jobs/rrm-v2-top2-selector";

function fullUserProfile(v: number): UserProfileLike {
  const p = {} as NonNullable<Exclude<UserProfileLike, null>>;
  for (const k of G1R_PROFILE_AXIS_KEYS) {
    p[k] = v;
  }
  return p;
}

const candidate = {
  age: 28,
  city: "上海",
  height: 170,
  education: "本科",
  occupation: "工程师",
  relationshipGoal: "认真交往",
};

const components = {
  previewPoolScore: 0.72,
  preferenceScore: 0.61,
  styleScore: 0.45,
  profileScore: 0.66,
  finalScore: 0.63,
};

describe("rrmV2Top2Selector shadow (R3)", () => {
  it("1. matchInsights keeps scoreShadow v1, scoreShadowV2, rrmV2Top2Selector, placeholders", () => {
    const vp = fullUserProfile(0.55);
    const mi = buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: vp,
      candidateProfile: fullUserProfile(0.56),
      v2SelectorCandidates: [
        { candidateUserId: "cand-a", candidateProfile: fullUserProfile(0.56) },
        { candidateUserId: "cand-b", candidateProfile: fullUserProfile(0.57) },
      ],
    });
    expect(mi.scoreShadow?.scoringVersion).toBe(SCORING_VERSION_M60_SHADOW);
    expect(mi.scoreShadowV2?.scoringVersion).toBe(RELATIONSHIP_PROFILE_SCORE_V2_VERSION);
    expect(mi.rrmV2Top2Selector?.version).toBe("m6.0-rrm-v2-top2-selector-shadow-v1");
    expect(mi.explanation?.strengths?.length).toBeGreaterThan(0);
    expect(mi.openingTopics?.length).toBeGreaterThan(0);
    expect(mi.riskFlags?.length).toBeGreaterThan(0);
  });

  it("2. two legal V2 candidates → eligible true, reason ok, selectedTop2 length 2", () => {
    const mi = buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: fullUserProfile(0.55),
      candidateProfile: fullUserProfile(0.56),
      v2SelectorCandidates: [
        { candidateUserId: "cand-a", candidateProfile: fullUserProfile(0.56) },
        { candidateUserId: "cand-b", candidateProfile: fullUserProfile(0.57) },
      ],
    });
    const r = mi.rrmV2Top2Selector!;
    expect(r.eligible).toBe(true);
    expect(r.reason).toBe("ok");
    expect(r.selectedTop2).toHaveLength(2);
  });

  it("3. low band can appear in selectedTop2; hasLowBand; reason ok", () => {
    const vp = fullUserProfile(0.35);
    const mi = buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: vp,
      candidateProfile: fullUserProfile(0.36),
      v2SelectorCandidates: [
        { candidateUserId: "hi", candidateProfile: fullUserProfile(0.36) },
        { candidateUserId: "lo", candidateProfile: fullUserProfile(0.65) },
      ],
    });
    const r = mi.rrmV2Top2Selector!;
    expect(r.eligible).toBe(true);
    expect(r.reason).toBe("ok");
    expect(r.contextFlags.hasLowBand).toBe(true);
    expect(r.selectedTop2.some((x) => x.band === "low")).toBe(true);
  });

  it("4. strong_conflict can appear in selectedTop2; hasStrongConflictBand; reason ok", () => {
    const vp = fullUserProfile(0.55);
    const mi = buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: vp,
      candidateProfile: fullUserProfile(0.56),
      v2SelectorCandidates: [
        { candidateUserId: "near", candidateProfile: fullUserProfile(0.56) },
        { candidateUserId: "opp", candidateProfile: fullUserProfile(0) },
      ],
    });
    const r = mi.rrmV2Top2Selector!;
    expect(r.eligible).toBe(true);
    expect(r.reason).toBe("ok");
    expect(r.contextFlags.hasStrongConflictBand).toBe(true);
    expect(r.selectedTop2.some((x) => x.band === "strong_conflict")).toBe(true);
  });

  it("5. large Top1−Top2 gap → eligible true, top2GapLarge, reason ok", () => {
    const vp = fullUserProfile(0.55);
    const mi = buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: vp,
      candidateProfile: fullUserProfile(0.56),
      v2SelectorCandidates: [
        { candidateUserId: "hi", candidateProfile: fullUserProfile(0.56) },
        { candidateUserId: "mid", candidateProfile: fullUserProfile(0.28) },
      ],
    });
    const r = mi.rrmV2Top2Selector!;
    expect(r.eligible).toBe(true);
    expect(r.reason).toBe("ok");
    expect(r.contextFlags.top2GapLarge).toBe(true);
  });

  it("6. displayScore100 below suggested floor → eligible true, anyBelowSuggestedFloor, reason ok", () => {
    const vp = fullUserProfile(0.55);
    const mi = buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: vp,
      candidateProfile: fullUserProfile(0.56),
      v2SelectorCandidates: [
        { candidateUserId: "hi", candidateProfile: fullUserProfile(0.56) },
        { candidateUserId: "lo", candidateProfile: fullUserProfile(0.28) },
      ],
    });
    const r = mi.rrmV2Top2Selector!;
    expect(r.eligible).toBe(true);
    expect(r.reason).toBe("ok");
    expect(r.contextFlags.anyBelowSuggestedFloor).toBe(true);
  });

  it("7. fewer than 2 valid V2 rows → eligible false, not_enough_valid_v2_candidates", () => {
    const mi = buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: fullUserProfile(0.55),
      candidateProfile: fullUserProfile(0.56),
      v2SelectorCandidates: [
        { candidateUserId: "only", candidateProfile: fullUserProfile(0.56) },
      ],
    });
    const r = mi.rrmV2Top2Selector!;
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("not_enough_valid_v2_candidates");
    expect(r.selectedTop2).toHaveLength(0);
  });

  it("8. invalid / missing scoreShadowV2 rows are filtered; selectedTop2 only has valid Top2", () => {
    const rows: RrmV2Top2CandidateInput[] = [
      {
        candidateUserId: "top",
        scoreShadowV2: {
          scoringVersion: RELATIONSHIP_PROFILE_SCORE_V2_VERSION,
          source: "profile_v2_shadow",
          displayScore100: 90,
          band: "high",
        },
      },
      {
        candidateUserId: "second",
        scoreShadowV2: {
          scoringVersion: RELATIONSHIP_PROFILE_SCORE_V2_VERSION,
          source: "profile_v2_shadow",
          displayScore100: 70,
          band: "medium",
        },
      },
      { candidateUserId: "missing", scoreShadowV2: null },
      {
        candidateUserId: "badver",
        scoreShadowV2: {
          scoringVersion: "wrong",
          source: "profile_v2_shadow",
          displayScore100: 99,
          band: "high",
        },
      },
    ];
    const shadow = matchInsightsRrmV2Top2SelectorShadowFromCandidateRows(rows);
    expect(shadow.eligible).toBe(true);
    expect(shadow.reason).toBe("ok");
    expect(shadow.selectedTop2.map((x) => x.candidateUserId)).toEqual(["top", "second"]);
    expect(shadow.selectedTop2.map((x) => x.candidateUserId)).not.toContain("missing");
    expect(shadow.selectedTop2.map((x) => x.candidateUserId)).not.toContain("badver");
  });

  it("9. shadow output does not include finalScore, raw questionnaire, or matchInsights blob", () => {
    const vp = fullUserProfile(0.55);
    const mi = buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: vp,
      candidateProfile: fullUserProfile(0.56),
      v2SelectorCandidates: [
        { candidateUserId: "a", candidateProfile: fullUserProfile(0.56) },
        { candidateUserId: "b", candidateProfile: fullUserProfile(0.57) },
      ],
    });
    const raw = JSON.stringify(mi.rrmV2Top2Selector);
    expect(raw).not.toMatch(/finalScore/);
    expect(raw).not.toMatch(/matchInsights/);
    expect(raw).not.toMatch(/attachmentStyle/);
    expect(raw).not.toMatch(/token/);
  });

  it("10. worker path does not change legacy finalScore input (immutable components)", () => {
    const c = { ...components };
    buildWorkerMatchInsightsForBestMatch({
      components: c,
      candidate,
      viewerProfile: fullUserProfile(0.55),
      candidateProfile: fullUserProfile(0.56),
      v2SelectorCandidates: [
        { candidateUserId: "a", candidateProfile: fullUserProfile(0.56) },
        { candidateUserId: "b", candidateProfile: fullUserProfile(0.57) },
      ],
    });
    expect(c.finalScore).toBe(components.finalScore);
  });

  it("11. matchInsights JSON does not include displayCandidateUserId (shadow-only R3)", () => {
    const mi = buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: fullUserProfile(0.55),
      candidateProfile: fullUserProfile(0.56),
      v2SelectorCandidates: [
        { candidateUserId: "a", candidateProfile: fullUserProfile(0.56) },
        { candidateUserId: "b", candidateProfile: fullUserProfile(0.57) },
      ],
    });
    expect(JSON.stringify(mi)).not.toMatch(/displayCandidateUserId/);
  });
});
