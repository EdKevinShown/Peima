import { parseRrmEvalSampleFromRow } from "../../src/modules/rrm-eval";

describe("rrm-eval sample parser (M5.1-r11)", () => {
  it("marks rrmSupported from bounded decision would_switch_to_rrm", () => {
    const sample = parseRrmEvalSampleFromRow({
      matchInsights: { rrmBoundedDecision: { decision: "would_switch_to_rrm" } },
      candidateUserId: "cand-1",
      conversation: null,
      feedbacks: [],
    });
    expect(sample.rrmSupported).toBe(true);
  });

  it("marks caution from sim fallback", () => {
    const sample = parseRrmEvalSampleFromRow({
      matchInsights: {
        rrmSimReadonlySummary: {
          schemaVersion: 1,
          sourceVersion: "rrm-sim-v1",
          sourceType: "rrm_sim_readonly_summary",
          candidateUserId: "c1",
          winnerUserId: "c1",
          proposalCandidateUserId: "c1",
          suggestedAction: "maintain",
          simulatedRhythmScore: 55,
          fallbackUsed: true,
          cautionFlags: ["rrm_fallback"],
          generatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
      candidateUserId: "c1",
      conversation: null,
      feedbacks: [],
    });
    expect(sample.cautionBucket).toBe(true);
    expect(sample.hasRrmSimSummary).toBe(true);
  });

  it("derives observed rhythm proxy and cold risk from conversation messages", () => {
    const base = Date.parse("2026-01-01T12:00:00.000Z");
    const messages = Array.from({ length: 8 }, (_, i) => ({
      senderUserId: i % 2 === 0 ? "v" : "c",
      content: i === 4 ? "周末见面喝咖啡吗" : `msg ${i}`,
      createdAt: new Date(base + i * 3600_000),
    }));
    const sample = parseRrmEvalSampleFromRow({
      matchInsights: {},
      candidateUserId: "c",
      conversation: {
        viewerUserId: "v",
        counterpartyUserId: "c",
        messages,
      },
      feedbacks: [{ rating: 5, tags: [], structuredPayload: null }],
    });
    expect(sample.hasConversation).toBe(true);
    expect(sample.observedRhythmProxy).not.toBeNull();
    expect(sample.assistantHelpful).toBe(true);
  });
});
