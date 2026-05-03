import type { MatchResult } from "@peima/database";
import type { RrmRankingProposal } from "../src/modules/ai-simulation-v1/ai-simulation-v1-rrm-ranking-proposal";
import { RRM_RANKING_PROPOSAL_SOURCE_VERSION } from "../src/modules/ai-simulation-v1/ai-simulation-v1-rrm-ranking-proposal";
import type { RrmSimResult } from "../src/modules/ai-simulation-v1/rrm-sim.types";
import {
  buildMultiSourceFinalDecisionReadonlyM51M0,
  RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY,
  tryParseRrmSimReadonlySummaryFromMatchInsights,
} from "../src/modules/matching/matching-multi-source-final-decision-m51m0";
import {
  buildRrmSimReadonlySummaryFromRrmProposal,
  buildRrmSimReadonlySummaryFromRrmSimResult,
  mergeRrmSimReadonlySummaryIntoMatchInsights,
  RRM_SIM_READONLY_SUMMARY_SOURCE_VERSION,
} from "../src/modules/matching/matching-rrm-sim-readonly-summary";

const GENERATED_AT = "2026-05-01T00:00:00.000Z";

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

function minimalProposalForCandidate(candidateUserId: string): RrmRankingProposal {
  return {
    schemaVersion: 1,
    sourceVersion: RRM_RANKING_PROPOSAL_SOURCE_VERSION,
    mode: "readonly",
    appliedToFinalScore: false,
    appliedToWorkerRanking: false,
    existingTopCandidateUserId: candidateUserId,
    rrmTopCandidateUserId: candidateUserId,
    topCandidateChanged: false,
    scoreDistributionFlag: "ok",
    confidenceLevel: "medium",
    recommendation: "diagnostic_only",
    items: [
      {
        candidateUserId,
        existingRank: 1,
        rrmRank: 1,
        simulatedRhythmScore: 62,
        suggestedAction: "maintain",
        progressionWindow: "weak_open",
        fallbackUsed: false,
        reasonSummary: "test",
      },
    ],
    warnings: ["pace_mismatch"],
  };
}

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

