import type { MatchResult } from "@peima/database";
import { readM5RrmSimReadonlySummaryWriteEnabled } from "../src/modules/matching/matching-m5-rrm-sim-readonly-summary-write-env";
import {
  buildMultiSourceFinalDecisionReadonlyM51M0,
  RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY,
  tryParseRrmSimReadonlySummaryFromMatchInsights,
} from "../src/modules/matching/matching-multi-source-final-decision-m51m0";
import { buildRrmSimReadonlySummaryFromRrmSimResult } from "../src/modules/matching/matching-rrm-sim-readonly-summary";
import { mergeRrmSimReadonlySummaryIntoMatchInsights } from "../src/modules/matching/matching-rrm-sim-readonly-summary";
import { writeRrmSimReadonlySummaryToMatchResult } from "../src/modules/matching/matching-rrm-sim-readonly-summary-writer";
import type { RrmSimResult } from "../src/modules/ai-simulation-v1/rrm-sim.types";

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

function validSummary() {
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
  return buildRrmSimReadonlySummaryFromRrmSimResult(rrm, {
    candidateUserId: "cand-x",
    generatedAt: GENERATED_AT,
  });
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

describe("readM5RrmSimReadonlySummaryWriteEnabled", () => {
  const key = "PEIMA_M5_RRM_SIM_READONLY_SUMMARY_WRITE_ENABLED";
  const prev = process.env[key];

  afterEach(() => {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  });

  it("is false when unset", () => {
    delete process.env[key];
    expect(readM5RrmSimReadonlySummaryWriteEnabled()).toBe(false);
  });

  it.each(["true", "1", "yes"] as const)("is true for %s", (v) => {
    process.env[key] = v;
    expect(readM5RrmSimReadonlySummaryWriteEnabled()).toBe(true);
  });
});

describe("writeRrmSimReadonlySummaryToMatchResult (M5.2-M2B)", () => {
  it("does not call prisma.update when writeEnabled is false", async () => {
    const update = jest.fn();
    const r = await writeRrmSimReadonlySummaryToMatchResult({
      matchResultId: "mid-1",
      existingMatchInsights: null,
      incomingSummary: validSummary(),
      writeEnabled: false,
      prisma: { matchResult: { update } },
    });
    expect(r).toEqual({ written: false, reason: "disabled", sourceVersion: null });
    expect(update).not.toHaveBeenCalled();
  });

  it("does not write when incomingSummary is invalid", async () => {
    const update = jest.fn();
    const r = await writeRrmSimReadonlySummaryToMatchResult({
      matchResultId: "mid-1",
      existingMatchInsights: {},
      incomingSummary: { schemaVersion: 1, sourceVersion: "bad-version" },
      writeEnabled: true,
      prisma: { matchResult: { update } },
    });
    expect(r.written).toBe(false);
    expect(r.reason).toBe("invalid_summary");
    expect(update).not.toHaveBeenCalled();
  });

  it("does not overwrite when existing rrmSimReadonlySummary.frozenAt is set", async () => {
    const update = jest.fn();
    const existing = {
      explanation: { whyMatch: "w", strengths: [], cautions: [], rhythmPrediction: "" },
      [RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY]: {
        schemaVersion: 1,
        sourceVersion: "rrm-sim-v1",
        candidateUserId: "cand-old",
        suggestedAction: "maintain",
        progressionWindow: "open",
        simulatedRhythmScore: 50,
        fallbackUsed: false,
        frozenAt: "2026-04-01T00:00:00.000Z",
      },
    };
    const r = await writeRrmSimReadonlySummaryToMatchResult({
      matchResultId: "mid-1",
      existingMatchInsights: existing,
      incomingSummary: validSummary(),
      writeEnabled: true,
      prisma: { matchResult: { update } },
    });
    expect(r.written).toBe(false);
    expect(r.reason).toBe("frozen_existing_summary");
    expect(update).not.toHaveBeenCalled();
  });

  it("when writeEnabled and summary valid, updates only matchInsights", async () => {
    const update = jest.fn(
      async (_args: {
        where: { id: string };
        data: { matchInsights: unknown };
      }): Promise<unknown> => ({}),
    );
    const existing = {
      explanation: { whyMatch: "keep", strengths: [], cautions: ["c1"], rhythmPrediction: "rp" },
      riskFlags: ["r1"],
      openingTopics: [],
      chatSimulationSummary: "cs",
    };
    const incoming = validSummary();
    const r = await writeRrmSimReadonlySummaryToMatchResult({
      matchResultId: " mid-1 ",
      existingMatchInsights: existing,
      incomingSummary: incoming,
      writeEnabled: true,
      prisma: { matchResult: { update } },
    });
    expect(r.written).toBe(true);
    expect(r.reason).toBe("updated");
    expect(r.sourceVersion).toBe("rrm-sim-v1");
    expect(update).toHaveBeenCalledTimes(1);
    const arg = update.mock.calls[0]![0];
    expect(Object.keys(arg.data).sort()).toEqual(["matchInsights"]);
    expect(arg.data).not.toHaveProperty("candidateUserId");
    expect(arg.data).not.toHaveProperty("finalScore");
    expect(arg.where).toEqual({ id: "mid-1" });
    const written = arg.data.matchInsights as Record<string, unknown>;
    expect(written.explanation).toEqual(existing.explanation);
    expect(written.riskFlags).toEqual(["r1"]);
    expect(tryParseRrmSimReadonlySummaryFromMatchInsights(written)).not.toBeNull();
  });

  it("merged matchInsights hydrates sidecar rrmSim without changing display baseline", () => {
    const incoming = validSummary();
    const merged = mergeRrmSimReadonlySummaryIntoMatchInsights(
      {
        explanation: { whyMatch: "w", strengths: [], cautions: [], rhythmPrediction: "" },
        riskFlags: [],
        openingTopics: [],
        chatSimulationSummary: "",
      },
      incoming,
    );
    const row = mr({ matchInsights: merged as MatchResult["matchInsights"] });
    const display = {
      displayCandidateUserId: "cand-display",
      displaySourceType: "pairwise_final" as const,
      finalMatchDecisionMeta: null,
    };
    const sidecarReadonly = buildMultiSourceFinalDecisionReadonlyM51M0(row, display);
    expect(sidecarReadonly.sources.rrmSim.available).toBe(true);
    expect(sidecarReadonly.m5ProposedDisplayCandidateUserId).toBeNull();
    expect(sidecarReadonly.m5AppliedToDisplay).toBe(false);
    expect(sidecarReadonly.currentDisplayCandidateUserId).toBe("cand-display");
    expect(sidecarReadonly.currentDisplaySourceType).toBe("pairwise_final");
    expect(sidecarReadonly.baseline.matchResultCandidateUserId).toBe("cand-static");
    expect(sidecarReadonly.baseline.finalScore).toBe(0.82);
  });

  it("shadowEnabled=true still does not propose display candidate", () => {
    const incoming = validSummary();
    const merged = mergeRrmSimReadonlySummaryIntoMatchInsights({}, incoming);
    const row = mr({ matchInsights: merged as MatchResult["matchInsights"] });
    const display = {
      displayCandidateUserId: row.candidateUserId,
      displaySourceType: "match_result_original" as const,
      finalMatchDecisionMeta: null,
    };
    const sidecar = buildMultiSourceFinalDecisionReadonlyM51M0(row, display, { shadowEnabled: true });
    expect(sidecar.sources.rrmSim.available).toBe(true);
    expect(sidecar.m5ProposedDisplayCandidateUserId).toBeNull();
    expect(sidecar.shadow.shadowDisplayProposalComputed).toBe(false);
    expect(sidecar.m5AppliedToDisplay).toBe(false);
  });
});
