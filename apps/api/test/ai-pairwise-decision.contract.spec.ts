import {
  buildRrmLitePairwiseDecisionPromptDraft,
  parseAndValidateAiPairwiseDecision,
  parseAndValidateRelationshipShortlistTop2,
} from "../src/modules/ai-pairwise-decision";

function validTop2() {
  return {
    schemaVersion: 1,
    sourceVersion: "relationship-shortlist-top2-v1",
    viewerUserId: "viewer-1",
    poolId: "pool-1",
    shortlistFingerprint: "abc",
    candidates: [
      {
        candidateUserId: "cand-a",
        staticRank: 1,
        staticCompatibilityScore: 88,
        axisScoresSummary: { trust: 0.7, pace: 0.6 },
        majorStrengths: ["aligned goals"],
        majorRisks: ["minor pace gap"],
        dealbreakerPassed: true,
        visualPoolRank: 2,
        reasonSummary: "rank1 by 20-dim ruleset v1",
      },
      {
        candidateUserId: "cand-b",
        staticRank: 2,
        staticCompatibilityScore: 72,
        axisScoresSummary: { trust: 0.5, pace: 0.8 },
        majorStrengths: ["stable tone"],
        majorRisks: [],
        dealbreakerPassed: true,
        reasonSummary: "rank2 by 20-dim ruleset v1",
      },
    ],
    generatedAt: "2026-05-01T12:00:00.000Z",
  };
}

function validPairwiseDecision() {
  const dims = {
    conversationFit: 0.7,
    emotionalSafety: 0.8,
    conflictRepair: 0.65,
    progressionFit: 0.72,
    longTermFit: 0.6,
    riskControl: 0.75,
  };
  const block = {
    ...dims,
    strongRisk: false,
    suggestedAction: "maintain" as const,
    progressionWindow: "open" as const,
    reasonSummary: "compact rubric summary",
  };
  return {
    schemaVersion: 1,
    sourceVersion: "rrm-lite-pairwise-decision-v1",
    viewerUserId: "viewer-1",
    poolId: "pool-1",
    candidateAUserId: "cand-a",
    candidateBUserId: "cand-b",
    winnerCandidateId: "cand-a",
    loserCandidateId: "cand-b",
    decisionConfidence: 0.82,
    decisionScoreA: 78,
    decisionScoreB: 65,
    dimensions: { ...dims },
    candidateA: { ...block },
    candidateB: { ...block, reasonSummary: "other side summary" },
    decisionReason: "A edges B on emotional safety with acceptable pace.",
    fallbackUsed: false,
    appliedToFinalScore: false,
    appliedToWorkerRanking: false,
    generatedAt: "2026-05-01T12:00:05.000Z",
  };
}

describe("M3.8-M0 ai-pairwise-decision contracts", () => {
  it("accepts valid RelationshipShortlistTop2", () => {
    const r = parseAndValidateRelationshipShortlistTop2(validTop2());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.candidates).toHaveLength(2);
      expect(r.value.candidates[0].staticRank).toBe(1);
      expect(r.value.candidates[1].staticRank).toBe(2);
    }
  });

  it("accepts valid Top2 from JSON string", () => {
    const r = parseAndValidateRelationshipShortlistTop2(JSON.stringify(validTop2()));
    expect(r.ok).toBe(true);
  });

  it("rejects Top2 when fewer than 2 candidates", () => {
    const o = { ...validTop2(), candidates: [validTop2().candidates[0]] };
    const r = parseAndValidateRelationshipShortlistTop2(o);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failureDetail.path).toBe("candidates");
      expect(r.failureDetail.reason).toBe("expected_length_2");
    }
  });

  it("rejects Top2 when more than 2 candidates", () => {
    const t = validTop2();
    const o = {
      ...t,
      candidates: [...t.candidates, { ...t.candidates[1], candidateUserId: "cand-c", staticRank: 2 }],
    };
    const r = parseAndValidateRelationshipShortlistTop2(o);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failureDetail.path).toBe("candidates");
      expect(r.failureDetail.reason).toBe("expected_length_2");
    }
  });

  it("rejects Top2 duplicate candidateUserId", () => {
    const t = validTop2();
    const o = {
      ...t,
      candidates: [
        { ...t.candidates[0], candidateUserId: "same", staticRank: 1 },
        { ...t.candidates[1], candidateUserId: "same", staticRank: 2 },
      ],
    };
    const r = parseAndValidateRelationshipShortlistTop2(o);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failureDetail.reason).toBe("duplicate_candidateUserId");
    }
  });

  it("accepts valid AiPairwiseDecision", () => {
    const r = parseAndValidateAiPairwiseDecision(validPairwiseDecision());
    expect(r.ok).toBe(true);
  });

  it("rejects AiPairwiseDecision when winner is neither A nor B", () => {
    const o = { ...validPairwiseDecision(), winnerCandidateId: "stranger", loserCandidateId: "cand-b" };
    const r = parseAndValidateAiPairwiseDecision(o);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failureDetail.path).toBe("winnerCandidateId");
      expect(r.failureDetail.reason).toBe("must_equal_A_or_B");
    }
  });

  it("rejects AiPairwiseDecision when appliedToFinalScore is not false", () => {
    const o = { ...validPairwiseDecision(), appliedToFinalScore: true };
    const r = parseAndValidateAiPairwiseDecision(o);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failureDetail.path).toBe("appliedToFinalScore");
      expect(r.failureDetail.reason).toBe("must_be_false");
    }
  });

  it("rejects AiPairwiseDecision when appliedToWorkerRanking is not false", () => {
    const o = { ...validPairwiseDecision(), appliedToWorkerRanking: true };
    const r = parseAndValidateAiPairwiseDecision(o);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failureDetail.path).toBe("appliedToWorkerRanking");
    }
  });

  it("rejects AiPairwiseDecision when a score is out of range", () => {
    const o = { ...validPairwiseDecision(), decisionScoreA: 101 };
    const r = parseAndValidateAiPairwiseDecision(o);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failureDetail.path).toBe("decisionScoreA");
      expect(r.failureDetail.reason).toBe("expected_range_0_100");
    }
  });

  it("rejects AiPairwiseDecision when dimension is out of 0–1", () => {
    const o = {
      ...validPairwiseDecision(),
      dimensions: { ...validPairwiseDecision().dimensions, conversationFit: 1.2 },
    };
    const r = parseAndValidateAiPairwiseDecision(o);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failureDetail.path).toBe("dimensions.conversationFit");
    }
  });

  it("prompt draft mentions no full transcript, binary choice, JSON-only output, and RRM-lite modules", () => {
    const p = buildRrmLitePairwiseDecisionPromptDraft();
    expect(p).toMatch(/transcript/i);
    expect(p).toContain("二选一");
    expect(p.toLowerCase()).toMatch(/json object only|no markdown/);
    expect(p).toMatch(/RRM-lite/i);
  });
});
