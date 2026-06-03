import {
  OLD_PHOTO_MATCHING_WRITER_DISABLED_REASON,
  OLD_PHOTO_MATCHING_WRITER_PRODUCTION_BLOCKED_REASON,
  OLD_PHOTO_MATCHING_WRITER_SHUTDOWN_REASON,
  TEST_MATCH_RESULT_WRITER_ALLOWED_REASON,
  TEST_MATCH_RESULT_WRITER_USER_NOT_ALLOWED_REASON,
  readOldPhotoMatchingWriterGate,
  readOldPhotoMatchingWriterGateForUser,
  writeLegacyPhotoMatchResultIfAllowed,
} from "../src/jobs/old-photo-matching-writer-shutdown-env";

describe("P7.10-r9 old photo matching writer shutdown env", () => {
  const baseEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...baseEnv };
  });

  it("defaults: shutdown enabled, writer disabled, blocked", () => {
    delete process.env.PEIMA_P710_R9_OLD_PHOTO_MATCHING_WRITER_ENABLED;
    delete process.env.PEIMA_P710_R9_OLD_PHOTO_MATCHING_WRITER_SHUTDOWN_ENABLED;
    delete process.env.PEIMA_P710_R9_OLD_PHOTO_MATCHING_WRITER_ENVIRONMENT;

    const gate = readOldPhotoMatchingWriterGate();
    expect(gate.shutdownEnabled).toBe(true);
    expect(gate.writerEnabled).toBe(false);
    expect(gate.canWriteMatchResult).toBe(false);
    expect(gate.mode).toBe("blocked");
    expect(gate.reason).toBe(OLD_PHOTO_MATCHING_WRITER_SHUTDOWN_REASON);
    expect(gate.safety.writesMatchResult).toBe(false);
    expect(gate.safety.triggersWorker).toBe(false);
    expect(gate.safety.changesCanonical).toBe(false);
    expect(gate.safety.changesPercent).toBe(false);
  });

  it("shutdown enabled blocks even when writer enabled", () => {
    process.env.PEIMA_P710_R9_OLD_PHOTO_MATCHING_WRITER_ENABLED = "1";
    process.env.PEIMA_P710_R9_OLD_PHOTO_MATCHING_WRITER_SHUTDOWN_ENABLED = "1";
    process.env.PEIMA_P710_R9_OLD_PHOTO_MATCHING_WRITER_ENVIRONMENT = "dev";

    const gate = readOldPhotoMatchingWriterGate();
    expect(gate.canWriteMatchResult).toBe(false);
    expect(gate.reason).toBe(OLD_PHOTO_MATCHING_WRITER_SHUTDOWN_REASON);
  });

  it("rollback: shutdown off + writer on + dev allows write", () => {
    process.env.PEIMA_P710_R9_OLD_PHOTO_MATCHING_WRITER_ENABLED = "1";
    process.env.PEIMA_P710_R9_OLD_PHOTO_MATCHING_WRITER_SHUTDOWN_ENABLED = "0";
    process.env.PEIMA_P710_R9_OLD_PHOTO_MATCHING_WRITER_ENVIRONMENT = "dev";
    process.env.NODE_ENV = "development";
    process.env.PEIMA_P76_PRODUCTION_PERCENT = "0";
    delete process.env.PEIMA_P76_PRODUCTION_PERCENT_ENABLED;

    const gate = readOldPhotoMatchingWriterGate();
    expect(gate.canWriteMatchResult).toBe(true);
    expect(gate.mode).toBe("allowed");
  });

  it("production environment always blocked", () => {
    process.env.PEIMA_P710_R9_OLD_PHOTO_MATCHING_WRITER_ENABLED = "1";
    process.env.PEIMA_P710_R9_OLD_PHOTO_MATCHING_WRITER_SHUTDOWN_ENABLED = "0";
    process.env.PEIMA_P710_R9_OLD_PHOTO_MATCHING_WRITER_ENVIRONMENT = "production";

    const gate = readOldPhotoMatchingWriterGate();
    expect(gate.canWriteMatchResult).toBe(false);
    expect(gate.reason).toBe(OLD_PHOTO_MATCHING_WRITER_PRODUCTION_BLOCKED_REASON);
  });

  it("percent > 0 blocks write", () => {
    process.env.PEIMA_P710_R9_OLD_PHOTO_MATCHING_WRITER_ENABLED = "1";
    process.env.PEIMA_P710_R9_OLD_PHOTO_MATCHING_WRITER_SHUTDOWN_ENABLED = "0";
    process.env.PEIMA_P710_R9_OLD_PHOTO_MATCHING_WRITER_ENVIRONMENT = "dev";
    process.env.PEIMA_P76_PRODUCTION_PERCENT = "5";

    const gate = readOldPhotoMatchingWriterGate();
    expect(gate.canWriteMatchResult).toBe(false);
  });

  it("dev allowlist override permits one local smoke-test user", () => {
    const gate = readOldPhotoMatchingWriterGateForUser("viewer-1", {
      PEIMA_TEST_MATCH_RESULT_WRITER_ENABLED: "1",
      PEIMA_TEST_MATCH_RESULT_WRITER_USER_IDS: "viewer-1,viewer-2",
      NODE_ENV: "development",
      PEIMA_P76_PRODUCTION_PERCENT: "0",
    });

    expect(gate.canWriteMatchResult).toBe(true);
    expect(gate.mode).toBe("allowed");
    expect(gate.reason).toBe(TEST_MATCH_RESULT_WRITER_ALLOWED_REASON);
  });

  it("dev allowlist override remains blocked for non-allowlisted users", () => {
    const gate = readOldPhotoMatchingWriterGateForUser("viewer-x", {
      PEIMA_TEST_MATCH_RESULT_WRITER_ENABLED: "1",
      PEIMA_TEST_MATCH_RESULT_WRITER_USER_IDS: "viewer-1,viewer-2",
      NODE_ENV: "development",
      PEIMA_P76_PRODUCTION_PERCENT: "0",
    });

    expect(gate.canWriteMatchResult).toBe(false);
    expect(gate.reason).toBe(TEST_MATCH_RESULT_WRITER_USER_NOT_ALLOWED_REASON);
  });

  it("PEIMA_TEST_MATCH_OPEN_FOR_ALL permits any viewer when writer enabled", () => {
    const gate = readOldPhotoMatchingWriterGateForUser("any-user", {
      PEIMA_TEST_MATCH_RESULT_WRITER_ENABLED: "1",
      PEIMA_TEST_MATCH_OPEN_FOR_ALL: "1",
      NODE_ENV: "development",
      PEIMA_P76_PRODUCTION_PERCENT: "0",
    });

    expect(gate.canWriteMatchResult).toBe(true);
    expect(gate.reason).toBe(TEST_MATCH_RESULT_WRITER_ALLOWED_REASON);
  });
});

