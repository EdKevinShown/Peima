import type { AiPairwiseDecision, RelationshipShortlistTop2 } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision.types";
import {
  buildPairwiseFinalMatchProposal,
  mapPairwiseFinalMatchProposalToViewerDto,
} from "../src/modules/ai-pairwise-decision/ai-pairwise-final-match-proposal";
import { parseAndValidateAiPairwiseDecision, parseAndValidateRelationshipShortlistTop2 } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision.validate";

function shortlist(): RelationshipShortlistTop2 {
  const raw = {
    schemaVersion: 1,
    sourceVersion: "relationship-shortlist-top2-v1",
    viewerUserId: "viewer-1",
    poolId: "pool-1",
    shortlistFingerprint: "fp-abc",
    candidates: [
      {
        candidateUserId: "cand-a",
        staticRank: 1,
        staticCompatibilityScore: 90,
        axisScoresSummary: { x: 0.5 },
        majorStrengths: ["s"],
        majorRisks: [],
        dealbreakerPassed: true,
        reasonSummary: "r1",
      },
      {
        candidateUserId: "cand-b",
        staticRank: 2,
        staticCompatibilityScore: 70,
        axisScoresSummary: { x: 0.4 },
        majorStrengths: [],
        majorRisks: ["g"],
        dealbreakerPassed: true,
        reasonSummary: "r2",
      },
    ],
    generatedAt: "2026-05-01T12:00:00.000Z",
  };
  const v = parseAndValidateRelationshipShortlistTop2(raw);
  if (!v.ok) throw new Error("fixture");
  return v.value;
}

function decisionBase(over: Partial<AiPairwiseDecision> = {}): AiPairwiseDecision {
  const d = {
    schemaVersion: 1,
    sourceVersion: "rrm-lite-pairwise-decision-v1",
    viewerUserId: "viewer-1",
    poolId: "pool-1",
    candidateAUserId: "cand-a",
    candidateBUserId: "cand-b",
    winnerCandidateId: "cand-a",
    loserCandidateId: "cand-b",
    decisionConfidence: 0.8,
    decisionScoreA: 80,
    decisionScoreB: 60,
    dimensions: {
      conversationFit: 0.7,
      emotionalSafety: 0.7,
      conflictRepair: 0.7,
      progressionFit: 0.7,
      longTermFit: 0.7,
      riskControl: 0.7,
    },
    candidateA: {
      conversationFit: 0.7,
      emotionalSafety: 0.7,
      conflictRepair: 0.7,
      progressionFit: 0.7,
      longTermFit: 0.7,
      riskControl: 0.7,
      strongRisk: false,
      suggestedAction: "maintain" as const,
      progressionWindow: "open" as const,
      reasonSummary: "a",
    },
    candidateB: {
      conversationFit: 0.6,
      emotionalSafety: 0.6,
      conflictRepair: 0.6,
      progressionFit: 0.6,
      longTermFit: 0.6,
      riskControl: 0.6,
      strongRisk: false,
      suggestedAction: "maintain" as const,
      progressionWindow: "open" as const,
      reasonSummary: "b",
    },
    decisionReason: "ok",
    fallbackUsed: false,
    appliedToFinalScore: false,
    appliedToWorkerRanking: false,
    generatedAt: "2026-05-01T12:01:00.000Z",
    ...over,
  };
  const v = parseAndValidateAiPairwiseDecision(d);
  if (!v.ok) throw new Error("decision fixture");
  return v.value;
}

