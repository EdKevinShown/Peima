import { runP76R7g2RouteCStage1AdapterAuditMain } from "../src/dev-cli/p76-r7g2-route-c-stage1-adapter-audit-runner";
import { runRouteCStage1AdapterAuditFromDb } from "../src/modules/onboarding/vision/p76-route-c-stage1-adapter";

jest.mock("../src/modules/onboarding/vision/p76-route-c-stage1-adapter", () => {
  const actual = jest.requireActual(
    "../src/modules/onboarding/vision/p76-route-c-stage1-adapter",
  );
  return {
    ...actual,
    runRouteCStage1AdapterAuditFromDb: jest.fn(),
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

const runAuditMock = runRouteCStage1AdapterAuditFromDb as jest.MockedFunction<
  typeof runRouteCStage1AdapterAuditFromDb
>;

describe("p76 route c stage1 adapter runner", () => {
  const originalEnv = process.env.DATABASE_URL;
  let stdout: string;

  beforeEach(() => {
    process.env.DATABASE_URL = "postgresql://localhost/test";
    stdout = "";
    jest.spyOn(console, "log").mockImplementation((msg: string) => {
      stdout += msg;
    });
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    runAuditMock.mockReset();
  });

  afterEach(() => {
    process.env.DATABASE_URL = originalEnv;
    jest.restoreAllMocks();
  });

  it("prints JSON report on success", async () => {
    runAuditMock.mockResolvedValue({
      schemaVersion: "p7.6-r7g2-route-c-stage1-adapter-v1",
      generatedAt: "2026-05-16T00:00:00.000Z",
      viewerUserId: "viewer-1",
      sourcePoolType: "route_c_clean_pool",
      sourcePoolId: "pool-1",
      poolSourceVersion: "p7.6-r7j3-staging-cohort-v1",
      selectionLimit: 6,
      dryRun: true,
      scannedCandidates: 1,
      eligibleCandidates: 1,
      selectedCandidateIds: ["cand-1"],
      ineligibleReasonDistribution: {},
      pairs: [],
      applied: false,
    });

    await runP76R7g2RouteCStage1AdapterAuditMain([
      "--viewerUserId=viewer-1",
      "--dryRun=true",
    ]);

    const parsed = JSON.parse(stdout) as {
      selectedCandidateIds: string[];
      applied: boolean;
    };
    expect(parsed.selectedCandidateIds).toEqual(["cand-1"]);
    expect(parsed.applied).toBe(false);
  });
});
