import { writeP76AllowlistApplyMeta } from "../src/modules/matching/p76-allowlist-apply-writer";
import { runP76R8bAllowlistApplyWriterMain } from "../src/dev-cli/p76-r8b-allowlist-apply-writer-runner";

jest.mock("../src/modules/matching/p76-allowlist-apply-writer", () => {
  const actual = jest.requireActual(
    "../src/modules/matching/p76-allowlist-apply-writer",
  );
  return {
    ...actual,
    writeP76AllowlistApplyMeta: jest.fn(),
  };
});

jest.mock("@nestjs/core", () => ({
  NestFactory: {
    createApplicationContext: jest.fn().mockResolvedValue({
      get: jest.fn().mockReturnValue({}),
      close: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

const writeMock = writeP76AllowlistApplyMeta as jest.MockedFunction<
  typeof writeP76AllowlistApplyMeta
>;

describe("p76 allowlist apply writer runner", () => {
  const originalEnv = process.env.DATABASE_URL;
  let stdout: string;

  beforeEach(() => {
    process.env.DATABASE_URL = "postgresql://localhost/test";
    stdout = "";
    jest.spyOn(console, "log").mockImplementation((msg: string) => {
      stdout += msg;
    });
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    writeMock.mockReset();
  });

  afterEach(() => {
    process.env.DATABASE_URL = originalEnv;
    jest.restoreAllMocks();
  });

  it("prints JSON result on success", async () => {
    writeMock.mockResolvedValue({
      schemaVersion: "p7.6-r8b-allowlist-apply-writer-v1",
      generatedAt: "2026-05-17T00:00:00.000Z",
      viewerUserId: "viewer-1",
      sourceVersion: "p7.6-r7j3-staging-cohort-v1",
      effectiveDryRun: true,
      wouldApply: true,
      wroteSidecar: false,
      blocked: false,
      blockedReasons: [],
      allowlistMatched: true,
      meta: null,
      sidecarRowId: null,
      applied: false,
    });

    await runP76R8bAllowlistApplyWriterMain([
      "--viewerUserId=viewer-1",
      "--selectedCandidateId=cand-1",
      "--stage1SelectedCandidateIds=cand-1",
      "--stage2Top2CandidateIds=cand-1",
      "--dryRun=true",
    ]);

    const parsed = JSON.parse(stdout) as { wouldApply: boolean; applied: boolean };
    expect(parsed.wouldApply).toBe(true);
    expect(parsed.applied).toBe(false);
  });

  it("requires --dryRun", async () => {
    const exit = jest.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit");
    }) as never);

    await expect(
      runP76R8bAllowlistApplyWriterMain([
        "--viewerUserId=viewer-1",
        "--selectedCandidateId=cand-1",
        "--stage1SelectedCandidateIds=cand-1",
        "--stage2Top2CandidateIds=cand-1",
      ]),
    ).rejects.toThrow("exit");

    exit.mockRestore();
  });
});
