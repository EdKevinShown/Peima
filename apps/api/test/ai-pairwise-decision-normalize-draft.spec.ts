import { normalizeAiPairwiseDecisionDraftFromShortlist } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision-normalize-draft";
import {
  parseAndValidateAiPairwiseDecision,
  parseAndValidateRelationshipShortlistTop2,
} from "../src/modules/ai-pairwise-decision/ai-pairwise-decision.validate";
import type { RelationshipShortlistTop2 } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision.types";

function shortlist(): RelationshipShortlistTop2 {
  const raw = {
    schemaVersion: 1,
    sourceVersion: "relationship-shortlist-top2-v1",
    viewerUserId: "viewer-1",
    poolId: "pool-1",
    shortlistFingerprint: "fp-f2",
    candidates: [
      {
        candidateUserId: "cand-a",
        staticRank: 1,
        staticCompatibilityScore: 88,
        axisScoresSummary: { trust: 0.7 },
        majorStrengths: ["s1"],
        majorRisks: ["r1"],
        dealbreakerPassed: true,
        visualPoolRank: 1,
        reasonSummary: "r1",
      },
      {
        candidateUserId: "cand-b",
        staticRank: 2,
        staticCompatibilityScore: 70,
        axisScoresSummary: { trust: 0.5 },
        majorStrengths: ["s2"],
        majorRisks: [],
        dealbreakerPassed: true,
        reasonSummary: "r2",
      },
    ],
    generatedAt: "2026-05-01T12:00:00.000Z",
  };
  const v = parseAndValidateRelationshipShortlistTop2(raw);
  if (!v.ok) throw new Error("shortlist fixture invalid");
  return v.value;
}

function axisNums(over: Partial<Record<string, number | string>> = {}) {
  const base = {
    conversationFit: 0.7,
    emotionalSafety: 0.8,
    conflictRepair: 0.65,
    progressionFit: 0.72,
    longTermFit: 0.6,
    riskControl: 0.75,
  };
  return { ...base, ...over };
}

function candidateBlock(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...axisNums(),
    strongRisk: false,
    suggestedAction: "maintain",
    progressionWindow: "open",
    reasonSummary: "summary",
    ...over,
  };
}

function basePairwiseDraft(over: Record<string, unknown> = {}): Record<string, unknown> {
  const d = axisNums();
  return {
    schemaVersion: 1,
    sourceVersion: "ignored-by-normalizer",
    viewerUserId: "viewer-1",
    poolId: "pool-1",
    candidateAUserId: "cand-a",
    candidateBUserId: "cand-b",
    winnerCandidateId: "cand-a",
    loserCandidateId: "cand-b",
    decisionConfidence: 0.82,
    decisionScoreA: 78,
    decisionScoreB: 65,
    dimensions: { ...d },
    candidateA: candidateBlock({ reasonSummary: "a" }),
    candidateB: candidateBlock({ reasonSummary: "b" }),
    decisionReason: "decision text",
    fallbackUsed: false,
    appliedToFinalScore: false,
    appliedToWorkerRanking: false,
    generatedAt: "2026-05-01T12:01:00.000Z",
    ...over,
  };
}

function assertNormalizeThenValidates(draft: Record<string, unknown>, s = shortlist()) {
  const n = normalizeAiPairwiseDecisionDraftFromShortlist(draft, s);
  expect(n.ok).toBe(true);
  if (!n.ok) return;
  const v = parseAndValidateAiPairwiseDecision(n.draft);
  expect(v.ok).toBe(true);
}