describe("M5.2-M2A matching-rrm-sim-readonly-summary", () => {
  it("exports RRM_SIM_READONLY_SUMMARY_SOURCE_VERSION aligned with RrmSimResult path", () => {
    expect(RRM_SIM_READONLY_SUMMARY_SOURCE_VERSION).toBe("rrm-sim-v1");
  });

  describe("parser compatibility (tryParseRrmSimReadonlySummaryFromMatchInsights)", () => {
    it("accepts buildRrmSimReadonlySummaryFromRrmSimResult output", () => {
      const rrm = mockRrm({
        scores: {
          C_pred: 0.5,
          F_sim: 0.5,
          D_pre: 0.5,
          R_pre: 0.5,
          RFI_sim: 0.5,
          simulatedRhythmScore: 72,
        },
      });
      const payload = buildRrmSimReadonlySummaryFromRrmSimResult(rrm, {
        candidateUserId: "cand-rrm",
        generatedAt: GENERATED_AT,
      });
      const parsed = tryParseRrmSimReadonlySummaryFromMatchInsights({
        [RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY]: payload,
      });
      expect(parsed).not.toBeNull();
      expect(parsed?.sourceVersion).toBe("rrm-sim-v1");
      expect(parsed?.candidateUserId).toBe("cand-rrm");
      expect(parsed?.simulatedRhythmScore).toBe(72);
      expect(parsed?.suggestedAction).toBe("maintain");
      expect(parsed?.progressionWindow).toBe("open");
      expect(parsed?.fallbackUsed).toBe(false);
    });

    it("accepts buildRrmSimReadonlySummaryFromRrmProposal output", () => {
      const proposal = minimalProposalForCandidate("cand-a");
      const payload = buildRrmSimReadonlySummaryFromRrmProposal(proposal, {
        candidateUserId: "cand-a",
        generatedAt: GENERATED_AT,
      });
      expect(payload).not.toBeNull();
      const parsed = tryParseRrmSimReadonlySummaryFromMatchInsights({
        [RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY]: payload!,
      });
      expect(parsed).not.toBeNull();
      expect(parsed?.sourceVersion).toBe("m4.0-readonly-rrm-ranking-proposal-v1");
      expect(parsed?.recommendation).toBe("diagnostic_only");
      expect(parsed?.progressionWindow).toBe("weak_open");
      expect(parsed?.simulatedRhythmScore).toBe(62);
    });

    it("proposal builder returns null when candidate not in items", () => {
      const proposal = minimalProposalForCandidate("cand-a");
      const payload = buildRrmSimReadonlySummaryFromRrmProposal(proposal, {
        candidateUserId: "missing",
        generatedAt: GENERATED_AT,
      });
      expect(payload).toBeNull();
    });

    it("proposal builder falls back to maintain when row has no parse signals", () => {
      const proposal: RrmRankingProposal = {
        ...minimalProposalForCandidate("cand-a"),
        items: [
          {
            candidateUserId: "cand-a",
            existingRank: null,
            rrmRank: null,
            simulatedRhythmScore: null,
            suggestedAction: null,
            progressionWindow: null,
            fallbackUsed: null,
            reasonSummary: "empty row",
          },
        ],
      };
      const payload = buildRrmSimReadonlySummaryFromRrmProposal(proposal, {
        candidateUserId: "cand-a",
        generatedAt: GENERATED_AT,
      });
      expect(payload).not.toBeNull();
      const parsed = tryParseRrmSimReadonlySummaryFromMatchInsights({
        [RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY]: payload!,
      });
      expect(parsed?.suggestedAction).toBe("maintain");
    });
  });

  describe("sidecar compatibility (buildMultiSourceFinalDecisionReadonlyM51M0)", () => {
    it("hydrates rrmSim when mergeRrmSimReadonlySummaryIntoMatchInsights is used on matchInsights", () => {
      const rrm = mockRrm({
        scores: {
          C_pred: 0.5,
          F_sim: 0.5,
          D_pre: 0.5,
          R_pre: 0.5,
          RFI_sim: 0.5,
          simulatedRhythmScore: 62,
        },
        progressionWindow: "weak_open",
      });
      const summary = buildRrmSimReadonlySummaryFromRrmSimResult(rrm, {
        candidateUserId: "cand-static",
        generatedAt: GENERATED_AT,
        scenarioKey: "early_conversation",
      });
      const merged = mergeRrmSimReadonlySummaryIntoMatchInsights(
        {
          explanation: {
            whyMatch: "w",
            strengths: [],
            cautions: [],
            rhythmPrediction: "",
          },
          riskFlags: [],
          openingTopics: [],
          chatSimulationSummary: "",
        },
        summary,
      );
      const row = mr({ matchInsights: merged as MatchResult["matchInsights"] });
      const display = {
        displayCandidateUserId: row.candidateUserId,
        displaySourceType: "match_result_original" as const,
        finalMatchDecisionMeta: null,
      };
      const sidecar = buildMultiSourceFinalDecisionReadonlyM51M0(row, display);
      expect(sidecar.sources.rrmSim.available).toBe(true);
      if (sidecar.sources.rrmSim.available) {
        expect(sidecar.sources.rrmSim.sourceVersion).toBe("rrm-sim-v1");
        expect(sidecar.sources.rrmSim.simulatedRhythmScore).toBe(62);
        expect(sidecar.sources.rrmSim.scenarioKey).toBe("early_conversation");
      }
      expect(sidecar.admin.missingSources).not.toContain("rrm_sim");
      expect(sidecar.m5ProposedDisplayCandidateUserId).toBeNull();
      expect(sidecar.m5AppliedToDisplay).toBe(false);
    });
  });
});
