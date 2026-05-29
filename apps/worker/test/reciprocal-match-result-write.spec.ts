import {
  isReciprocalMatchResultWriteEnabled,
  writeReciprocalMatchResultIfAbsent,
} from "../src/jobs/reciprocal-match-result-write.js";

describe("writeReciprocalMatchResultIfAbsent", () => {
  it("creates C→V when C has no outbound row", async () => {
    const create = jest.fn().mockResolvedValue({ id: "mr-recip" });
    const prisma = {
      matchResult: {
        findFirst: jest.fn().mockResolvedValue(null),
        create,
      },
    };

    const result = await writeReciprocalMatchResultIfAbsent(prisma, {
      viewerUserId: "user-7",
      candidateUserId: "user-6",
      batchId: "batch-1",
      finalScore: 0.8,
      reasonSummary: "ok",
      matchInsights: { scoreShadowV2: { version: 1 } },
    });

    expect(result).toEqual({
      written: true,
      reason: "reciprocal_match_result_created",
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-6",
          candidateUserId: "user-7",
        }),
      }),
    );
  });

  it("skips when candidate already has outbound result", async () => {
    const create = jest.fn();
    const prisma = {
      matchResult: {
        findFirst: jest.fn().mockResolvedValue({ id: "existing" }),
        create,
      },
    };

    const result = await writeReciprocalMatchResultIfAbsent(prisma, {
      viewerUserId: "user-7",
      candidateUserId: "user-6",
      batchId: "batch-1",
      finalScore: 0.8,
      reasonSummary: "ok",
      matchInsights: {},
    });

    expect(result.written).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("respects PEIMA_MATCH_RESULT_RECIPROCAL_ENABLED=0", async () => {
    const prev = process.env.PEIMA_MATCH_RESULT_RECIPROCAL_ENABLED;
    process.env.PEIMA_MATCH_RESULT_RECIPROCAL_ENABLED = "0";
    expect(isReciprocalMatchResultWriteEnabled()).toBe(false);
    process.env.PEIMA_MATCH_RESULT_RECIPROCAL_ENABLED = prev;
  });
});
