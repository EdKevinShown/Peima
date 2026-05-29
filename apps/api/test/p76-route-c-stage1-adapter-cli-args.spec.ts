import {
  P76R7g2CliArgsError,
  parseP76R7g2RouteCStage1AdapterAuditCliArgs,
} from "../src/dev-cli/p76-r7g2-route-c-stage1-adapter-audit-cli-args";
import {
  P76_ROUTE_C_DEFAULT_POOL_SOURCE_VERSION,
  P76_ROUTE_C_SOURCE_POOL_TYPE,
} from "../src/modules/onboarding/vision/p76-route-c-stage1-adapter.types";

describe("p76 route c stage1 adapter cli args", () => {
  it("viewerUserId missing → error", () => {
    expect(() =>
      parseP76R7g2RouteCStage1AdapterAuditCliArgs(["--dryRun=true"]),
    ).toThrow(P76R7g2CliArgsError);
    expect(() =>
      parseP76R7g2RouteCStage1AdapterAuditCliArgs(["--dryRun=true"]),
    ).toThrow(/--viewerUserId is required/);
  });

  it("sourcePoolType not route_c_clean_pool → error", () => {
    expect(() =>
      parseP76R7g2RouteCStage1AdapterAuditCliArgs([
        "--viewerUserId=u1",
        "--sourcePoolType=onboarding_gated_cohort",
        "--dryRun=true",
      ]),
    ).toThrow(/route_c_clean_pool/);
  });

  it("dryRun=false → error", () => {
    expect(() =>
      parseP76R7g2RouteCStage1AdapterAuditCliArgs([
        "--viewerUserId=u1",
        "--dryRun=false",
      ]),
    ).toThrow(/dryRun=true/);
  });

  it("dryRun omitted → error", () => {
    expect(() =>
      parseP76R7g2RouteCStage1AdapterAuditCliArgs(["--viewerUserId=u1"]),
    ).toThrow(/dryRun=true/);
  });

  it("parses defaults", () => {
    expect(
      parseP76R7g2RouteCStage1AdapterAuditCliArgs([
        "--viewerUserId=viewer-1",
        "--dryRun=true",
      ]),
    ).toEqual({
      viewerUserId: "viewer-1",
      sourcePoolType: P76_ROUTE_C_SOURCE_POOL_TYPE,
      poolSourceVersion: P76_ROUTE_C_DEFAULT_POOL_SOURCE_VERSION,
      selectionLimit: 6,
      dryRun: true,
    });
  });

  it("parses explicit poolSourceVersion and selectionLimit", () => {
    expect(
      parseP76R7g2RouteCStage1AdapterAuditCliArgs([
        "--viewerUserId=v",
        "--poolSourceVersion=p7.6-r7j3-staging-cohort-v1",
        "--selectionLimit=3",
        "--dryRun=true",
      ]),
    ).toMatchObject({
      poolSourceVersion: "p7.6-r7j3-staging-cohort-v1",
      selectionLimit: 3,
      dryRun: true,
    });
  });
});
