import type { RrmSimResult } from "../src/modules/ai-simulation-v1/rrm-sim.types";
import {
  buildRrmSimMultiCandidateDiagnostic,
  type RrmSimDiagnosticJobResultItem,
} from "../src/modules/ai-simulation-v1/ai-simulation-v1-rrm-multi-candidate-diagnostic";
import {
  buildRrmRankingProposal,
  RRM_RANKING_PROPOSAL_SOURCE_VERSION,
} from "../src/modules/ai-simulation-v1/ai-simulation-v1-rrm-ranking-proposal";

function mockRrm(partial: Partial<RrmSimResult> & { scores: RrmSimResult["scores"] }): RrmSimResult {
  return {
    schemaVersion: 1,
    sourceVersion: "rrm-sim-v1",
    sourceSimulationVersion: "ai-match-simulation-rrm-ready-v2",
    fallbackUsed: partial.fallbackUsed ?? false,
    rrmUnavailableReason: partial.rrmUnavailableReason ?? null,
    scores: partial.scores,
    scenarioScores: partial.scenarioScores ?? [],
    levels: partial.levels ?? {
      relationshipCapacity: "medium",
      contextualFit: "medium",
      emotionalSafety: "medium",
      feedbackReliability: "medium",
      interactionQuality: "medium",
      riskLevel: "medium",
    },
    progressionWindow: partial.progressionWindow ?? "open",
    suggestedAction: partial.suggestedAction ?? "maintain",
    summary: partial.summary ?? "",
    evidence: partial.evidence ?? { C_pred: [], S_sim: [], E_sim: [], F_sim: [], Q_sim: [], D_pre: [], R_pre: [] },
  };
}

function item(
  candidateUserId: string,
  opts: { srs?: number; rrm: RrmSimResult; status?: string },
): RrmSimDiagnosticJobResultItem {
  return {
    candidateUserId,
    status: opts.status ?? "succeeded",
    attemptCount: 1,
    transcriptLite: {},
    evaluator: { simulationRankScore: opts.srs ?? 0.5, continue_recommendation: "hold", risk_tags: [], mitigation_hints: [] },
    failureDetail: null,
    errorCode: null,
    rrmSimResult: opts.rrm,
  };
}

