import {
  assertExactlyTwoTop2Ids,
  P76R5bCliArgsError,
  parseP76R5bRrmTop2FinalSelectorAuditCliArgs,
  parseTop2CandidateIdsCsv,
} from "../src/dev-cli/p76-r5b-rrm-top2-final-selector-audit-cli-args";

describe("p76 rrm top2 final selector audit cli args", () => {
  it("viewerUserId missing → error", () => {
    expect(() =>
      parseP76R5bRrmTop2FinalSelectorAuditCliArgs([
        "--top2CandidateIds=a,b",
        "--selectedBy20DOnlyCandidateId=a",
        "--dryRun=true",
      ]),
    ).toThrow(P76R5bCliArgsError);
    expect(() =>
      parseP76R5bRrmTop2FinalSelectorAuditCliArgs([
        "--top2CandidateIds=a,b",
        "--selectedBy20DOnlyCandidateId=a",
        "--dryRun=true",
      ]),
    ).toThrow(/--viewerUserId is required/);
  });

  it("top2CandidateIds missing → error", () => {
    expect(() =>
      parseP76R5bRrmTop2FinalSelectorAuditCliArgs([
        "--viewerUserId=v1",
        "--selectedBy20DOnlyCandidateId=a",
        "--dryRun=true",
      ]),
    ).toThrow(/--top2CandidateIds is required/);
  });

  it("top2CandidateIds not exactly 2 → error", () => {
    expect(() =>
      parseP76R5bRrmTop2FinalSelectorAuditCliArgs([
        "--viewerUserId=v1",
        "--top2CandidateIds=a",
        "--selectedBy20DOnlyCandidateId=a",
        "--dryRun=true",
      ]),
    ).toThrow(/exactly 2/);
    expect(() =>
      parseP76R5bRrmTop2FinalSelectorAuditCliArgs([
        "--viewerUserId=v1",
        "--top2CandidateIds=a,b,c",
        "--selectedBy20DOnlyCandidateId=a",
        "--dryRun=true",
      ]),
    ).toThrow(/exactly 2/);
  });

  it("selectedBy20DOnlyCandidateId missing → error", () => {
    expect(() =>
      parseP76R5bRrmTop2FinalSelectorAuditCliArgs([
        "--viewerUserId=v1",
        "--top2CandidateIds=a,b",
        "--dryRun=true",
      ]),
    ).toThrow(/--selectedBy20DOnlyCandidateId is required/);
  });

  it("dryRun=false → error", () => {
    expect(() =>
      parseP76R5bRrmTop2FinalSelectorAuditCliArgs([
        "--viewerUserId=v1",
        "--top2CandidateIds=a,b",
        "--selectedBy20DOnlyCandidateId=a",
        "--dryRun=false",
      ]),
    ).toThrow(/dryRun=true/);
  });

  it("sourcePoolType defaults to onboarding_gated_cohort", () => {
    expect(
      parseP76R5bRrmTop2FinalSelectorAuditCliArgs([
        "--viewerUserId=viewer-1",
        "--top2CandidateIds=c1,c2",
        "--selectedBy20DOnlyCandidateId=c1",
        "--dryRun=true",
      ]).sourcePoolType,
    ).toBe("onboarding_gated_cohort");
  });

  it("top2CandidateIds split / trim / dedupe", () => {
    expect(
      parseP76R5bRrmTop2FinalSelectorAuditCliArgs([
        "--viewerUserId=v",
        "--top2CandidateIds= c1 , c2 , c1 ",
        "--selectedBy20DOnlyCandidateId=c1",
        "--dryRun=true",
      ]).top2CandidateIds,
    ).toEqual(["c1", "c2"]);
  });

  it("assertExactlyTwoTop2Ids after dedupe", () => {
    expect(() => assertExactlyTwoTop2Ids(parseTop2CandidateIdsCsv("a"))).toThrow(
      /exactly 2/,
    );
    expect(assertExactlyTwoTop2Ids(["x", "y"])).toEqual(["x", "y"]);
  });
});
