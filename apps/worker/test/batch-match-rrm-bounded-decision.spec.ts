/**
 * M6.3-r3 / M6.3-r4: `rrmBoundedDecision` dry-run meta behind `PEIMA_M6_RRM_BOUNDED_DECISION_DRY_RUN_ENABLED`.
 */

import { readM6RrmBoundedDecisionDryRunEnv } from "../src/jobs/batch-match-rrm-bounded-decision-env";
import { buildRrmBoundedDecisionDryRunPayload } from "../src/jobs/batch-match-rrm-bounded-decision";
import { buildRrmDecisionShadowPayload } from "../src/jobs/batch-match-rrm-decision-shadow";
import { buildWorkerMatchInsightsForBestMatch } from "../src/jobs/batch-match-match-insights";
import type { UserProfileLike } from "../src/jobs/matching-score";
import type { MatchInsights } from "@peima/shared/types";
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

describe("M6.3 rrmBoundedDecision dry-run", () => {
  let prevShadow: string | undefined;
  let prevDry: string | undefined;

  beforeEach(() => {
    prevShadow = process.env.PEIMA_M6_RRM_DECISION_SHADOW_ENABLED;
    prevDry = process.env.PEIMA_M6_RRM_BOUNDED_DECISION_DRY_RUN_ENABLED;
    delete process.env.PEIMA_M6_RRM_DECISION_SHADOW_ENABLED;
    delete process.env.PEIMA_M6_RRM_BOUNDED_DECISION_DRY_RUN_ENABLED;
  });

  afterEach(() => {
    if (prevShadow === undefined) delete process.env.PEIMA_M6_RRM_DECISION_SHADOW_ENABLED;
    else process.env.PEIMA_M6_RRM_DECISION_SHADOW_ENABLED = prevShadow;
    if (prevDry === undefined) delete process.env.PEIMA_M6_RRM_BOUNDED_DECISION_DRY_RUN_ENABLED;
    else process.env.PEIMA_M6_RRM_BOUNDED_DECISION_DRY_RUN_ENABLED = prevDry;
  });

  it("1. flag off — does not write rrmBoundedDecision", () => {
    process.env.PEIMA_M6_RRM_DECISION_SHADOW_ENABLED = "1";
    const mi = buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: fullUserProfile(0.55),
      candidateProfile: fullUserProfile(0.56),
      v2SelectorCandidates: pool,
      baselineCandidateUserId: "cand-a",
    });
    expect(mi.rrmBoundedDecision).toBeUndefined();
  });

  it("2. flag on + missing rrmDecisionShadow → fallback_baseline / missing_shadow", () => {
    process.env.PEIMA_M6_RRM_BOUNDED_DECISION_DRY_RUN_ENABLED = "1";
    const mi = buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: fullUserProfile(0.55),
      candidateProfile: fullUserProfile(0.56),
      v2SelectorCandidates: pool,
      baselineCandidateUserId: "cand-a",
    });
    expect(mi.rrmDecisionShadow).toBeUndefined();
    expect(mi.rrmBoundedDecision?.decision).toBe("fallback_baseline");
    expect(mi.rrmBoundedDecision?.fallbackReason).toBe("missing_shadow");
    expect(mi.rrmBoundedDecision?.fallbackUsed).toBe(true);
    expect(mi.scoreShadowV2).toBeDefined();
  });

  it("3. flag on + shadow same_as_baseline → would_use_baseline", () => {
    process.env.PEIMA_M6_RRM_DECISION_SHADOW_ENABLED = "1";
    process.env.PEIMA_M6_RRM_BOUNDED_DECISION_DRY_RUN_ENABLED = "1";
    const mi = buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: fullUserProfile(0.55),
      candidateProfile: fullUserProfile(0.56),
      v2SelectorCandidates: pool,
      baselineCandidateUserId: "cand-a",
    });
    expect(mi.rrmDecisionShadow?.shadow.decision).toBe("same_as_baseline");
    expect(mi.rrmBoundedDecision?.decision).toBe("would_use_baseline");
    expect(mi.rrmBoundedDecision?.wouldSwitch).toBe(false);
    expect(mi.rrmBoundedDecision?.fallbackUsed).toBe(false);
    expect(mi.rrmBoundedDecision?.baselineRef.id).toBe("cand-a");
  });

  it("4. flag on + switch_to_top2_candidate valid → would_switch_to_rrm", () => {
    process.env.PEIMA_M6_RRM_DECISION_SHADOW_ENABLED = "1";
    process.env.PEIMA_M6_RRM_BOUNDED_DECISION_DRY_RUN_ENABLED = "1";
    const mi = buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: fullUserProfile(0.55),
      candidateProfile: fullUserProfile(0.56),
      v2SelectorCandidates: pool,
      baselineCandidateUserId: "other-than-top1",
    });
    expect(mi.rrmDecisionShadow?.shadow.decision).toBe("switch_to_top2_candidate");
    expect(mi.rrmBoundedDecision?.decision).toBe("would_switch_to_rrm");
    expect(mi.rrmBoundedDecision?.wouldSwitch).toBe(true);
    expect(mi.rrmBoundedDecision?.boundedRef?.id).toBe("cand-a");
    expect(mi.rrmBoundedDecision?.baselineRef.id).toBe("other-than-top1");
    expect(components.finalScore).toBe(0.63);
  });

  it("5. flag on + no_shadow_decision → fallback_baseline / shadow_not_switch", () => {
    process.env.PEIMA_M6_RRM_BOUNDED_DECISION_DRY_RUN_ENABLED = "1";
    process.env.PEIMA_M6_RRM_DECISION_SHADOW_ENABLED = "1";
    const base = buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: fullUserProfile(0.55),
      candidateProfile: fullUserProfile(0.56),
      v2SelectorCandidates: pool,
    });
    const top1 = base.rrmV2Top2Selector!.selectedTop2[0]!.candidateUserId;
    const { scoreShadowV2: _, ...rest } = base;
    const shadow = buildRrmDecisionShadowPayload({
      baselineCandidateUserId: top1,
      finalScore: components.finalScore,
      insights: rest as typeof base,
    });
    const mi = { ...rest, rrmDecisionShadow: shadow };
    const b = buildRrmBoundedDecisionDryRunPayload({
      insights: mi,
      baselineCandidateUserId: top1,
    });
    expect(shadow.shadow.decision).toBe("no_shadow_decision");
    expect(b?.decision).toBe("fallback_baseline");
    expect(b?.fallbackReason).toBe("shadow_not_switch");
  });

  it("6. flag on + guardrails.blocked → fallback_baseline / guardrail_blocked", () => {
    process.env.PEIMA_M6_RRM_DECISION_SHADOW_ENABLED = "1";
    process.env.PEIMA_M6_RRM_BOUNDED_DECISION_DRY_RUN_ENABLED = "1";
    const mi = buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: fullUserProfile(0.55),
      candidateProfile: fullUserProfile(0.56),
      v2SelectorCandidates: pool,
      baselineCandidateUserId: "other-than-top1",
    });
    const sh = structuredClone(mi.rrmDecisionShadow!) as typeof mi.rrmDecisionShadow;
    sh.guardrails = {
      ...sh.guardrails,
      blocked: true,
      blockReasons: ["has_low_band"],
    };
    const b = buildRrmBoundedDecisionDryRunPayload({
      insights: { ...mi, rrmDecisionShadow: sh },
      baselineCandidateUserId: "other-than-top1",
    });
    expect(b?.decision).toBe("fallback_baseline");
    expect(b?.fallbackReason).toBe("guardrail_blocked");
  });

  it("7. flag on + missing scoreShadowV2 → fallback_baseline / missing_score_shadow_v2", () => {
    process.env.PEIMA_M6_RRM_DECISION_SHADOW_ENABLED = "1";
    process.env.PEIMA_M6_RRM_BOUNDED_DECISION_DRY_RUN_ENABLED = "1";
    const mi = buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: fullUserProfile(0.55),
      candidateProfile: fullUserProfile(0.56),
      v2SelectorCandidates: pool,
      baselineCandidateUserId: "other-than-top1",
    });
    const { scoreShadowV2: __, ...rest } = mi;
    const b = buildRrmBoundedDecisionDryRunPayload({
      insights: rest as typeof mi,
      baselineCandidateUserId: "other-than-top1",
    });
    expect(b?.fallbackReason).toBe("missing_score_shadow_v2");
  });

  it("8. scoreShadow v1 missing — inputPresence.scoreShadowV1LegacyPresent = false", () => {
    process.env.PEIMA_M6_RRM_DECISION_SHADOW_ENABLED = "1";
    process.env.PEIMA_M6_RRM_BOUNDED_DECISION_DRY_RUN_ENABLED = "1";
    const mi = buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: fullUserProfile(0.55),
      candidateProfile: fullUserProfile(0.56),
      v2SelectorCandidates: pool,
      baselineCandidateUserId: "cand-a",
    });
    expect(mi.scoreShadow).toBeUndefined();
    expect(mi.rrmBoundedDecision?.inputPresence.scoreShadowV1LegacyPresent).toBe(false);
  });

  it("9. malformed shadow → fallback_baseline / malformed_shadow; no throw", () => {
    process.env.PEIMA_M6_RRM_BOUNDED_DECISION_DRY_RUN_ENABLED = "1";
    const mi = buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: fullUserProfile(0.55),
      candidateProfile: fullUserProfile(0.56),
      v2SelectorCandidates: pool,
      baselineCandidateUserId: "cand-a",
    });
    const b = buildRrmBoundedDecisionDryRunPayload({
      insights: { ...mi, rrmDecisionShadow: { notValid: true } as typeof mi.rrmDecisionShadow },
      baselineCandidateUserId: "cand-a",
    });
    expect(b?.decision).toBe("fallback_baseline");
    expect(b?.fallbackReason).toBe("malformed_shadow");
  });

  it("10. \"TRUE\" does not enable dry-run", () => {
    process.env.PEIMA_M6_RRM_BOUNDED_DECISION_DRY_RUN_ENABLED = "TRUE";
    process.env.PEIMA_M6_RRM_DECISION_SHADOW_ENABLED = "1";
    const mi = buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: fullUserProfile(0.55),
      candidateProfile: fullUserProfile(0.56),
      v2SelectorCandidates: pool,
      baselineCandidateUserId: "cand-a",
    });
    expect(mi.rrmBoundedDecision).toBeUndefined();
  });

  it("M6.3-r4 Case 1b: DRY_RUN env only literal \"1\" enables", () => {
    for (const v of [undefined, "", "0", "true", "TRUE", "yes"]) {
      if (v === undefined) delete process.env.PEIMA_M6_RRM_BOUNDED_DECISION_DRY_RUN_ENABLED;
      else process.env.PEIMA_M6_RRM_BOUNDED_DECISION_DRY_RUN_ENABLED = v;
      expect(readM6RrmBoundedDecisionDryRunEnv().enabled).toBe(false);
    }
    process.env.PEIMA_M6_RRM_BOUNDED_DECISION_DRY_RUN_ENABLED = "1";
    expect(readM6RrmBoundedDecisionDryRunEnv().enabled).toBe(true);
  });

  it("M6.3-r4 Case 8: empty selectedTop2 → missing_selected_top2", () => {
    process.env.PEIMA_M6_RRM_DECISION_SHADOW_ENABLED = "1";
    process.env.PEIMA_M6_RRM_BOUNDED_DECISION_DRY_RUN_ENABLED = "1";
    const mi = buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: fullUserProfile(0.55),
      candidateProfile: fullUserProfile(0.56),
      v2SelectorCandidates: pool,
      baselineCandidateUserId: "other-than-top1",
    });
    const sel = { ...mi.rrmV2Top2Selector!, selectedTop2: [] };
    const b = buildRrmBoundedDecisionDryRunPayload({
      insights: { ...mi, rrmV2Top2Selector: sel },
      baselineCandidateUserId: "other-than-top1",
    });
    expect(b?.decision).toBe("fallback_baseline");
    expect(b?.fallbackReason).toBe("missing_selected_top2");
  });

  it("M6.3-r4 Case 10: shadow sourceVersion mismatch → source_version_mismatch", () => {
    process.env.PEIMA_M6_RRM_BOUNDED_DECISION_DRY_RUN_ENABLED = "1";
    process.env.PEIMA_M6_RRM_DECISION_SHADOW_ENABLED = "1";
    const mi = buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: fullUserProfile(0.55),
      candidateProfile: fullUserProfile(0.56),
      v2SelectorCandidates: pool,
      baselineCandidateUserId: "cand-a",
    });
    const sh = structuredClone(mi.rrmDecisionShadow!) as typeof mi.rrmDecisionShadow;
    (sh as { sourceVersion: string }).sourceVersion = "wrong-version";
    const b = buildRrmBoundedDecisionDryRunPayload({
      insights: { ...mi, rrmDecisionShadow: sh },
      baselineCandidateUserId: "cand-a",
    });
    expect(b?.fallbackReason).toBe("source_version_mismatch");
  });

  it("M6.3-r4 Case 12: unexpected throw during read → unexpected_exception; no throw out", () => {
    process.env.PEIMA_M6_RRM_BOUNDED_DECISION_DRY_RUN_ENABLED = "1";
    process.env.PEIMA_M6_RRM_DECISION_SHADOW_ENABLED = "1";
    const mi = buildWorkerMatchInsightsForBestMatch({
      components,
      candidate,
      viewerProfile: fullUserProfile(0.55),
      candidateProfile: fullUserProfile(0.56),
      v2SelectorCandidates: pool,
      baselineCandidateUserId: "cand-a",
    });
    const proxied = new Proxy(mi, {
      get(target, prop, receiver) {
        if (prop === "scoreShadowV2") throw new Error("forced");
        return Reflect.get(target, prop, receiver);
      },
    });
    const b = buildRrmBoundedDecisionDryRunPayload({
      insights: proxied as MatchInsights,
      baselineCandidateUserId: "cand-a",
    });
    expect(b?.decision).toBe("fallback_baseline");
    expect(b?.fallbackReason).toBe("unexpected_exception");
  });
});
