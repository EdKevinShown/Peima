import type { AiPairwiseDecision, RelationshipShortlistTop2 } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision.types";
import { buildPairwiseFinalSourceShadowRecord } from "../src/modules/ai-pairwise-decision/ai-pairwise-final-source-shadow";
import { mapPairwiseJobPublicToViewerDto } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision-viewer.mapper";
import { parseAndValidateAiPairwiseDecision, parseAndValidateRelationshipShortlistTop2 } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision.validate";
import type { PairwiseDecisionJobPublicDto } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision-job.service";
import { AI_PAIRWISE_DECISION_JOB_STATUS } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision-job.constants";
import { AI_PAIRWISE_DECISION_SOURCE_VERSION } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision.schema";

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

describe("buildPairwiseFinalSourceShadowRecord", () => {
  const sl = shortlist();

  it("pairwise_winner_eligible → shadow selects winner", () => {
    const s = buildPairwiseFinalSourceShadowRecord({
      pairwiseJobId: "j1",
      viewerUserId: "viewer-1",
      poolId: "pool-1",
      shortlist: sl,
      decision: decisionBase({ winnerCandidateId: "cand-b", loserCandidateId: "cand-a" }),
      jobStatus: "succeeded",
    });
    expect(s.proposalRecommendation).toBe("pairwise_winner_eligible");
    expect(s.shadowSelectedCandidateUserId).toBe("cand-b");
    expect(s.staticTop1CandidateUserId).toBe("cand-a");
    expect(s.wouldChangeStaticResult).toBe(true);
    expect(s.pairwiseWinnerCandidateUserId).toBe("cand-b");
    expect(s.fallbackReason).toBeNull();
    expect(s.appliedToFinalScore).toBe(false);
    expect(s.appliedToWorkerRanking).toBe(false);
  });

  it("static_top1_fallback → shadow sticks to static top1", () => {
    const s = buildPairwiseFinalSourceShadowRecord({
      pairwiseJobId: "j1",
      viewerUserId: "viewer-1",
      poolId: "pool-1",
      shortlist: sl,
      decision: decisionBase({ decisionConfidence: 0.55 }),
      jobStatus: "succeeded",
    });
    expect(s.proposalRecommendation).toBe("static_top1_fallback");
    expect(s.shadowSelectedCandidateUserId).toBe("cand-a");
    expect(s.wouldChangeStaticResult).toBe(false);
    expect(s.fallbackReason).toBe("low_decision_confidence");
  });

  it("no_confident_match → MVP static shadow + dedicated fallbackReason", () => {
    const base = decisionBase();
    const d = decisionBase({
      candidateA: { ...base.candidateA, strongRisk: true },
      candidateB: { ...base.candidateB, strongRisk: true },
    });
    const s = buildPairwiseFinalSourceShadowRecord({
      pairwiseJobId: "j1",
      viewerUserId: "viewer-1",
      poolId: "pool-1",
      shortlist: sl,
      decision: d,
      jobStatus: "succeeded",
      proposalOptions: { strongRiskPolicy: "no_confident_match" },
    });
    expect(s.proposalRecommendation).toBe("no_confident_match");
    expect(s.shadowSelectedCandidateUserId).toBe("cand-a");
    expect(s.fallbackReason).toBe("no_confident_match_static_fallback");
    expect(s.wouldChangeStaticResult).toBe(false);
  });

  it("shadow JSON does not embed raw scores / dimensions / strongRisk", () => {
    const s = buildPairwiseFinalSourceShadowRecord({
      pairwiseJobId: "j1",
      viewerUserId: "viewer-1",
      poolId: "pool-1",
      shortlist: sl,
      decision: decisionBase(),
      jobStatus: "succeeded",
    });
    const json = JSON.stringify(s);
    expect(json).not.toMatch(/decisionScore|dimensions|strongRisk/i);
  });

  it("mapPairwiseJobPublicToViewerDto never exposes finalSourceShadow fields", () => {
    const job: PairwiseDecisionJobPublicDto = {
      id: "job-1",
      viewerUserId: "u",
      poolId: "p",
      shortlistFingerprint: "fp",
      status: AI_PAIRWISE_DECISION_JOB_STATUS.SUCCEEDED,
      sourceVersion: AI_PAIRWISE_DECISION_SOURCE_VERSION,
      shortlistSnapshot: sl,
      decisionResult: decisionBase(),
      failureDetail: null,
      fallbackUsed: false,
      finalSourceShadow: buildPairwiseFinalSourceShadowRecord({
        pairwiseJobId: "job-1",
        viewerUserId: "u",
        poolId: "p",
        shortlist: sl,
        decision: decisionBase(),
        jobStatus: "succeeded",
      }),
      startedAt: null,
      completedAt: null,
      createdAt: "2026-05-01T12:00:00.000Z",
      updatedAt: "2026-05-01T12:00:00.000Z",
      appliedToFinalScore: false,
      appliedToWorkerRanking: false,
    };
    const v = mapPairwiseJobPublicToViewerDto(job);
    expect(JSON.stringify(v)).not.toContain("shadowSelectedCandidateUserId");
    expect(JSON.stringify(v)).not.toContain("finalSourceShadow");
    expect(JSON.stringify(v)).not.toContain("proposalRecommendation");
  });
});
