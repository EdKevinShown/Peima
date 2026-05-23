import {
  buildRrmTimelineSignalSummary,
  detectRrmTimelineAdvancementWindows,
} from "../../src/modules/rrm-timeline";

function msg(
  senderUserId: string,
  content: string,
  offsetHours: number,
): { senderUserId: string; content: string; createdAt: string } {
  const base = Date.parse("2026-01-01T12:00:00.000Z");
  return {
    senderUserId,
    content,
    createdAt: new Date(base + offsetHours * 3600_000).toISOString(),
  };
}

function conversationMessages(): ReturnType<typeof msg>[] {
  const v = "viewer";
  const c = "counter";
  return [
    msg(v, "你好", 0),
    msg(c, "嗨", 1),
    msg(v, "最近怎么样", 2),
    msg(c, "还行，工作挺忙", 3),
    msg(v, "周末有空一起喝咖啡吗？", 4),
    msg(c, "可以啊", 5),
    msg(v, "那就周六下午？", 6),
    msg(c, "好的", 7),
    msg(v, "见面聊", 8),
    msg(c, "嗯", 9),
  ];
}

describe("rrm-timeline adapter (M5.1-r9)", () => {
  it("returns insufficient_data below message threshold", () => {
    const out = buildRrmTimelineSignalSummary({
      conversationId: "c1",
      viewerUserId: "v",
      counterpartyUserId: "c",
      messages: [msg("v", "hi", 0), msg("c", "hey", 1)],
    });
    expect(out.insufficientData).toBe(true);
    expect(out.advancementWindowCount).toBe(0);
    expect(out.sourceVersion).toBe("rrm-timeline-v1");
  });

  it("emits trend signals without advancement windows for neutral chat", () => {
    const messages = Array.from({ length: 8 }, (_, i) =>
      msg(i % 2 === 0 ? "v" : "c", `日常闲聊 ${i}`, i),
    );
    const out = buildRrmTimelineSignalSummary({
      conversationId: "c1",
      viewerUserId: "v",
      counterpartyUserId: "c",
      messages,
    });
    expect(out.insufficientData).toBe(false);
    expect(out.advancementWindowCount).toBe(0);
    expect(out.mode).toBe("signal_summary_only");
    expect(out.stage).toBeTruthy();
    expect(out.paceTrend).toBeTruthy();
  });

  it("detects advancement windows and computes RFI_t (core_formula_output)", () => {
    const messages = conversationMessages();
    const windows = detectRrmTimelineAdvancementWindows(messages);
    expect(windows.length).toBeGreaterThan(0);

    const out = buildRrmTimelineSignalSummary({
      conversationId: "c1",
      viewerUserId: "viewer",
      counterpartyUserId: "counter",
      messages,
    });
    expect(out.mode).toBe("core_formula_output");
    expect(out.advancementWindowCount).toBeGreaterThan(0);
    expect(out.windows[0]!.RFI_t).toEqual(expect.any(Number));
    expect(out.windows[0]!.branch).toMatch(/within_capacity|over_capacity/);
  });

  it("marks pressure window as over_capacity when capacity is low", () => {
    const messages = [
      msg("v", "在吗", 0),
      msg("c", "嗯", 1),
      msg("v", "怎么还不回我？今晚必须见面", 2),
      msg("c", "再说吧", 3),
      msg("v", "快点", 4),
      msg("c", "…", 5),
    ];
    const out = buildRrmTimelineSignalSummary({
      conversationId: "c1",
      viewerUserId: "v",
      counterpartyUserId: "c",
      messages,
    });
    expect(out.advancementWindowCount).toBeGreaterThan(0);
    expect(out.windows.some((w) => w.branch === "over_capacity")).toBe(true);
    expect(out.stage).toBe("risk");
  });
});
