import type { MatchResult } from "@peima/database";
import type { ViewerSafeFinalMatchDecisionMeta } from "../src/modules/matching/matching-result-display";
import {
  buildMultiSourceFinalDecisionReadonlyM51M0,
  MULTI_SOURCE_FINAL_DECISION_READONLY_SOURCE_VERSION,
} from "../src/modules/matching/matching-multi-source-final-decision-m51m0";

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
    selectedCandidateUserId: "cand-pw",
    staticTop1CandidateUserId: "cand-static",
    pairwiseWinnerCandidateUserId: "cand-pw",
    wouldChangeStaticResult: true,
    fallbackReason: null,
    frozen: true,
    frozenAt: "2026-05-01T12:00:00.000Z",
    appliedToFinalScore: false,
    appliedToWorkerRanking: false,
    ...over,
  };
}

describe("buildMultiSourceFinalDecisionReadonlyM51M0 (M5.1-M0/M1)", () => {
  it("echoes display fields and never proposes M5 display change", () => {
    const row = mr();
    const display = {
      displayCandidateUserId: "cand-pairwise",
      displaySourceType: "pairwise_final" as const,
      finalMatchDecisionMeta: null,
    };
    const sidecar = buildMultiSourceFinalDecisionReadonlyM51M0(row, display);
    expect(sidecar.sourceVersion).toBe(MULTI_SOURCE_FINAL_DECISION_READONLY_SOURCE_VERSION);
    expect(sidecar.baseline.matchResultCandidateUserId).toBe("cand-static");
    expect(sidecar.baseline.finalScore).toBe(0.82);
    expect(sidecar.currentDisplayCandidateUserId).toBe("cand-pairwise");
    expect(sidecar.currentDisplaySourceType).toBe("pairwise_final");
    expect(sidecar.m5ProposedDisplayCandidateUserId).toBeNull();
    expect(sidecar.m5AppliedToDisplay).toBe(false);
    expect(sidecar.wouldChangeCurrentDisplay).toBe(false);
    expect(sidecar.decisionRule).toBe("current_display_preserved_readonly");
    expect(sidecar.sources.pairwise.available).toBe(false);
    expect(sidecar.sources.rrmSim.available).toBe(false);
    expect(sidecar.sources.guardrails.status).toBe("not_evaluated");
    expect(sidecar.admin.missingSources).toEqual(
      expect.arrayContaining(["rrm_sim", "pairwise_finalize_meta", "guardrails_explicit_signal"]),
    );
    expect(sidecar.admin.decisionTrace[0]?.step).toBe("source_hydration_readonly");
  });

  it("echoes match_result_original when display equals baseline", () => {
    const row = mr();
    const display = {
      displayCandidateUserId: row.candidateUserId,
      displaySourceType: "match_result_original" as const,
      finalMatchDecisionMeta: null,
    };
    const sidecar = buildMultiSourceFinalDecisionReadonlyM51M0(row, display);
    expect(sidecar.currentDisplayCandidateUserId).toBe(row.candidateUserId);
    expect(sidecar.currentDisplaySourceType).toBe("match_result_original");
  });

  it("M5.1-M1 hydrates pairwise from viewer-safe finalize meta", () => {
    const row = mr();
    const display = {
      displayCandidateUserId: "cand-pw",
      displaySourceType: "pairwise_final" as const,
      finalMatchDecisionMeta: metaPartial(),
    };
    const sidecar = buildMultiSourceFinalDecisionReadonlyM51M0(row, display);
    const pw = sidecar.sources.pairwise;
    expect(pw.available).toBe(true);
    if (pw.available) {
      expect(pw.selectedCandidateUserId).toBe("cand-pw");
      expect(pw.pairwiseWinnerCandidateUserId).toBe("cand-pw");
      expect(pw.frozen).toBe(true);
    }
    expect(sidecar.admin.missingSources).toEqual(
      expect.arrayContaining(["rrm_sim", "guardrails_explicit_signal"]),
    );
    expect(sidecar.admin.missingSources).not.toContain("pairwise_finalize_meta");
  });

  it("M5.1-M1 guardrails caution from matchInsights cautions only", () => {
    const row = mr({
      matchInsights: {
        explanation: {
          whyMatch: "x",
          strengths: [],
          cautions: ["节奏偏快"],
          rhythmPrediction: "",
        },
        riskFlags: [],
        openingTopics: [],
        chatSimulationSummary: "",
      },
    });
    const display = {
      displayCandidateUserId: row.candidateUserId,
      displaySourceType: "match_result_original" as const,
      finalMatchDecisionMeta: null,
    };
    const sidecar = buildMultiSourceFinalDecisionReadonlyM51M0(row, display);
    expect(sidecar.sources.guardrails.status).toBe("caution");
    expect(sidecar.sources.guardrails.cautionReasons.some((s) => s.includes("节奏"))).toBe(true);
    expect(sidecar.admin.missingSources).not.toContain("guardrails_explicit_signal");
  });

  it("M5.1-M1 guardrails caution from finalize fallbackReason when no matchInsights", () => {
    const row = mr({ matchInsights: null });
    const display = {
      displayCandidateUserId: row.candidateUserId,
      displaySourceType: "static_fallback" as const,
      finalMatchDecisionMeta: metaPartial({
        fallbackReason: "pairwise_schema_failed",
        pairwiseProposalRecommendation: "pairwise_unavailable",
      }),
    };
    const sidecar = buildMultiSourceFinalDecisionReadonlyM51M0(row, display);
    expect(sidecar.sources.guardrails.status).toBe("caution");
    expect(sidecar.sources.guardrails.cautionReasons.some((s) => s.includes("finalize_fallback"))).toBe(true);
  });
});