describe("M4.2-F2 normalizeAiPairwiseDecisionDraftFromShortlist", () => {
  const s = shortlist();

  it('coerces fallbackUsed string "false" to boolean false', () => {
    const draft = basePairwiseDraft({ fallbackUsed: "false" });
    const n = normalizeAiPairwiseDecisionDraftFromShortlist(draft, s);
    expect(n.ok).toBe(true);
    if (n.ok) expect(n.draft.fallbackUsed).toBe(false);
    assertNormalizeThenValidates(draft);
  });

  it('coerces fallbackUsed string "true" to boolean true', () => {
    const draft = basePairwiseDraft({ fallbackUsed: "true" });
    const n = normalizeAiPairwiseDecisionDraftFromShortlist(draft, s);
    expect(n.ok).toBe(true);
    if (n.ok) expect(n.draft.fallbackUsed).toBe(true);
    assertNormalizeThenValidates(draft);
  });

  it("coerces fallbackUsed numeric 0/1 to booleans", () => {
    const n0 = normalizeAiPairwiseDecisionDraftFromShortlist(basePairwiseDraft({ fallbackUsed: 0 }), s);
    expect(n0.ok).toBe(true);
    if (n0.ok) expect(n0.draft.fallbackUsed).toBe(false);
    const n1 = normalizeAiPairwiseDecisionDraftFromShortlist(basePairwiseDraft({ fallbackUsed: 1 }), s);
    expect(n1.ok).toBe(true);
    if (n1.ok) expect(n1.draft.fallbackUsed).toBe(true);
  });

  it('coerces candidateA.strongRisk string "false" to boolean', () => {
    const draft = basePairwiseDraft({
      candidateA: candidateBlock({ strongRisk: "false" }),
    });
    const n = normalizeAiPairwiseDecisionDraftFromShortlist(draft, s);
    expect(n.ok).toBe(true);
    if (n.ok) {
      const ca = n.draft.candidateA as Record<string, unknown>;
      expect(ca.strongRisk).toBe(false);
    }
    assertNormalizeThenValidates(draft);
  });

  it("coerces candidateA.strongRisk 0 / 1 to booleans", () => {
    const d0 = basePairwiseDraft({ candidateA: candidateBlock({ strongRisk: 0 }) });
    const n0 = normalizeAiPairwiseDecisionDraftFromShortlist(d0, s);
    expect(n0.ok).toBe(true);
    if (n0.ok) expect((n0.draft.candidateA as Record<string, unknown>).strongRisk).toBe(false);

    const d1 = basePairwiseDraft({ candidateA: candidateBlock({ strongRisk: 1 }) });
    const n1 = normalizeAiPairwiseDecisionDraftFromShortlist(d1, s);
    expect(n1.ok).toBe(true);
    if (n1.ok) expect((n1.draft.candidateA as Record<string, unknown>).strongRisk).toBe(true);
    assertNormalizeThenValidates(d1);
  });

  it("hoists suggestedAction from nested candidate objects and canonicalizes casing", () => {
    const draft = basePairwiseDraft({
      candidateA: {
        ...axisNums(),
        strongRisk: false,
        progressionWindow: "open",
        reasonSummary: "a",
        decision: { suggestedAction: "Slow_Down" },
      },
      candidateB: {
        ...axisNums(),
        strongRisk: false,
        progressionWindow: "open",
        reasonSummary: "b",
        profile: { suggestedAction: "stop-or-step-back" },
      },
    });
    assertNormalizeThenValidates(draft);
    const n = normalizeAiPairwiseDecisionDraftFromShortlist(draft, s);
    if (n.ok) {
      expect((n.draft.candidateA as Record<string, unknown>).suggestedAction).toBe("slow_down");
      expect((n.draft.candidateB as Record<string, unknown>).suggestedAction).toBe("stop_or_step_back");
    }
  });

  it("hoists suggestedAction from candidate.dimensions and parses string decisionConfidence", () => {
    const draft = basePairwiseDraft({
      decisionConfidence: "0.61",
      candidateA: {
        ...axisNums({ conversationFit: "0.55" }),
        strongRisk: false,
        progressionWindow: "open",
        reasonSummary: "a",
        dimensions: { suggestedAction: "maintain" },
      },
    });
    assertNormalizeThenValidates(draft);
    const n = normalizeAiPairwiseDecisionDraftFromShortlist(draft, s);
    if (n.ok) {
      expect(n.draft.decisionConfidence).toBe(0.61);
      expect((n.draft.candidateA as Record<string, unknown>).suggestedAction).toBe("maintain");
      expect((n.draft.candidateA as Record<string, unknown>).conversationFit).toBe(0.55);
    }
  });

  it("fills decisionConfidence from nested object when top-level missing", () => {
    const draft = basePairwiseDraft({});
    delete (draft as Record<string, unknown>).decisionConfidence;
    (draft as Record<string, unknown>).pairwiseDecision = { decisionConfidence: { confidence: 0.74 } };
    assertNormalizeThenValidates(draft);
    const n = normalizeAiPairwiseDecisionDraftFromShortlist(draft, s);
    if (n.ok) expect(n.draft.decisionConfidence).toBe(0.74);
  });

  it("overwrites viewerUserId, poolId, candidateAUserId, candidateBUserId from shortlist", () => {
    const draft = basePairwiseDraft({
      viewerUserId: "model-viewer-wrong",
      poolId: "model-pool-wrong",
      candidateAUserId: "cand-b",
      candidateBUserId: "cand-a",
    });
    const n = normalizeAiPairwiseDecisionDraftFromShortlist(draft, s);
    expect(n.ok).toBe(true);
    if (!n.ok) return;
    expect(n.draft.viewerUserId).toBe("viewer-1");
    expect(n.draft.poolId).toBe("pool-1");
    expect(n.draft.candidateAUserId).toBe("cand-a");
    expect(n.draft.candidateBUserId).toBe("cand-b");
    const v = parseAndValidateAiPairwiseDecision(n.draft);
    expect(v.ok).toBe(true);
  });

  it("coerces dimensions.conversationFit string and hoists missing candidate axis from root dimensions", () => {
    const dims = axisNums({ conversationFit: "0.68" });
    const draft = basePairwiseDraft({
      dimensions: { ...dims },
      candidateA: candidateBlock({ conversationFit: undefined }),
      candidateB: candidateBlock(),
    });
    delete ((draft.candidateA as Record<string, unknown>).conversationFit);
    assertNormalizeThenValidates(draft);
    const n = normalizeAiPairwiseDecisionDraftFromShortlist(draft, s);
    if (n.ok) {
      expect((n.draft.dimensions as Record<string, unknown>).conversationFit).toBe(0.68);
      expect((n.draft.candidateA as Record<string, unknown>).conversationFit).toBe(0.68);
    }
  });
});

