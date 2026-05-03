import type { RrmSimReadonlySummaryPayloadV1 } from "../src/modules/matching/matching-rrm-sim-readonly-summary";
import { RRM_SIM_READONLY_SUMMARY_SOURCE_TYPE } from "../src/modules/matching/matching-rrm-sim-readonly-summary";
import { RRM_SIM_SOURCE_VERSION } from "../src/modules/ai-simulation-v1/rrm-sim.constants";
import { validateRrmTop2DisplayEligibility } from "../src/modules/matching/rrm-top2-display-eligibility";
import type { MatchResultRrmTop2DisplayMetaV1 } from "../src/modules/matching/rrm-top2-display-meta.types";
import { MATCH_RESULT_RRM_TOP2_DISPLAY_META_SOURCE_TYPE } from "../src/modules/matching/rrm-top2-display-meta.types";

function guardPass() {
  return {
    status: "pass" as const,
    blockReasons: [] as string[],
    cautionReasons: [] as string[],
    sourceSummary: "no_viewer_safe_caution_signals",
  };
}

function meta(over: Partial<MatchResultRrmTop2DisplayMetaV1> = {}): MatchResultRrmTop2DisplayMetaV1 {
  return {
    schemaVersion: 1,
    sourceType: MATCH_RESULT_RRM_TOP2_DISPLAY_META_SOURCE_TYPE,
    sourceVersion: "m5.3-rrm-top2-enabled-display-v1",
    baselineCandidateUserId: "baseline_x",
    previousDisplayCandidateUserId: "baseline_x",
    newDisplayCandidateUserId: "winner_x",
    decisionRule: "rrm_top2_winner_guardrails_pass",
    top2Fingerprint: "fp_stable",
    appliedToFinalScore: false,
    appliedToWorkerRanking: false,
    rollbackAvailable: true,
    ...over,
  };
}

function summary(over: Partial<RrmSimReadonlySummaryPayloadV1> = {}): RrmSimReadonlySummaryPayloadV1 {
  return {
    schemaVersion: 1,
    sourceType: RRM_SIM_READONLY_SUMMARY_SOURCE_TYPE,
    sourceVersion: RRM_SIM_SOURCE_VERSION,
    candidateUserId: "winner_x",
    winnerUserId: "winner_x",
    proposalCandidateUserId: "winner_x",
    scenarioKey: null,
    suggestedAction: null,
    progressionWindow: null,
    simulatedRhythmScore: null,
    recommendation: null,
    confidenceBucket: "high",
    fallbackUsed: false,
    unavailableReason: null,
    cautionFlags: [],
    generatedAt: "2026-05-03T00:00:00.000Z",
    frozenAt: null,
    ...over,
  };
}

describe("validateRrmTop2DisplayEligibility", () => {
  it("returns ok when all gates pass", () => {
    const r = validateRrmTop2DisplayEligibility({
      m5RrmTop2Enabled: true,
      matchResultCandidateUserId: "baseline_x",
      top2CandidateUserIds: ["baseline_x", "winner_x"],
      top2Fingerprint: "fp_stable",
      rrmDisplayMeta: meta(),
      rowTop2Fingerprint: "fp_stable",
      rrmSimReadonlySummary: summary(),
      guardrailsReadonly: guardPass(),
    });
    expect(r.ok).toBe(true);
    expect(r.noOpReasonCode).toBeNull();
  });

  it("env_off when disabled", () => {
    const r = validateRrmTop2DisplayEligibility({
      m5RrmTop2Enabled: false,
      matchResultCandidateUserId: "baseline_x",
      top2CandidateUserIds: ["baseline_x", "winner_x"],
      top2Fingerprint: "fp_stable",
      rrmDisplayMeta: meta(),
      rrmSimReadonlySummary: summary(),
      guardrailsReadonly: guardPass(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.noOpReasonCode).toBe("env_off");
  });

  it("meta_missing", () => {
    const r = validateRrmTop2DisplayEligibility({
      m5RrmTop2Enabled: true,
      matchResultCandidateUserId: "baseline_x",
      top2CandidateUserIds: ["baseline_x", "winner_x"],
      top2Fingerprint: "fp_stable",
      rrmDisplayMeta: null,
      rrmSimReadonlySummary: summary(),
      guardrailsReadonly: guardPass(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.noOpReasonCode).toBe("meta_missing");
  });

  it("baseline_mismatch", () => {
    const r = validateRrmTop2DisplayEligibility({
      m5RrmTop2Enabled: true,
      matchResultCandidateUserId: "other",
      top2CandidateUserIds: ["baseline_x", "winner_x"],
      top2Fingerprint: "fp_stable",
      rrmDisplayMeta: meta(),
      rrmSimReadonlySummary: summary(),
      guardrailsReadonly: guardPass(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.noOpReasonCode).toBe("baseline_mismatch");
  });

  it("fingerprint_mismatch on row echo", () => {
    const r = validateRrmTop2DisplayEligibility({
      m5RrmTop2Enabled: true,
      matchResultCandidateUserId: "baseline_x",
      top2CandidateUserIds: ["baseline_x", "winner_x"],
      top2Fingerprint: "fp_stable",
      rrmDisplayMeta: meta(),
      rowTop2Fingerprint: "other_fp",
      rrmSimReadonlySummary: summary(),
      guardrailsReadonly: guardPass(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.noOpReasonCode).toBe("fingerprint_mismatch");
  });

  it("guardrails_caution", () => {
    const r = validateRrmTop2DisplayEligibility({
      m5RrmTop2Enabled: true,
      matchResultCandidateUserId: "baseline_x",
      top2CandidateUserIds: ["baseline_x", "winner_x"],
      top2Fingerprint: "fp_stable",
      rrmDisplayMeta: meta(),
      rrmSimReadonlySummary: summary(),
      guardrailsReadonly: {
        status: "caution",
        blockReasons: [],
        cautionReasons: ["x"],
        sourceSummary: "caution",
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.noOpReasonCode).toBe("guardrails_caution");
  });

  it("rrm_confidence_low", () => {
    const r = validateRrmTop2DisplayEligibility({
      m5RrmTop2Enabled: true,
      matchResultCandidateUserId: "baseline_x",
      top2CandidateUserIds: ["baseline_x", "winner_x"],
      top2Fingerprint: "fp_stable",
      rrmDisplayMeta: meta(),
      rrmSimReadonlySummary: summary({ confidenceBucket: "low" }),
      guardrailsReadonly: guardPass(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.noOpReasonCode).toBe("rrm_confidence_low");
  });

  it("rrm_meta_winner_mismatch", () => {
    const r = validateRrmTop2DisplayEligibility({
      m5RrmTop2Enabled: true,
      matchResultCandidateUserId: "baseline_x",
      top2CandidateUserIds: ["baseline_x", "winner_x"],
      top2Fingerprint: "fp_stable",
      rrmDisplayMeta: meta({ newDisplayCandidateUserId: "baseline_x" }),
      rrmSimReadonlySummary: summary({ winnerUserId: "winner_x" }),
      guardrailsReadonly: guardPass(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.noOpReasonCode).toBe("rrm_meta_winner_mismatch");
  });
});
