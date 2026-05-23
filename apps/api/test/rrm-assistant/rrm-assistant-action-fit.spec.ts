import {
  buildRrmAssistantDraftAssessment,
  computeRrmAssistantActionFit,
  detectRrmAssistantDraft,
} from "../../src/modules/rrm-assistant";
import type { RrmObservedSignalSummaryV1 } from "../../src/modules/rrm-observed";

function observedStub(partial: Partial<RrmObservedSignalSummaryV1>): RrmObservedSignalSummaryV1 {
  return {
    schemaVersion: 1,
    sourceVersion: "rrm-observed-v1",
    layer: "adapter",
    mode: "signal_summary_only",
    fallbackUsed: false,
    insufficientData: false,
    unavailableReason: null,
    generatedAt: "2026-01-01T00:00:00.000Z",
    conversationId: "c1",
    messageCount: 12,
    viewerMessageCount: 6,
    counterpartyMessageCount: 6,
    advancementDetected: false,
    S_obs: 0.55,
    E_obs: 0.6,
    F_obs: 0.5,
    Q_obs: 0.5,
    D_obs: 0.15,
    R_obs: 0.1,
    coldRisk: 0.2,
    pace: "steady",
    suggestedAction: "maintain",
    ...partial,
  };
}

describe("rrm-assistant ActionFit (M5.1-r8)", () => {
  it("uses over_capacity branch when A_draft exceeds derived C_state", () => {
    const detection = detectRrmAssistantDraft("怎么还不回我？今晚必须见面");
    expect(detection.advancementDetected).toBe(true);

    const fit = computeRrmAssistantActionFit({
      draft: "怎么还不回我？今晚必须见面",
      detection,
      observedSummary: observedStub({
        S_obs: 0.08,
        F_obs: 0.08,
        Q_obs: 0.08,
        coldRisk: 0.92,
      }),
    });

    expect(fit.branch).toBe("over_capacity");
    expect(fit.P).toBeDefined();
    expect(fit.suitabilityBand).toBe("avoid");
  });

  it("uses within_capacity branch for light invite with healthy observed context", () => {
    const detection = detectRrmAssistantDraft("周末有空一起喝咖啡吗？");
    const fit = computeRrmAssistantActionFit({
      draft: "周末有空一起喝咖啡吗？",
      detection,
      observedSummary: observedStub({
        S_obs: 0.7,
        F_obs: 0.65,
        Q_obs: 0.6,
        coldRisk: 0.15,
      }),
    });

    expect(fit.branch).toBe("within_capacity");
    expect(fit.P).toBeUndefined();
    expect(["good", "caution"]).toContain(fit.suitabilityBand);
  });

  it("buildRrmAssistantDraftAssessment returns core_formula_output with actionFit on advancement", () => {
    const out = buildRrmAssistantDraftAssessment({
      draft: "周末见面聊聊？",
      observedSummary: observedStub({}),
    });
    expect(out.mode).toBe("core_formula_output");
    expect(out.actionFit).not.toBeNull();
    expect(out.toneAdvice).toBeTruthy();
    expect(out.suggestedAction).toBeTruthy();
  });
});
