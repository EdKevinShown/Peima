/**
 * M6.1-r3: `rrmDecisionShadow` behind `PEIMA_M6_RRM_DECISION_SHADOW_ENABLED`.
 */

import { buildRrmDecisionShadowPayload } from "../src/jobs/batch-match-rrm-decision-shadow";
import { buildWorkerMatchInsightsForBestMatch } from "../src/jobs/batch-match-match-insights";
import type { UserProfileLike } from "../src/jobs/matching-score";
import { G1R_PROFILE_AXIS_KEYS } from "../src/jobs/relationship-profile-score-v2";

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

const pool = [
  { candidateUserId: "cand-a", candidateProfile: fullUserProfile(0.56) },
  { candidateUserId: "cand-b", candidateProfile: fullUserProfile(0.57) },
];

describe("M6.1 rrmDecisionShadow", () => {
  let prev: string | undefined;

  beforeEach(() => {
    prev = process.env.PEIMA_M6_RRM_DECISION_SHADOW_ENABLED;
    delete process.env.PEIMA_M6_RRM_DECISION_SHADOW_ENABLED;
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.PEIMA_M6_RRM_DECISION_SHADOW_ENABLED;
    else process.env.PEIMA_M6_RRM_DECISION_SHADOW_ENABLED = prev;
  });

  function insightsWithPool() {
    return buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: fullUserProfile(0.55),
      candidateProfile: fullUserProfile(0.56),
      v2SelectorCandidates: pool,
    });
  }

  it("1. flag off — does not write rrmDecisionShadow", () => {
    const mi = insightsWithPool();
    expect(mi.rrmDecisionShadow).toBeUndefined();
  });

  it("2. flag on + valid selector + baseline same as Top2[0] → same_as_baseline", () => {
    const base = insightsWithPool();
    const top1 = base.rrmV2Top2Selector!.selectedTop2[0]!.candidateUserId;
    process.env.PEIMA_M6_RRM_DECISION_SHADOW_ENABLED = "1";
    const mi = buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: fullUserProfile(0.55),
      candidateProfile: fullUserProfile(0.56),
      v2SelectorCandidates: pool,
      baselineCandidateUserId: top1,
    });
    expect(mi.rrmDecisionShadow).toBeDefined();
    expect(mi.rrmDecisionShadow?.shadow.decision).toBe("same_as_baseline");
    expect(mi.rrmDecisionShadow?.comparison.sameAsBaseline).toBe(true);
    expect(mi.rrmDecisionShadow?.comparison.switchSuggested).toBe(false);
    expect(mi.rrmDecisionShadow?.guardrails.blocked).toBe(false);
    expect(mi.scoreShadowV2).toBeDefined();
    expect(mi.rrmV2Top2Selector?.eligible).toBe(true);
  });

  it("3. flag on + valid selector + baseline differs from Top2[0] → switch_to_top2_candidate", () => {
    process.env.PEIMA_M6_RRM_DECISION_SHADOW_ENABLED = "1";
    const mi = buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: fullUserProfile(0.55),
      candidateProfile: fullUserProfile(0.56),
      v2SelectorCandidates: pool,
      baselineCandidateUserId: "other-than-top1",
    });
    const top1 = mi.rrmV2Top2Selector!.selectedTop2[0]!.candidateUserId;
    expect(top1).not.toBe("other-than-top1");
    expect(mi.rrmDecisionShadow?.shadow.decision).toBe("switch_to_top2_candidate");
    expect(mi.rrmDecisionShadow?.comparison.switchSuggested).toBe(true);
  });

  it("4. flag on + missing scoreShadowV2 → no_shadow_decision", () => {
    const base = insightsWithPool();
    const top1 = base.rrmV2Top2Selector!.selectedTop2[0]!.candidateUserId;
    const { scoreShadowV2: _, ...rest } = base;
    process.env.PEIMA_M6_RRM_DECISION_SHADOW_ENABLED = "1";
    const shadow = buildRrmDecisionShadowPayload({
      baselineCandidateUserId: top1,
      finalScore: components.finalScore,
      insights: rest as typeof base,
    });
    expect(shadow.shadow.decision).toBe("no_shadow_decision");
    expect(shadow.guardrails.blockReasons).toContain("missing_score_shadow_v2");
  });

  it("5. flag on + missing rrmV2Top2Selector → no_shadow_decision", () => {
    process.env.PEIMA_M6_RRM_DECISION_SHADOW_ENABLED = "1";
    const mi = buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: fullUserProfile(0.55),
      candidateProfile: fullUserProfile(0.56),
      baselineCandidateUserId: "cand-x",
    });
    expect(mi.rrmV2Top2Selector).toBeUndefined();
    expect(mi.rrmDecisionShadow?.shadow.decision).toBe("no_shadow_decision");
    expect(mi.rrmDecisionShadow?.guardrails.blockReasons).toContain("missing_rrm_v2_top2_selector");
  });

  it("6. flag on + contextFlags high risk → no_shadow_decision", () => {
    process.env.PEIMA_M6_RRM_DECISION_SHADOW_ENABLED = "1";
    const mi = buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: fullUserProfile(0.35),
      candidateProfile: fullUserProfile(0.36),
      v2SelectorCandidates: [
        { candidateUserId: "cand-hi", candidateProfile: fullUserProfile(0.36) },
        { candidateUserId: "cand-lo", candidateProfile: fullUserProfile(0.65) },
      ],
      baselineCandidateUserId: "cand-hi",
    });
    expect(mi.rrmV2Top2Selector?.contextFlags.hasLowBand).toBe(true);
    expect(mi.rrmDecisionShadow?.shadow.decision).toBe("no_shadow_decision");
    expect(mi.rrmDecisionShadow?.guardrails.blockReasons).toContain("has_low_band");
  });

  it("7. scoreShadow v1 missing — non-blocking; inputPresence false", () => {
    process.env.PEIMA_M6_RRM_DECISION_SHADOW_ENABLED = "1";
    const base = insightsWithPool();
    const top1 = base.rrmV2Top2Selector!.selectedTop2[0]!.candidateUserId;
    const mi = buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: fullUserProfile(0.55),
      candidateProfile: fullUserProfile(0.56),
      v2SelectorCandidates: pool,
      baselineCandidateUserId: top1,
    });
    expect(mi.scoreShadow).toBeUndefined();
    expect(mi.rrmDecisionShadow?.inputPresence.scoreShadowV1LegacyPresent).toBe(false);
    expect(mi.rrmDecisionShadow?.shadow.decision).toBe("same_as_baseline");
  });

  it("8. malformed selectedTop2 row → no_shadow_decision, no throw", () => {
    const base = insightsWithPool();
    const corrupt = {
      ...base,
      rrmV2Top2Selector: {
        ...base.rrmV2Top2Selector!,
        selectedTop2: [{ candidateUserId: "" }],
      },
    };
    expect(() =>
      buildRrmDecisionShadowPayload({
        baselineCandidateUserId: "cand-a",
        finalScore: 0.5,
        insights: corrupt,
      }),
    ).not.toThrow();
    const s = buildRrmDecisionShadowPayload({
      baselineCandidateUserId: "cand-a",
      finalScore: 0.5,
      insights: corrupt,
    });
    expect(s.shadow.decision).toBe("no_shadow_decision");
    expect(s.guardrails.blockReasons).toContain("parse_error");
  });

  it('"TRUE" does not enable shadow', () => {
    process.env.PEIMA_M6_RRM_DECISION_SHADOW_ENABLED = "TRUE";
    const mi = insightsWithPool();
    expect(mi.rrmDecisionShadow).toBeUndefined();
  });
});
