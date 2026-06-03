import { recordBatchMatchRunToTestingObservability } from "../../src/modules/testing-observability/batch-match-testing-observability";

describe("recordBatchMatchRunToTestingObservability", () => {
  afterEach(() => {
    delete process.env.PEIMA_TEST_OBSERVABILITY_ENABLED;
  });

  it("writes trigger and queue events when observability enabled", async () => {
    process.env.PEIMA_TEST_OBSERVABILITY_ENABLED = "1";
    const create = jest.fn().mockResolvedValue({ id: "e1" });
    const prisma = {
      testingObservabilityEvent: { create },
      matchBatch: {
        findFirst: jest.fn().mockResolvedValue({
          id: "b1",
          status: "completed",
          successCount: 1,
          failedCount: 0,
          totalUsers: 1,
          createdAt: new Date(),
        }),
      },
      batchMatchQueue: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "q1",
            userId: "u1",
            batchId: "b1",
            status: "matched",
            updatedAt: new Date(),
          },
        ]),
      },
      matchResult: {
        findFirst: jest.fn().mockResolvedValue({ id: "mr1" }),
      },
    };

    await recordBatchMatchRunToTestingObservability(prisma as never, {
      triggeredByUserId: "admin1",
      channel: "admin_batch_match",
      subprocessOk: true,
    });

    expect(create).toHaveBeenCalled();
    const types = create.mock.calls.map(
      (c) => c[0].data.eventType as string,
    );
    expect(types).toContain("batch_match_trigger");
    expect(types).toContain("batch_match_queue");
  });
});
