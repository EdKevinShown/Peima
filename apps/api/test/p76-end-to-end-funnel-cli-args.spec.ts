import {
  P76R6bCliArgsError,
  assertExactlyTwoTop2Ids,
  finalizeP76R6EndToEndFunnelShadowAuditCliArgs,
  parseCandidateIdsCsv,
  parseP76R6EndToEndFunnelShadowAuditCliArgsRaw,
} from "../src/dev-cli/p76-r6-end-to-end-funnel-shadow-audit-cli-args";

const VIEWER = "cmo7ksq8s00006znosryc9k0n";
const WINNER = "cmfemn00100016z64seed0001";
const RUNNER_UP = "cmfemn003000506z64seed0003";

describe("p76 end-to-end funnel cli args", () => {
  it("viewerUserId missing → error", () => {
    expect(() =>
      parseP76R6EndToEndFunnelShadowAuditCliArgsRaw([
        "--dryRun=true",
        `--stage2Top2CandidateIds=${WINNER},${RUNNER_UP}`,
        `--selectedBy20DOnlyCandidateId=${WINNER}`,
        `--selectedByRrmCandidateId=${WINNER}`,
      ]),
    ).toThrow(P76R6bCliArgsError);
  });

  it("dryRun=false → error", () => {
    expect(() =>
      parseP76R6EndToEndFunnelShadowAuditCliArgsRaw([
        `--viewerUserId=${VIEWER}`,
        "--dryRun=false",
        `--stage2Top2CandidateIds=${WINNER},${RUNNER_UP}`,
        `--selectedBy20DOnlyCandidateId=${WINNER}`,
        `--selectedByRrmCandidateId=${WINNER}`,
      ]),
    ).toThrow(/requires --dryRun=true/);
  });

  it("invalid sourcePoolType → error", () => {
    expect(() =>
      parseP76R6EndToEndFunnelShadowAuditCliArgsRaw([
        `--viewerUserId=${VIEWER}`,
        "--dryRun=true",
        "--sourcePoolType=other",
        `--stage2Top2CandidateIds=${WINNER},${RUNNER_UP}`,
        `--selectedBy20DOnlyCandidateId=${WINNER}`,
        `--selectedByRrmCandidateId=${WINNER}`,
      ]),
    ).toThrow(/only supports --sourcePoolType/);
  });

  it("explicit stage ids parse / trim / dedupe", () => {
    const raw = parseP76R6EndToEndFunnelShadowAuditCliArgsRaw([
      `--viewerUserId=${VIEWER}`,
      "--dryRun=true",
      `--stage2Top2CandidateIds=${WINNER}, ${RUNNER_UP},${WINNER}`,
      `--selectedBy20DOnlyCandidateId=${WINNER}`,
      `--selectedByRrmCandidateId=${WINNER}`,
      "--stage1SelectedCandidateIds=a, b, a",
    ]);

    const cli = finalizeP76R6EndToEndFunnelShadowAuditCliArgs(raw);
    expect(cli.stage2Top2CandidateIds).toEqual([WINNER, RUNNER_UP]);
    expect(cli.stage1SelectedCandidateIds).toEqual(["a", "b"]);
    expect(parseCandidateIdsCsv(" x , y , x ")).toEqual(["x", "y"]);
  });

  it("missing selectedByRrmCandidateId without stage3 path → error", () => {
    expect(() =>
      parseP76R6EndToEndFunnelShadowAuditCliArgsRaw([
        `--viewerUserId=${VIEWER}`,
        "--dryRun=true",
        `--stage2Top2CandidateIds=${WINNER},${RUNNER_UP}`,
        `--selectedBy20DOnlyCandidateId=${WINNER}`,
      ]),
    ).toThrow(/selectedByRrmCandidateId/);
  });

  it("stage2Top2CandidateIds not exactly 2 → error", () => {
    expect(() => assertExactlyTwoTop2Ids([WINNER])).toThrow(/exactly 2/);
    expect(() =>
      finalizeP76R6EndToEndFunnelShadowAuditCliArgs(
        parseP76R6EndToEndFunnelShadowAuditCliArgsRaw([
          `--viewerUserId=${VIEWER}`,
          "--dryRun=true",
          `--stage2Top2CandidateIds=${WINNER}`,
          `--selectedBy20DOnlyCandidateId=${WINNER}`,
          `--selectedByRrmCandidateId=${WINNER}`,
        ]),
      ),
    ).toThrow(/exactly 2/);
  });

  it("auditJsonPath optional when explicit ids provided", () => {
    const raw = parseP76R6EndToEndFunnelShadowAuditCliArgsRaw([
      `--viewerUserId=${VIEWER}`,
      "--dryRun=true",
      `--stage2Top2CandidateIds=${WINNER},${RUNNER_UP}`,
      `--selectedBy20DOnlyCandidateId=${WINNER}`,
      `--selectedByRrmCandidateId=${WINNER}`,
    ]);
    expect(raw.stage2AuditJsonPath).toBeUndefined();
    expect(finalizeP76R6EndToEndFunnelShadowAuditCliArgs(raw).dryRun).toBe(true);
  });
});
