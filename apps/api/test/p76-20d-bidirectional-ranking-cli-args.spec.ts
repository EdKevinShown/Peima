import {
  P76R4bCliArgsError,
  parseCandidateUserIdsCsv,
  parseP76R4bTwentyDBidirectionalRankingAuditCliArgs,
} from "../src/dev-cli/p76-r4b-20d-bidirectional-ranking-audit-cli-args";

describe("p76 20d bidirectional ranking audit cli args", () => {
  it("viewerUserId missing → error", () => {
    expect(() =>
      parseP76R4bTwentyDBidirectionalRankingAuditCliArgs([
        "--candidateUserIds=c1",
        "--dryRun=true",
      ]),
    ).toThrow(P76R4bCliArgsError);
    expect(() =>
      parseP76R4bTwentyDBidirectionalRankingAuditCliArgs([
        "--candidateUserIds=c1",
        "--dryRun=true",
      ]),
    ).toThrow(/--viewerUserId is required/);
  });

  it("candidateUserIds missing → error", () => {
    expect(() =>
      parseP76R4bTwentyDBidirectionalRankingAuditCliArgs([
        "--viewerUserId=v1",
        "--dryRun=true",
      ]),
    ).toThrow(/--candidateUserIds is required/);
  });

  it("candidateUserIds empty csv → error", () => {
    expect(() => parseCandidateUserIdsCsv(" , ")).toThrow(
      /--candidateUserIds must contain at least one id/,
    );
  });

  it("dryRun=false → error", () => {
    expect(() =>
      parseP76R4bTwentyDBidirectionalRankingAuditCliArgs([
        "--viewerUserId=v1",
        "--candidateUserIds=c1",
        "--dryRun=false",
      ]),
    ).toThrow(/dryRun=true/);
  });

  it("topN defaults to 6", () => {
    expect(
      parseP76R4bTwentyDBidirectionalRankingAuditCliArgs([
        "--viewerUserId=viewer-1",
        "--candidateUserIds=c1,c2",
        "--dryRun=true",
      ]),
    ).toMatchObject({
      topN: 6,
      dryRun: true,
    });
  });

  it("sourcePoolType defaults to onboarding_gated_cohort", () => {
    expect(
      parseP76R4bTwentyDBidirectionalRankingAuditCliArgs([
        "--viewerUserId=viewer-1",
        "--candidateUserIds=c1",
        "--dryRun=true",
      ]),
    ).toMatchObject({
      sourcePoolType: "onboarding_gated_cohort",
    });
  });

  it("candidateUserIds split / trim / dedupe", () => {
    expect(
      parseP76R4bTwentyDBidirectionalRankingAuditCliArgs([
        "--viewerUserId=v",
        "--candidateUserIds= c1 , c2 , c1 ",
        "--dryRun=true",
      ]).candidateUserIds,
    ).toEqual(["c1", "c2"]);
  });

  it("parses explicit topN and stage1SourceVersion", () => {
    expect(
      parseP76R4bTwentyDBidirectionalRankingAuditCliArgs([
        "--viewerUserId=v",
        "--candidateUserIds=c1",
        "--topN=4",
        "--stage1SourceVersion=custom-stage1",
        "--dryRun=true",
      ]),
    ).toMatchObject({
      topN: 4,
      stage1SourceVersion: "custom-stage1",
    });
  });
});
