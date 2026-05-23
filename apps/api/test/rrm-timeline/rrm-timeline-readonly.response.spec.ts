import { buildRrmTimelineSignalSummary, toRrmTimelineReadonlyHttpDto } from "../../src/modules/rrm-timeline";

describe("rrm-timeline readonly HTTP mapping (M5.1-r9)", () => {
  it("omits raw RFI_t from viewer DTO", () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      senderUserId: i % 2 === 0 ? "v" : "c",
      content: i === 4 ? "周末有空见面聊聊吗？" : `msg ${i}`,
      createdAt: new Date(Date.parse("2026-01-01T00:00:00Z") + i * 3600_000).toISOString(),
    }));
    const summary = buildRrmTimelineSignalSummary({
      conversationId: "c1",
      viewerUserId: "v",
      counterpartyUserId: "c",
      messages,
    });
    const http = toRrmTimelineReadonlyHttpDto({
      conversationId: "c1",
      participantUserId: "v",
      summary,
    });
    expect(http.appliedToMatchResult).toBe(false);
    expect(http.sourceVersion).toBe("rrm-timeline-v1");
    for (const w of http.advancementWindows) {
      expect(w).not.toHaveProperty("RFI_t");
      expect(w.rhythmBand).toMatch(/good|caution|avoid/);
    }
  });
});