describe("writeLegacyPhotoMatchResultIfAllowed", () => {
  const writePayload = {
    userId: "viewer-1",
    candidateUserId: "candidate-1",
    batchId: "batch-1",
    finalScore: 0.82,
    reasonSummary: "test",
    matchInsights: { v: 1 },
    status: "ready",
  };

  it("does not call matchResult.create when shutdown default gate", async () => {
    const create = jest.fn();
    const gate = readOldPhotoMatchingWriterGate({
      PEIMA_P710_R9_OLD_PHOTO_MATCHING_WRITER_SHUTDOWN_ENABLED: "1",
      PEIMA_P710_R9_OLD_PHOTO_MATCHING_WRITER_ENABLED: "0",
    });

    const result = await writeLegacyPhotoMatchResultIfAllowed(
      { matchResult: { create } },
      writePayload,
      gate,
    );

    expect(create).not.toHaveBeenCalled();
    expect(result.written).toBe(false);
    expect(result.mode).toBe("blocked");
    if (!result.written) {
      expect(result.reason).toBe(OLD_PHOTO_MATCHING_WRITER_SHUTDOWN_REASON);
    }
  });

  it("calls matchResult.create only when gate allows", async () => {
    const create = jest.fn().mockResolvedValue({});
    const gate = readOldPhotoMatchingWriterGate({
      PEIMA_P710_R9_OLD_PHOTO_MATCHING_WRITER_SHUTDOWN_ENABLED: "0",
      PEIMA_P710_R9_OLD_PHOTO_MATCHING_WRITER_ENABLED: "1",
      PEIMA_P710_R9_OLD_PHOTO_MATCHING_WRITER_ENVIRONMENT: "dev",
      NODE_ENV: "development",
      PEIMA_P76_PRODUCTION_PERCENT: "0",
    });

    const result = await writeLegacyPhotoMatchResultIfAllowed(
      { matchResult: { create } },
      writePayload,
      gate,
    );

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({ data: writePayload });
    expect(result.written).toBe(true);
  });
});
