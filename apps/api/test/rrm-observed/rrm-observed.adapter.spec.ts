import { buildRrmObservedSignalSummary } from "../../src/modules/rrm-observed";
import { RRM_SOURCE_VERSION_OBSERVED } from "../../src/modules/rrm-shared";
import { assertRrmSignalSummaryBaseV1 } from "../rrm-shared/support/contract";

const VIEWER = "viewer-1";
const OTHER = "other-1";

function msg(senderUserId: string, content: string, minute: number) {
  return {
    senderUserId,
    content,
    createdAt: new Date(Date.UTC(2026, 4, 23, 12, minute, 0)).toISOString(),
  };
}

describe("buildRrmObservedSignalSummary (M5.1-r5)", () => {
  it("returns insufficient_data when message count below threshold", () => {
    const out = buildRrmObservedSignalSummary({
      conversationId: "c1",
      viewerUserId: VIEWER,
      counterpartyUserId: OTHER,
      messages: [msg(VIEWER, "hi", 0), msg(OTHER, "hello", 1)],
    });
    expect(out.insufficientData).toBe(true);
    expect(out.unavailableReason).toBe("insufficient_data");
    expect(out.sourceVersion).toBe(RRM_SOURCE_VERSION_OBSERVED);
    expect(() => assertRrmSignalSummaryBaseV1(out)).not.toThrow();
  });

  it("returns signals without RFI fields for healthy alternating chat", () => {
    const messages = [
      msg(VIEWER, "你好，最近怎么样？", 0),
      msg(OTHER, "还不错，你呢？有什么计划吗？", 1),
      msg(VIEWER, "周末想喝咖啡，方便见面聊聊吗？", 2),
      msg(OTHER, "可以啊，周六下午？", 3),
      msg(VIEWER, "好的，那就这么定。", 4),
      msg(OTHER, "嗯，到时候见。", 5),
    ];
    const out = buildRrmObservedSignalSummary({
      conversationId: "c2",
      viewerUserId: VIEWER,
      counterpartyUserId: OTHER,
      messages,
    });
    expect(out.insufficientData).toBe(false);
    expect(out.advancementDetected).toBe(true);
    expect(out.S_obs).toBeGreaterThan(0.3);
    expect(out.F_obs).toBeGreaterThan(0.2);
    expect(out).not.toHaveProperty("RFI_obs");
    expect(out.sourceVersion).not.toBe("rrm-sim-v1");
  });

  it("raises coldRisk / R_obs on pushy corpus", () => {
    const messages = [
      msg(VIEWER, "在吗", 0),
      msg(VIEWER, "怎么不回", 1),
      msg(VIEWER, "必须今晚见面不然就算了", 2),
      msg(OTHER, "嗯", 3),
      msg(VIEWER, "快点回复我", 4),
      msg(OTHER, "再说吧", 5),
    ];
    const out = buildRrmObservedSignalSummary({
      conversationId: "c3",
      viewerUserId: VIEWER,
      counterpartyUserId: OTHER,
      messages,
    });
    expect(out.insufficientData).toBe(false);
    expect(out.R_obs).toBeGreaterThan(0.2);
    expect(["slow_down", "pause"]).toContain(out.suggestedAction);
  });
});
