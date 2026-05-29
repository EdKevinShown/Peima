import type { MatchResult } from "@peima/database";
import type { ViewerSafeFinalMatchDecisionMeta } from "../src/modules/matching/matching-result-display";
import {
  buildMultiSourceFinalDecisionReadonlyM51M0,
  MULTI_SOURCE_FINAL_DECISION_READONLY_SOURCE_VERSION,
  RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY,
  tryParseRrmSimReadonlySummaryFromMatchInsights,
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

describe("buildMultiSourceFinalDecisionReadonlyM51M0 (M5.1-M0/M1/M2)", () => {
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
    if (!sidecar.sources.rrmSim.available) {
      expect(sidecar.sources.rrmSim.unavailableReason).toBe(
        "no_viewer_safe_rrm_sim_summary_in_match_result_payload",
      );
    }
    expect(sidecar.sources.guardrails.status).toBe("pass");
    expect(sidecar.admin.missingSources).toEqual(
      expect.arrayContaining(["rrm_sim", "pairwise_finalize_meta"]),
    );
    expect(sidecar.mode).toBe("readonly");
    expect(sidecar.decisionRule).toBe("current_display_preserved_readonly");
    expect(sidecar.shadow.shadowModeRequested).toBe(false);
    expect(sidecar.shadow.shadowContractEvaluated).toBe(false);
    expect(sidecar.shadow.shadowDisplayProposalComputed).toBe(false);
    expect(sidecar.admin.decisionTrace.map((t) => t.step)).toEqual([
      "source_hydration_readonly",
      "rrm_sim_source_discovery_readonly",
    ]);
  });

  it("M5.2-M0/M5.2-M3: shadow mode evaluates proposal rules (pairwise missing → no proposal)", () => {
    const row = mr();
    const display = {
      displayCandidateUserId: row.candidateUserId,
      displaySourceType: "match_result_original" as const,
      finalMatchDecisionMeta: null,
    };
    const sidecar = buildMultiSourceFinalDecisionReadonlyM51M0(row, display, { shadowEnabled: true });
    expect(sidecar.mode).toBe("shadow");
    expect(sidecar.decisionRule).toBe("shadow_pairwise_unavailable_current_display_preserved");
    expect(sidecar.m5ProposedDisplayCandidateUserId).toBeNull();
    expect(sidecar.shadow.shadowModeRequested).toBe(true);
    expect(sidecar.shadow.shadowContractEvaluated).toBe(true);
    expect(sidecar.shadow.shadowDisplayProposalComputed).toBe(true);
    expect(sidecar.shadow.reason).toBe("pairwise_unavailable");
    expect(sidecar.shadow.sourcesBlockingShadowProposal).toEqual(
      expect.arrayContaining(["pairwise_finalize_meta"]),
    );
    expect(sidecar.admin.decisionTrace.map((t) => t.step)).toEqual([
      "source_hydration_readonly",
      "rrm_sim_source_discovery_readonly",
      "shadow_contract_readonly",
    ]);
    expect(sidecar.admin.decisionTrace[2]?.detail).toBe("m52m3_shadow_pairwise_unavailable");
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
    expect(sidecar.admin.missingSources).toEqual(expect.arrayContaining(["rrm_sim"]));
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
    expect(sidecar.sources.rrmSim.available).toBe(false);
    if (!sidecar.sources.rrmSim.available) {
      expect(sidecar.sources.rrmSim.unavailableReason).toBe(
        "rrm_sim_exists_only_in_observability_or_batch_context",
      );
    }
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

  it("M5.1-M2: rhythmPrediction placeholder implies rrm_sim_requires_shadow_or_m5_2_wiring", () => {
    const row = mr({
      matchInsights: {
        explanation: {
          whyMatch: "w",
          strengths: [],
          cautions: [],
          rhythmPrediction: "初期互动可能偏理性确认型",
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
    expect(sidecar.sources.rrmSim.available).toBe(false);
    if (!sidecar.sources.rrmSim.available) {
      expect(sidecar.sources.rrmSim.unavailableReason).toBe("rrm_sim_requires_shadow_or_m5_2_wiring");
    }
    expect(sidecar.admin.decisionTrace[1]?.detail).toBe(
      "rhythm_prediction_placeholder_without_rrm_sim_readonly_summary",
    );
  });

  it("M5.1-M2: hydrates rrmSim from matchInsights.rrmSimReadonlySummary when contract valid", () => {
    const row = mr({
      matchInsights: {
        explanation: {
          whyMatch: "w",
          strengths: [],
          cautions: [],
          rhythmPrediction: "placeholder would be ignored when summary parses",
        },
        riskFlags: [],
        openingTopics: [],
        chatSimulationSummary: "",
        [RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY]: {
          schemaVersion: 1,
          sourceVersion: "rrm-sim-v1",
          sourceType: "ai_simulation_job_echo",
          candidateUserId: "cand-rrm",
          fallbackUsed: false,
          unavailableReason: null,
          suggestedAction: "maintain",
          progressionWindow: "open",
          simulatedRhythmScore: 72,
          cautionFlags: ["RRM_OK"],
          confidenceBucket: "high",
        },
      },
    });
    const display = {
      displayCandidateUserId: row.candidateUserId,
      displaySourceType: "match_result_original" as const,
      finalMatchDecisionMeta: null,
    };
    const sidecar = buildMultiSourceFinalDecisionReadonlyM51M0(row, display);
    const rrm = sidecar.sources.rrmSim;
    expect(rrm.available).toBe(true);
    if (rrm.available) {
      expect(rrm.sourceVersion).toBe("rrm-sim-v1");
      expect(rrm.candidateUserId).toBe("cand-rrm");
      expect(rrm.simulatedRhythmScore).toBe(72);
    }
    expect(sidecar.admin.missingSources).not.toContain("rrm_sim");
    expect(sidecar.admin.decisionTrace[1]?.detail).toBe("hydrated_from_match_insights_rrm_sim_readonly_summary");
  });

  it("M5.1-M2: invalid rrmSimReadonlySummary yields no_viewer_safe reason", () => {
    const row = mr({
      matchInsights: {
        explanation: {
          whyMatch: "w",
          strengths: [],
          cautions: [],
          rhythmPrediction: "",
        },
        riskFlags: [],
        openingTopics: [],
        chatSimulationSummary: "",
        [RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY]: { schemaVersion: 1, sourceVersion: "unknown-v99" },
      },
    });
    const display = {
      displayCandidateUserId: row.candidateUserId,
      displaySourceType: "match_result_original" as const,
      finalMatchDecisionMeta: null,
    };
    const sidecar = buildMultiSourceFinalDecisionReadonlyM51M0(row, display);
    expect(sidecar.sources.rrmSim.available).toBe(false);
    if (!sidecar.sources.rrmSim.available) {
      expect(sidecar.sources.rrmSim.unavailableReason).toBe(
        "no_viewer_safe_rrm_sim_summary_in_match_result_payload",
      );
    }
  });
});

describe("M5.2-M3 shadow proposal computation", () => {
  const rrmSummary = (candidateUserId: string) => ({
    schemaVersion: 1,
    sourceVersion: "rrm-sim-v1",
    candidateUserId,
    fallbackUsed: false,
    suggestedAction: "maintain",
    progressionWindow: "open",
    simulatedRhythmScore: 70,
  });

  it("consensus sets m5ProposedDisplayCandidateUserId and wouldChangeCurrentDisplay", () => {
    const row = mr({
      matchInsights: {
        explanation: { whyMatch: "w", strengths: [], cautions: [], rhythmPrediction: "" },
        riskFlags: [],
        openingTopics: [],
        chatSimulationSummary: "",
        [RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY]: rrmSummary("cand-consensus"),
      },
    });
    const display = {
      displayCandidateUserId: "cand-static",
      displaySourceType: "match_result_original" as const,
      finalMatchDecisionMeta: metaPartial({
        pairwiseWinnerCandidateUserId: "cand-consensus",
        selectedCandidateUserId: "cand-consensus",
      }),
    };
    const sidecar = buildMultiSourceFinalDecisionReadonlyM51M0(row, display, { shadowEnabled: true });
    expect(sidecar.decisionRule).toBe("shadow_pairwise_rrm_consensus");
    expect(sidecar.m5ProposedDisplayCandidateUserId).toBe("cand-consensus");
    expect(sidecar.wouldChangeCurrentDisplay).toBe(true);
    expect(sidecar.m5AppliedToDisplay).toBe(false);
    expect(sidecar.shadow.reason).toBe("pairwise_rrm_consensus");
    expect(sidecar.shadow.noProposalReason).toBeNull();
    expect(sidecar.shadow.shadowCautionReasonsEcho).toEqual([]);
  });

  it("consensus with display already equal yields wouldChangeCurrentDisplay false", () => {
    const row = mr({
      matchInsights: {
        explanation: { whyMatch: "w", strengths: [], cautions: [], rhythmPrediction: "" },
        riskFlags: [],
        openingTopics: [],
        chatSimulationSummary: "",
        [RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY]: rrmSummary("cand-same"),
      },
    });
    const display = {
      displayCandidateUserId: "cand-same",
      displaySourceType: "pairwise_final" as const,
      finalMatchDecisionMeta: metaPartial({
        pairwiseWinnerCandidateUserId: "cand-same",
        selectedCandidateUserId: "cand-same",
      }),
    };
    const sidecar = buildMultiSourceFinalDecisionReadonlyM51M0(row, display, { shadowEnabled: true });
    expect(sidecar.decisionRule).toBe("shadow_pairwise_rrm_consensus");
    expect(sidecar.m5ProposedDisplayCandidateUserId).toBe("cand-same");
    expect(sidecar.wouldChangeCurrentDisplay).toBe(false);
  });

  it("pairwise vs rrmSim mismatch → conflict rule", () => {
    const row = mr({
      matchInsights: {
        explanation: { whyMatch: "w", strengths: [], cautions: [], rhythmPrediction: "" },
        riskFlags: [],
        openingTopics: [],
        chatSimulationSummary: "",
        [RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY]: rrmSummary("cand-rrm"),
      },
    });
    const display = {
      displayCandidateUserId: "cand-static",
      displaySourceType: "match_result_original" as const,
      finalMatchDecisionMeta: metaPartial({
        pairwiseWinnerCandidateUserId: "cand-pw",
        selectedCandidateUserId: "cand-pw",
      }),
    };
    const sidecar = buildMultiSourceFinalDecisionReadonlyM51M0(row, display, { shadowEnabled: true });
    expect(sidecar.decisionRule).toBe("shadow_pairwise_rrm_conflict_current_display_preserved");
    expect(sidecar.m5ProposedDisplayCandidateUserId).toBeNull();
    expect(sidecar.shadow.reason).toBe("pairwise_rrm_conflict");
  });

  it("shadow + pairwise ok + rrm missing → rrm_sim_unavailable rule", () => {
    const row = mr({ matchInsights: null });
    const display = {
      displayCandidateUserId: "cand-static",
      displaySourceType: "pairwise_final" as const,
      finalMatchDecisionMeta: metaPartial(),
    };
    const sidecar = buildMultiSourceFinalDecisionReadonlyM51M0(row, display, { shadowEnabled: true });
    expect(sidecar.decisionRule).toBe("shadow_rrm_sim_unavailable_current_display_preserved");
    expect(sidecar.shadow.reason).toBe("rrm_sim_unavailable");
  });

  it("guardrail block sentinel → no proposal", () => {
    const row = mr({
      matchInsights: {
        explanation: { whyMatch: "w", strengths: [], cautions: [], rhythmPrediction: "" },
        riskFlags: ["peima_m52_shadow_test_block"],
        openingTopics: [],
        chatSimulationSummary: "",
        [RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY]: rrmSummary("cand-x"),
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
    expect(sidecar.sources.guardrails.status).toBe("block");
    expect(sidecar.decisionRule).toBe("shadow_guardrail_block_current_display_preserved");
    expect(sidecar.m5ProposedDisplayCandidateUserId).toBeNull();
    expect(sidecar.shadow.reason).toBe("guardrail_block");
  });

  it("guardrail not_evaluated sentinel → no proposal", () => {
    const row = mr({
      matchInsights: {
        explanation: { whyMatch: "w", strengths: [], cautions: [], rhythmPrediction: "" },
        riskFlags: ["peima_m52_shadow_test_not_evaluated"],
        openingTopics: [],
        chatSimulationSummary: "",
        [RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY]: rrmSummary("cand-x"),
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
    expect(sidecar.sources.guardrails.status).toBe("not_evaluated");
    expect(sidecar.decisionRule).toBe("shadow_guardrail_not_evaluated_current_display_preserved");
    expect(sidecar.m5ProposedDisplayCandidateUserId).toBeNull();
  });

  it("caution + consensus echoes shadowCautionReasonsEcho", () => {
    const row = mr({
      matchInsights: {
        explanation: { whyMatch: "w", strengths: [], cautions: ["pace note"], rhythmPrediction: "" },
        riskFlags: [],
        openingTopics: [],
        chatSimulationSummary: "",
        [RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY]: rrmSummary("cand-c"),
      },
    });
    const display = {
      displayCandidateUserId: "cand-static",
      displaySourceType: "pairwise_final" as const,
      finalMatchDecisionMeta: metaPartial({
        pairwiseWinnerCandidateUserId: "cand-c",
        selectedCandidateUserId: "cand-c",
      }),
    };
    const sidecar = buildMultiSourceFinalDecisionReadonlyM51M0(row, display, { shadowEnabled: true });
    expect(sidecar.sources.guardrails.status).toBe("caution");
    expect(sidecar.decisionRule).toBe("shadow_pairwise_rrm_consensus");
    expect(sidecar.m5ProposedDisplayCandidateUserId).toBe("cand-c");
    expect(sidecar.shadow.shadowCautionReasonsEcho.some((s) => s.includes("pace"))).toBe(true);
  });
});

describe("tryParseRrmSimReadonlySummaryFromMatchInsights", () => {
  it("accepts m4.0 readonly proposal echo sourceVersion", () => {
    const v = tryParseRrmSimReadonlySummaryFromMatchInsights({
      [RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY]: {
        schemaVersion: 1,
        sourceVersion: "m4.0-readonly-rrm-ranking-proposal-v1",
        recommendation: "diagnostic_only",
        progressionWindow: "weak_open",
      },
    });
    expect(v).not.toBeNull();
    expect(v?.sourceVersion).toBe("m4.0-readonly-rrm-ranking-proposal-v1");
    expect(v?.progressionWindow).toBe("weak_open");
  });
});
