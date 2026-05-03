import type { MatchResult } from "@peima/database";
import {
  buildM5ShadowAuditSummary,
  M5_SHADOW_AUDIT_NOTE_VIEWER_SAFE_PASS,
  M5_SHADOW_AUDIT_SOURCE_VERSION,
} from "../src/modules/matching/matching-m5-shadow-audit";
import {
  buildMultiSourceFinalDecisionReadonlyM51M0,
  RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY,
} from "../src/modules/matching/matching-multi-source-final-decision-m51m0";
import type { ViewerSafeFinalMatchDecisionMeta } from "../src/modules/matching/matching-result-display";

function mr(over: Partial<MatchResult> = {}): MatchResult {
  return {
    id: "mr-1",
    userId: "viewer-1",
    candidateUserId: "cand-static",
    batchId: "batch-1",
    finalScore: 0.82,
    reasonSummary: "ok",
    status: "active",
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    matchInsights: null,
    ...over,
  } as MatchResult;
}

function metaPartial(over: Partial<ViewerSafeFinalMatchDecisionMeta> = {}): ViewerSafeFinalMatchDecisionMeta {
  return {
    sourceType: "static_final",
    mode: "enabled",
    pairwiseProposalRecommendation: "pairwise_winner_eligible",
    selectedCandidateUserId: "cand-x",
    staticTop1CandidateUserId: "cand-static",
    pairwiseWinnerCandidateUserId: "cand-x",
    wouldChangeStaticResult: true,
    fallbackReason: null,
    frozen: true,
    frozenAt: "2026-05-01T12:00:00.000Z",
    appliedToFinalScore: false,
    appliedToWorkerRanking: false,
    ...over,
  };
}

describe("buildM5ShadowAuditSummary (M5.2-M4)", () => {
  it("aggregates shadow consensus and viewer_safe_no_caution pass separately", () => {
    const row = mr({
      matchInsights: {
        explanation: { whyMatch: "w", strengths: [], cautions: [], rhythmPrediction: "" },
        riskFlags: [],
        openingTopics: [],
        chatSimulationSummary: "",
        [RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY]: {
          schemaVersion: 1,
          sourceVersion: "rrm-sim-v1",
          candidateUserId: "cand-x",
          fallbackUsed: false,
          suggestedAction: "maintain",
          progressionWindow: "open",
          simulatedRhythmScore: 70,
        },
      },
    });
    const display = {
      displayCandidateUserId: "cand-static",
      displaySourceType: "match_result_original" as const,
      finalMatchDecisionMeta: metaPartial({
        pairwiseWinnerCandidateUserId: "cand-x",
        selectedCandidateUserId: "cand-x",
      }),
    };
    const sidecar = buildMultiSourceFinalDecisionReadonlyM51M0(row, display, { shadowEnabled: true });
    const summary = buildM5ShadowAuditSummary(
      [{ matchResultId: "mr-1", multiSourceFinalDecision: sidecar }],
      { auditRunAt: "2026-05-02T00:00:00.000Z" },
    );
    expect(summary.sourceVersion).toBe(M5_SHADOW_AUDIT_SOURCE_VERSION);
    expect(summary.auditRunAt).toBe("2026-05-02T00:00:00.000Z");
    expect(summary.totalItems).toBe(1);
    expect(summary.itemsWithValidSidecar).toBe(1);
    expect(summary.itemsSkippedInvalidSidecar).toBe(0);
    expect(summary.modeShadowCount).toBe(1);
    expect(summary.shadowConsensusDecisionRuleCount).toBe(1);
    expect(summary.decisionRuleCounts["shadow_pairwise_rrm_consensus"]).toBe(1);
    expect(summary.m5ProposedNonNullCount).toBe(1);
    expect(summary.wouldChangeCurrentDisplayTrueCount).toBe(1);
    expect(summary.pairwiseSourceAvailableCount).toBe(1);
    expect(summary.rrmSimSourceAvailableCount).toBe(1);
    expect(summary.guardrailPassViewerSafeNoCautionSignalCount).toBe(1);
    expect(summary.guardrailPassOtherCount).toBe(0);
    expect(summary.guardrailCautionCount).toBe(0);
    expect(summary.notes[0]).toBe(M5_SHADOW_AUDIT_NOTE_VIEWER_SAFE_PASS);
  });

  it("counts guardrail caution without treating it as viewer_safe pass", () => {
    const row = mr({
      matchInsights: {
        explanation: { whyMatch: "w", strengths: [], cautions: ["c1"], rhythmPrediction: "" },
        riskFlags: [],
        openingTopics: [],
        chatSimulationSummary: "",
        [RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY]: {
          schemaVersion: 1,
          sourceVersion: "rrm-sim-v1",
          candidateUserId: "cand-x",
          fallbackUsed: false,
          suggestedAction: "maintain",
          progressionWindow: "open",
          simulatedRhythmScore: 70,
        },
      },
    });
    const display = {
      displayCandidateUserId: "cand-static",
      displaySourceType: "pairwise_final" as const,
      finalMatchDecisionMeta: metaPartial({
        pairwiseWinnerCandidateUserId: "cand-x",
        selectedCandidateUserId: "cand-x",
      }),
    };
    const sidecar = buildMultiSourceFinalDecisionReadonlyM51M0(row, display, { shadowEnabled: true });
    const summary = buildM5ShadowAuditSummary([{ multiSourceFinalDecision: sidecar }]);
    expect(summary.guardrailCautionCount).toBe(1);
    expect(summary.guardrailPassViewerSafeNoCautionSignalCount).toBe(0);
    expect(summary.shadowConsensusDecisionRuleCount).toBe(1);
  });

  it("skips invalid sidecars without throwing", () => {
    const summary = buildM5ShadowAuditSummary([
      { multiSourceFinalDecision: null },
      { multiSourceFinalDecision: { schemaVersion: 2 } },
      { multiSourceFinalDecision: { schemaVersion: 1, mode: "bad" } },
    ]);
    expect(summary.totalItems).toBe(3);
    expect(summary.itemsWithValidSidecar).toBe(0);
    expect(summary.itemsSkippedInvalidSidecar).toBe(3);
  });
});
