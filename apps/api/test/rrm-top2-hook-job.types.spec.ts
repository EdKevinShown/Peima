import {
  RRM_TOP2_HOOK_JOB_CONTRACT_SOURCE_VERSION,
  RRM_TOP2_HOOK_JOB_STATUS,
} from "../src/modules/matching/rrm-top2-hook-job.types";

describe("rrm-top2-hook-job.types (M5.6-B1)", () => {
  it("exposes hook job status literals", () => {
    expect(RRM_TOP2_HOOK_JOB_STATUS.PENDING).toBe("pending");
    expect(RRM_TOP2_HOOK_JOB_STATUS.PROCESSING).toBe("processing");
    expect(RRM_TOP2_HOOK_JOB_STATUS.PROCESSED).toBe("processed");
    expect(RRM_TOP2_HOOK_JOB_STATUS.SKIPPED).toBe("skipped");
    expect(RRM_TOP2_HOOK_JOB_STATUS.FAILED).toBe("failed");
  });

  it("exposes contract sourceVersion for hook job rows", () => {
    expect(RRM_TOP2_HOOK_JOB_CONTRACT_SOURCE_VERSION).toBe("m5.6-b1-rrm-top2-hook-job-v1");
  });
});