describe("M4.2-F2 contract (F1-style sanitised shapes) normalize then parseAndValidateAiPairwiseDecision", () => {
  it("accepts a single draft combining typical schema_validation failure modes", () => {
    const s = shortlist();
    const dims = {
      conversationFit: "0.71",
      emotionalSafety: 0.8,
      conflictRepair: 0.65,
      progressionFit: 0.72,
      longTermFit: 0.6,
      riskControl: 0.75,
    };
    const draft: Record<string, unknown> = {
      schemaVersion: "1",
      viewerUserId: "wrong-viewer-id",
      poolId: "wrong-pool-id",
      candidateAUserId: "cand-b",
      candidateBUserId: "cand-a",
      winnerCandidateId: "cand-a",
      loserCandidateId: "cand-b",
      decisionScoreA: 78,
      decisionScoreB: 65,
      dimensions: { ...dims },
      decisionReason: "Synthetic pairwise summary for regression harness.",
      fallbackUsed: "false",
      appliedToFinalScore: false,
      appliedToWorkerRanking: false,
      generatedAt: "2026-05-02T10:00:00.000Z",
      pairwiseDecision: { decisionConfidence: "0.77" },
      candidateA: {
        emotionalSafety: 0.8,
        conflictRepair: 0.65,
        progressionFit: 0.72,
        longTermFit: 0.6,
        riskControl: 0.75,
        strongRisk: 0,
        progressionWindow: "open",
        reasonSummary: "side a",
        conversationFit: { score: 0.64 },
        dimensions: { suggestedAction: "Maintain" },
      },
      candidateB: {
        ...axisNums(),
        strongRisk: "false",
        progressionWindow: "open",
        reasonSummary: "side b",
        recommendation: { value: "slow_down" },
      },
    };
    assertNormalizeThenValidates(draft, s);
  });
});
