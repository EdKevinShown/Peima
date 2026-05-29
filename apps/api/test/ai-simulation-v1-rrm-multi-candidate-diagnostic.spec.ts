import type { RrmSimResult } from "../src/modules/ai-simulation-v1/rrm-sim.types";
import {
  buildRrmSimMultiCandidateDiagnostic,
  type RrmSimDiagnosticJobResultItem,
} from "../src/modules/ai-simulation-v1/ai-simulation-v1-rrm-multi-candidate-diagnostic";

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

describe("buildRrmSimMultiCandidateDiagnostic", () => {
  it("returns items for a completed multi-candidate job shape", () => {
    const d = buildRrmSimMultiCandidateDiagnostic({
      jobId: "j1",
      viewerUserId: "v1",
      shortlistBinding: { shortlistCandidateUserIds: ["a", "b"] },
      results: [
        item("a", { srs: 0.7, rrm: mockRrm({ scores: { C_pred: 0, F_sim: 0, D_pre: 0, R_pre: 0, RFI_sim: 0, simulatedRhythmScore: 70 } }) }),
        item("b", { srs: 0.6, rrm: mockRrm({ scores: { C_pred: 0, F_sim: 0, D_pre: 0, R_pre: 0, RFI_sim: 0, simulatedRhythmScore: 55 } }) }),
      ],
    });
    expect(d.items).toHaveLength(2);
    expect(d.items.map((x) => x.candidateUserId)).toEqual(["a", "b"]);
    expect(d.items[0].simulatedRhythmScore).toBe(70);
    expect(d.rankings.existingSimulationRank[0]).toBe("a");
  });

  it("rrmRhythmRank is descending by simulatedRhythmScore", () => {
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
    expect(d.rankings.rrmRhythmRank).toEqual(["y", "z", "x"]);
  });

  it("places fallback after non-fallback even if fallback rhythm is higher", () => {
    const d = buildRrmSimMultiCandidateDiagnostic({
      jobId: "j1",
      viewerUserId: "v1",
      shortlistBinding: { shortlistCandidateUserIds: ["low", "highFb"] },
      results: [
        item("low", { rrm: mockRrm({ scores: { C_pred: 0, F_sim: 0, D_pre: 0, R_pre: 0, RFI_sim: 0, simulatedRhythmScore: 40 } }) }),
        item("highFb", {
          rrm: mockRrm({
            fallbackUsed: true,
            rrmUnavailableReason: "simulation_payload_not_full_rrm_ready",
            scores: { C_pred: 0, F_sim: 0, D_pre: 0, R_pre: 0, RFI_sim: 0, simulatedRhythmScore: 99 },
          }),
        }),
      ],
    });
    expect(d.rankings.rrmRhythmRank[0]).toBe("low");
    expect(d.rankings.rrmRhythmRank[1]).toBe("highFb");
  });

  it("sets too_narrow when rrmAvailableCount >= 3 and spread < 8", () => {
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
    expect(d.diagnostics.rrmAvailableCount).toBe(3);
    expect(d.diagnostics.scoreRange.spread).toBe(4);
    expect(d.diagnostics.scoreDistributionFlag).toBe("too_narrow");
  });

  it("sets too_many_fallbacks when fallbackCount / total >= 0.5", () => {
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
    expect(d.diagnostics.fallbackCount).toBe(2);
    expect(d.diagnostics.scoreDistributionFlag).toBe("too_many_fallbacks");
  });

  it("computes topCandidateChangedIfRrmOnly vs existingSimulationRank head", () => {
    const d = buildRrmSimMultiCandidateDiagnostic({
      jobId: "j1",
      viewerUserId: "v1",
      shortlistDecisionV0: { rankedCandidateUserIds: ["first", "second"] },
      results: [
        item("first", { rrm: mockRrm({ scores: { C_pred: 0, F_sim: 0, D_pre: 0, R_pre: 0, RFI_sim: 0, simulatedRhythmScore: 30 } }) }),
        item("second", { rrm: mockRrm({ scores: { C_pred: 0, F_sim: 0, D_pre: 0, R_pre: 0, RFI_sim: 0, simulatedRhythmScore: 80 } }) }),
      ],
    });
    expect(d.rankings.existingSimulationRank[0]).toBe("first");
    expect(d.rankings.rrmRhythmRank[0]).toBe("second");
    expect(d.diagnostics.topCandidateChangedIfRrmOnly).toBe(true);
  });

  it("topCandidateChangedIfRrmOnly is false when top matches", () => {
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
  });

  it("diagnostic JSON does not surface match finalScore / worker fields (read-only RRM layer)", () => {
    const d = buildRrmSimMultiCandidateDiagnostic({
      jobId: "j1",
      viewerUserId: "v1",
      shortlistBinding: { shortlistCandidateUserIds: ["a"] },
      results: [item("a", { rrm: mockRrm({ scores: { C_pred: 0, F_sim: 0, D_pre: 0, R_pre: 0, RFI_sim: 0, simulatedRhythmScore: 50 } }) })],
    });
    const s = JSON.stringify(d);
    expect(s).not.toContain("finalScore");
    expect(s).not.toContain("MatchResult");
    expect(s).not.toContain("worker");
  });
});
