import {
  userMessageForEnqueue,
  userMessageForNoResultReason,
  userMessageForQueueStatus,
} from "../src/modules/matching/matching-user-messages";

describe("matching-user-messages", () => {
  it("enqueue: new vs already waiting", () => {
    expect(userMessageForEnqueue({ alreadyQueued: false })).toContain("已加入匹配队列");
    expect(userMessageForEnqueue({ alreadyQueued: true })).toContain("已在匹配队列");
  });

  it("queue status: waiting, processing, ready, failed", () => {
    expect(userMessageForQueueStatus("waiting")).toContain("排队");
    expect(userMessageForQueueStatus("processing")).toContain("筛选");
    expect(userMessageForQueueStatus("ready")).toContain("已完成");
    expect(userMessageForQueueStatus("failed")).toContain("未能完成");
    expect(userMessageForQueueStatus("not_queued")).toContain("开始匹配");
  });

  it("no-result reasons: friendly copy without internal codes", () => {
    for (const reason of [
      "not_queued",
      "no_match_result",
      "candidate_pool_empty",
      "onboarding_incomplete",
      "legacy_writer_disabled",
      "unknown",
    ] as const) {
      const msg = userMessageForNoResultReason(reason);
      expect(msg.length).toBeGreaterThan(4);
      expect(msg).not.toMatch(/NO_ACTIVE_POOL|reasonCode/i);
    }
  });
});
