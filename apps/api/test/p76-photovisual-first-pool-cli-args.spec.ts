import {
  P76R3bCliArgsError,
  parseP76R3bPhotovisualPoolShadowAuditCliArgs,
} from "../src/dev-cli/p76-r3b-photovisual-pool-shadow-audit-cli-args";

describe("p76 photovisual pool shadow audit cli args", () => {
  it("viewerUserId missing → error", () => {
    expect(() =>
      parseP76R3bPhotovisualPoolShadowAuditCliArgs(["--dryRun=true"]),
    ).toThrow(P76R3bCliArgsError);
    expect(() =>
      parseP76R3bPhotovisualPoolShadowAuditCliArgs(["--dryRun=true"]),
    ).toThrow(/--viewerUserId is required/);
  });

  it("sourcePoolType non onboarding_gated_cohort → error", () => {
    expect(() =>
      parseP76R3bPhotovisualPoolShadowAuditCliArgs([
        "--viewerUserId=u1",
        "--sourcePoolType=legacy_preview_pool",
        "--dryRun=true",
      ]),
    ).toThrow(/onboarding_gated_cohort/);
  });

  it("dryRun=false → error", () => {
    expect(() =>
      parseP76R3bPhotovisualPoolShadowAuditCliArgs([
        "--viewerUserId=u1",
        "--dryRun=false",
      ]),
    ).toThrow(/dryRun=true/);
  });

  it("dryRun omitted → error", () => {
    expect(() =>
      parseP76R3bPhotovisualPoolShadowAuditCliArgs(["--viewerUserId=u1"]),
    ).toThrow(/dryRun=true/);
  });

  it("parses defaults for limit and selectionLimit", () => {
    expect(
      parseP76R3bPhotovisualPoolShadowAuditCliArgs([
        "--viewerUserId=viewer-1",
        "--dryRun=true",
      ]),
    ).toEqual({
      viewerUserId: "viewer-1",
      sourcePoolType: "onboarding_gated_cohort",
      limit: 20,
      selectionLimit: 6,
      dryRun: true,
    });
  });

  it("parses explicit limit and selectionLimit", () => {
    expect(
      parseP76R3bPhotovisualPoolShadowAuditCliArgs([
        "--viewerUserId=v",
        "--limit=10",
        "--selectionLimit=3",
        "--dryRun=true",
      ]),
    ).toMatchObject({
      limit: 10,
      selectionLimit: 3,
      dryRun: true,
    });
  });
});
