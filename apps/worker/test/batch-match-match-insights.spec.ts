import { buildWorkerMatchInsightsForBestMatch } from "../src/jobs/batch-match-match-insights";
import type { UserProfileLike } from "../src/jobs/matching-score";
import { G1R_PROFILE_AXIS_KEYS } from "../src/jobs/relationship-profile-score-v2";
import { RELATIONSHIP_PROFILE_SCORE_V2_VERSION } from "../src/jobs/relationship-profile-score-v2";

function fullUserProfile(v: number): UserProfileLike {
  const p = {} as NonNullable<Exclude<UserProfileLike, null>>;
  for (const k of G1R_PROFILE_AXIS_KEYS) {
    p[k] = v;
  }
  return p;
}

const BANDS = [
  "strong_conflict",
  "low",
  "medium",
  "good",
  "high",
] as const;

describe("buildWorkerMatchInsightsForBestMatch (J3 shadow merge)", () => {
  let prevDry: string | undefined;

  beforeEach(() => {
    prevDry = process.env.PEIMA_M6_RRM_BOUNDED_DECISION_DRY_RUN_ENABLED;
    delete process.env.PEIMA_M6_RRM_BOUNDED_DECISION_DRY_RUN_ENABLED;
  });

  afterEach(() => {
    if (prevDry === undefined) delete process.env.PEIMA_M6_RRM_BOUNDED_DECISION_DRY_RUN_ENABLED;
    else process.env.PEIMA_M6_RRM_BOUNDED_DECISION_DRY_RUN_ENABLED = prevDry;
  });

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

  it("1–2. writes scoreShadowV2 only (no scoreShadow v1 write)", () => {
    const vp = fullUserProfile(0.55);
    const cp = fullUserProfile(0.56);
    const mi = buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: vp,
      candidateProfile: cp,
    });
    expect(mi.scoreShadow).toBeUndefined();
    expect(mi.scoreShadowV2).toBeDefined();
    expect(mi.scoreShadowV2?.scoringVersion).toBe(
      RELATIONSHIP_PROFILE_SCORE_V2_VERSION,
    );
  });

  it("3. scoreShadowV2.scoringVersion is v2 shadow", () => {
    const mi = buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: fullUserProfile(0.5),
      candidateProfile: fullUserProfile(0.52),
    });
    expect(mi.scoreShadowV2?.scoringVersion).toBe(
      "m6.0-relationship-profile-score-v2-shadow",
    );
  });

  it("4–5. scoreShadowV2 scores in valid ranges", () => {
    const mi = buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: fullUserProfile(0.4),
      candidateProfile: fullUserProfile(0.9),
    });
    const v2 = mi.scoreShadowV2!;
    expect(v2.displayScore100).toBeGreaterThanOrEqual(0);
    expect(v2.displayScore100).toBeLessThanOrEqual(100);
    expect(v2.rawCompatibilityScore).toBeGreaterThanOrEqual(0);
    expect(v2.rawCompatibilityScore).toBeLessThanOrEqual(1);
    expect(v2.cappedRawScore).toBeGreaterThanOrEqual(0);
    expect(v2.cappedRawScore).toBeLessThanOrEqual(1);
  });

  it("6. scoreShadowV2.band is one of five tiers", () => {
    const mi = buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: fullUserProfile(0.5),
      candidateProfile: fullUserProfile(0.5),
    });
    expect(BANDS).toContain(mi.scoreShadowV2?.band);
  });

  it("7. does not mutate components.finalScore", () => {
    const c = { ...components };
    buildWorkerMatchInsightsForBestMatch({
      components: c,
      candidate,
      viewerProfile: fullUserProfile(0.5),
      candidateProfile: fullUserProfile(0.5),
    });
    expect(c.finalScore).toBe(components.finalScore);
  });

  it("8. without v2 pool, scoreShadowV2 JSON does not embed candidateUserId", () => {
    const mi = buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: fullUserProfile(0.5),
      candidateProfile: fullUserProfile(0.5),
    });
    const s = JSON.stringify(mi.scoreShadowV2);
    expect(s).not.toMatch(/candidateUserId/);
    expect(mi.rrmV2Top2Selector).toBeUndefined();
  });

  it("9. scoreShadowV2 present without v1 key collision", () => {
    const mi = buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: fullUserProfile(0.5),
      candidateProfile: fullUserProfile(0.6),
    });
    expect(mi.scoreShadow).toBeUndefined();
    expect(mi.scoreShadowV2?.displayScore100).toBeDefined();
    expect(Object.keys(mi).sort()).toEqual(
      expect.arrayContaining([
        "chatSimulationSummary",
        "explanation",
        "openingTopics",
        "riskFlags",
        "scoreShadowV2",
      ]),
    );
  });

  it("11. with v2 pool: scoreShadowV2 + rrmV2Top2Selector + placeholders coexist", () => {
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
    expect(mi.scoreShadow).toBeUndefined();
    expect(mi.scoreShadowV2?.scoringVersion).toBe(RELATIONSHIP_PROFILE_SCORE_V2_VERSION);
    expect(mi.rrmV2Top2Selector?.version).toBe("m6.0-rrm-v2-top2-selector-shadow-v1");
    expect(mi.rrmV2Top2Selector?.eligible).toBe(true);
    expect(mi.rrmV2Top2Selector?.reason).toBe("ok");
    expect(mi.rrmV2Top2Selector?.selectedTop2).toHaveLength(2);
    expect(mi.explanation?.whyMatch).toBeTruthy();
    expect(mi.openingTopics?.length).toBeGreaterThan(0);
  });

  it("M6.3-r4 Case 13: dry-run + shadow writes rrmBoundedDecision without breaking v2/shadow", () => {
    const prevShadow = process.env.PEIMA_M6_RRM_DECISION_SHADOW_ENABLED;
    const prevDry = process.env.PEIMA_M6_RRM_BOUNDED_DECISION_DRY_RUN_ENABLED;
    process.env.PEIMA_M6_RRM_DECISION_SHADOW_ENABLED = "1";
    process.env.PEIMA_M6_RRM_BOUNDED_DECISION_DRY_RUN_ENABLED = "1";
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
      baselineCandidateUserId: "cand-a",
    });
    expect(mi.scoreShadowV2).toBeDefined();
    expect(mi.scoreShadow).toBeUndefined();
    expect(mi.rrmV2Top2Selector?.eligible).toBe(true);
    expect(mi.rrmDecisionShadow?.shadow.decision).toBe("same_as_baseline");
    expect(mi.rrmBoundedDecision?.decision).toBe("would_use_baseline");
    expect(mi.rrmBoundedDecision?.sourceType).toBe("rrm_bounded_decision");
    if (prevShadow === undefined) delete process.env.PEIMA_M6_RRM_DECISION_SHADOW_ENABLED;
    else process.env.PEIMA_M6_RRM_DECISION_SHADOW_ENABLED = prevShadow;
    if (prevDry === undefined) delete process.env.PEIMA_M6_RRM_BOUNDED_DECISION_DRY_RUN_ENABLED;
    else process.env.PEIMA_M6_RRM_BOUNDED_DECISION_DRY_RUN_ENABLED = prevDry;
  });

  it("10. preserves explanation / openingTopics / riskFlags / chatSimulationSummary", () => {
    const mi = buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: fullUserProfile(0.5),
      candidateProfile: fullUserProfile(0.5),
    });
    expect(mi.explanation?.whyMatch).toBeTruthy();
    expect(mi.explanation?.strengths?.length).toBeGreaterThan(0);
    expect(mi.explanation?.cautions?.length).toBeGreaterThan(0);
    expect(mi.explanation?.rhythmPrediction).toBeTruthy();
    expect(mi.openingTopics?.length).toBeGreaterThan(0);
    expect(mi.riskFlags?.length).toBeGreaterThan(0);
    expect(mi.chatSimulationSummary).toBeTruthy();
  });
});