describe("buildRrmRankingProposal (M4.0 read-only)", () => {
  it("recommendation do_not_use_for_ranking when too many fallbacks", () => {
    const fb = mockRrm({
      fallbackUsed: true,
      rrmUnavailableReason: "simulation_payload_not_full_rrm_ready",
      scores: { C_pred: 0, F_sim: 0, D_pre: 0, R_pre: 0, RFI_sim: 0, simulatedRhythmScore: 0 },
    });
    const ok = mockRrm({ scores: { C_pred: 0, F_sim: 0, D_pre: 0, R_pre: 0, RFI_sim: 0, simulatedRhythmScore: 50 } });
    const d = buildRrmSimMultiCandidateDiagnostic({
      jobId: "j1",
      viewerUserId: "v1",
      shortlistBinding: { shortlistCandidateUserIds: ["a", "b", "c", "d"] },
      results: [
        item("a", { rrm: fb }),
        item("b", { rrm: fb }),
        item("c", { rrm: ok }),
        item("d", { rrm: ok }),
      ],
    });
    const p = buildRrmRankingProposal(d);
    expect(p.recommendation).toBe("do_not_use_for_ranking");
  });

  it("recommendation insufficient_separation when scoreDistributionFlag is too_narrow", () => {
    const d = buildRrmSimMultiCandidateDiagnostic({
      jobId: "j1",
      viewerUserId: "v1",
      shortlistBinding: { shortlistCandidateUserIds: ["a", "b", "c"] },
      results: [
        item("a", { rrm: mockRrm({ scores: { C_pred: 0, F_sim: 0, D_pre: 0, R_pre: 0, RFI_sim: 0, simulatedRhythmScore: 70 } }) }),
        item("b", { rrm: mockRrm({ scores: { C_pred: 0, F_sim: 0, D_pre: 0, R_pre: 0, RFI_sim: 0, simulatedRhythmScore: 72 } }) }),
        item("c", { rrm: mockRrm({ scores: { C_pred: 0, F_sim: 0, D_pre: 0, R_pre: 0, RFI_sim: 0, simulatedRhythmScore: 74 } }) }),
      ],
    });
    expect(d.diagnostics.scoreDistributionFlag).toBe("too_narrow");
    const p = buildRrmRankingProposal(d);
    expect(p.recommendation).toBe("insufficient_separation");
  });

  it("recommendation review_manually when top changes and spread is sufficient", () => {
    const d = buildRrmSimMultiCandidateDiagnostic({
      jobId: "j1",
      viewerUserId: "v1",
      shortlistDecisionV0: { rankedCandidateUserIds: ["first", "second"] },
      results: [
        item("first", { rrm: mockRrm({ scores: { C_pred: 0, F_sim: 0, D_pre: 0, R_pre: 0, RFI_sim: 0, simulatedRhythmScore: 30 } }) }),
        item("second", { rrm: mockRrm({ scores: { C_pred: 0, F_sim: 0, D_pre: 0, R_pre: 0, RFI_sim: 0, simulatedRhythmScore: 80 } }) }),
      ],
    });
    expect(d.diagnostics.topCandidateChangedIfRrmOnly).toBe(true);
    expect(d.diagnostics.scoreRange.spread).toBeGreaterThanOrEqual(8);
    const p = buildRrmRankingProposal(d);
    expect(p.recommendation).toBe("review_manually");
  });

  it("recommendation supports_existing_rank when top unchanged and distribution ok", () => {
    const d = buildRrmSimMultiCandidateDiagnostic({
      jobId: "j1",
      viewerUserId: "v1",
      shortlistDecisionV0: { rankedCandidateUserIds: ["a", "b"] },
      results: [
        item("a", { rrm: mockRrm({ scores: { C_pred: 0, F_sim: 0, D_pre: 0, R_pre: 0, RFI_sim: 0, simulatedRhythmScore: 90 } }) }),
        item("b", { rrm: mockRrm({ scores: { C_pred: 0, F_sim: 0, D_pre: 0, R_pre: 0, RFI_sim: 0, simulatedRhythmScore: 40 } }) }),
      ],
    });
    expect(d.diagnostics.topCandidateChangedIfRrmOnly).toBe(false);
    const p = buildRrmRankingProposal(d);
    expect(p.recommendation).toBe("supports_existing_rank");
  });

  it("marks appliedToFinalScore and appliedToWorkerRanking false", () => {
    const d = buildRrmSimMultiCandidateDiagnostic({
      jobId: "j1",
      viewerUserId: "v1",
      shortlistBinding: { shortlistCandidateUserIds: ["a"] },
      results: [item("a", { rrm: mockRrm({ scores: { C_pred: 0, F_sim: 0, D_pre: 0, R_pre: 0, RFI_sim: 0, simulatedRhythmScore: 50 } }) })],
    });
    const p = buildRrmRankingProposal(d);
    expect(p.appliedToFinalScore).toBe(false);
    expect(p.appliedToWorkerRanking).toBe(false);
  });

  it("uses M4.0 schemaVersion and sourceVersion", () => {
    const d = buildRrmSimMultiCandidateDiagnostic({
      jobId: "j1",
      viewerUserId: "v1",
      shortlistBinding: { shortlistCandidateUserIds: ["a"] },
      results: [item("a", { rrm: mockRrm({ scores: { C_pred: 0, F_sim: 0, D_pre: 0, R_pre: 0, RFI_sim: 0, simulatedRhythmScore: 50 } }) })],
    });
    const p = buildRrmRankingProposal(d);
    expect(p.schemaVersion).toBe(1);
    expect(p.sourceVersion).toBe(RRM_RANKING_PROPOSAL_SOURCE_VERSION);
    expect(p.mode).toBe("readonly");
  });

  it("proposal items include rrmRank aligned with rrmRhythmRank", () => {
    const d = buildRrmSimMultiCandidateDiagnostic({
      jobId: "j1",
      viewerUserId: "v1",
      shortlistBinding: { shortlistCandidateUserIds: ["x", "y", "z"] },
      results: [
        item("x", { rrm: mockRrm({ scores: { C_pred: 0, F_sim: 0, D_pre: 0, R_pre: 0, RFI_sim: 0, simulatedRhythmScore: 60 } }) }),
        item("y", { rrm: mockRrm({ scores: { C_pred: 0, F_sim: 0, D_pre: 0, R_pre: 0, RFI_sim: 0, simulatedRhythmScore: 90 } }) }),
        item("z", { rrm: mockRrm({ scores: { C_pred: 0, F_sim: 0, D_pre: 0, R_pre: 0, RFI_sim: 0, simulatedRhythmScore: 75 } }) }),
      ],
    });
    const p = buildRrmRankingProposal(d);
    const byId = new Map(p.items.map((i) => [i.candidateUserId, i]));
    expect(byId.get("y")?.rrmRank).toBe(1);
    expect(byId.get("z")?.rrmRank).toBe(2);
    expect(byId.get("x")?.rrmRank).toBe(3);
  });

  it("serialized proposal does not reference MatchResult or finalScore", () => {
    const d = buildRrmSimMultiCandidateDiagnostic({
      jobId: "j1",
      viewerUserId: "v1",
      shortlistBinding: { shortlistCandidateUserIds: ["a", "b"] },
      results: [
        item("a", { rrm: mockRrm({ scores: { C_pred: 0, F_sim: 0, D_pre: 0, R_pre: 0, RFI_sim: 0, simulatedRhythmScore: 90 } }) }),
        item("b", { rrm: mockRrm({ scores: { C_pred: 0, F_sim: 0, D_pre: 0, R_pre: 0, RFI_sim: 0, simulatedRhythmScore: 40 } }) }),
      ],
    });
    const o = buildRrmRankingProposal(d) as Record<string, unknown>;
    expect(o).not.toHaveProperty("finalScore");
    expect(o).not.toHaveProperty("matchResult");
    expect(JSON.stringify(o)).not.toContain("MatchResult");
  });
});