describe("buildPairwiseFinalMatchProposal", () => {
  const sl = shortlist();

  it("succeeded + high confidence + score gap → pairwise_winner_eligible", () => {
    const p = buildPairwiseFinalMatchProposal({
      shortlist: sl,
      decision: decisionBase(),
      jobStatus: "succeeded",
    });
    expect(p.recommendation).toBe("pairwise_winner_eligible");
    expect(p.candidateUserId).toBe("cand-a");
    expect(p.staticTop1CandidateUserId).toBe("cand-a");
    expect(p.fallbackCandidateUserId).toBe("cand-a");
    expect(p.reasonCode).toBe("pairwise_gates_passed");
  });

  it("job queued → pairwise_unavailable + static top1", () => {
    const p = buildPairwiseFinalMatchProposal({
      shortlist: sl,
      decision: decisionBase(),
      jobStatus: "queued",
    });
    expect(p.recommendation).toBe("pairwise_unavailable");
    expect(p.candidateUserId).toBe("cand-a");
    expect(p.pairwiseJobStatus).toBe("queued");
  });

  it("job running → pairwise_unavailable + static top1", () => {
    const p = buildPairwiseFinalMatchProposal({
      shortlist: sl,
      decision: decisionBase(),
      jobStatus: "running",
    });
    expect(p.recommendation).toBe("pairwise_unavailable");
    expect(p.candidateUserId).toBe("cand-a");
  });

  it("job failed → pairwise_unavailable + static top1", () => {
    const p = buildPairwiseFinalMatchProposal({
      shortlist: sl,
      decision: decisionBase(),
      jobStatus: "failed",
    });
    expect(p.recommendation).toBe("pairwise_unavailable");
    expect(p.candidateUserId).toBe("cand-a");
  });

  it("low confidence → static_top1_fallback", () => {
    const p = buildPairwiseFinalMatchProposal({
      shortlist: sl,
      decision: decisionBase({ decisionConfidence: 0.55 }),
      jobStatus: "succeeded",
    });
    expect(p.recommendation).toBe("static_top1_fallback");
    expect(p.candidateUserId).toBe("cand-a");
    expect(p.reasonCode).toBe("low_decision_confidence");
  });

  it("small score gap → static_top1_fallback", () => {
    const p = buildPairwiseFinalMatchProposal({
      shortlist: sl,
      decision: decisionBase({ decisionScoreA: 70, decisionScoreB: 66 }),
      jobStatus: "succeeded",
    });
    expect(p.recommendation).toBe("static_top1_fallback");
    expect(p.reasonCode).toBe("narrow_decision_score_gap");
  });

  it("winner strongRisk + default policy → static_top1_fallback", () => {
    const d = decisionBase({
      candidateA: {
        ...decisionBase().candidateA,
        strongRisk: true,
      },
    });
    const p = buildPairwiseFinalMatchProposal({
      shortlist: sl,
      decision: d,
      jobStatus: "succeeded",
      options: { strongRiskPolicy: "fallback_static_top1" },
    });
    expect(p.recommendation).toBe("static_top1_fallback");
    expect(p.candidateUserId).toBe("cand-a");
    expect(p.reasonCode).toBe("winner_strong_risk_fallback_static");
  });

  it("winner strongRisk + no_confident_match policy → no_confident_match", () => {
    const d = decisionBase({
      candidateA: {
        ...decisionBase().candidateA,
        strongRisk: true,
      },
    });
    const p = buildPairwiseFinalMatchProposal({
      shortlist: sl,
      decision: d,
      jobStatus: "succeeded",
      options: { strongRiskPolicy: "no_confident_match" },
    });
    expect(p.recommendation).toBe("no_confident_match");
    expect(p.candidateUserId).toBeNull();
    expect(p.reasonCode).toBe("winner_strong_risk_policy_no_match");
  });

  it("both strongRisk + no_confident_match policy → no_confident_match", () => {
    const base = decisionBase();
    const d = decisionBase({
      candidateA: { ...base.candidateA, strongRisk: true },
      candidateB: { ...base.candidateB, strongRisk: true },
    });
    const p = buildPairwiseFinalMatchProposal({
      shortlist: sl,
      decision: d,
      jobStatus: "succeeded",
      options: { strongRiskPolicy: "no_confident_match" },
    });
    expect(p.recommendation).toBe("no_confident_match");
    expect(p.candidateUserId).toBeNull();
    expect(p.reasonCode).toBe("both_candidates_strong_risk");
  });

  it("both strongRisk + fallback policy → static_top1_fallback", () => {
    const base = decisionBase();
    const d = decisionBase({
      candidateA: { ...base.candidateA, strongRisk: true },
      candidateB: { ...base.candidateB, strongRisk: true },
    });
    const p = buildPairwiseFinalMatchProposal({
      shortlist: sl,
      decision: d,
      jobStatus: "succeeded",
      options: { strongRiskPolicy: "fallback_static_top1" },
    });
    expect(p.recommendation).toBe("static_top1_fallback");
    expect(p.candidateUserId).toBe("cand-a");
    expect(p.reasonCode).toBe("both_candidates_strong_risk_fallback_static");
  });

  it("invalid winner binding → pairwise_unavailable", () => {
    const bad = {
      ...decisionBase(),
      winnerCandidateId: "cand-x",
    } as AiPairwiseDecision;
    const p = buildPairwiseFinalMatchProposal({
      shortlist: sl,
      decision: bad,
      jobStatus: "succeeded",
    });
    expect(p.recommendation).toBe("pairwise_unavailable");
    expect(p.reasonCode).toBe("invalid_decision_binding");
    expect(p.candidateUserId).toBe("cand-a");
  });

  it("appliedToFinalScore / appliedToWorkerRanking always false", () => {
    const p = buildPairwiseFinalMatchProposal({
      shortlist: sl,
      decision: decisionBase(),
      jobStatus: "succeeded",
    });
    expect(p.appliedToFinalScore).toBe(false);
    expect(p.appliedToWorkerRanking).toBe(false);
    expect(p.mode).toBe("proposal_only");
    expect(p.schemaVersion).toBe(1);
    expect(p.sourceVersion).toBe("pairwise-final-match-proposal-v1");
  });

  it("viewer DTO omits raw scores / dimensions / strongRisk / confidence / gap", () => {
    const p = buildPairwiseFinalMatchProposal({
      shortlist: sl,
      decision: decisionBase(),
      jobStatus: "succeeded",
    });
    const v = mapPairwiseFinalMatchProposalToViewerDto(p);
    expect(Object.keys(v).sort()).toEqual(
      ["appliedToFinalScore", "appliedToWorkerRanking", "candidateUserId", "mode", "reasonSummary", "recommendation"].sort(),
    );
    expect("decisionScoreGap" in v).toBe(false);
    expect("decisionConfidence" in v).toBe(false);
    expect("dimensions" in v).toBe(false);
    expect("decisionScoreA" in v).toBe(false);
    expect("strongRisk" in v).toBe(false);
  });
});
