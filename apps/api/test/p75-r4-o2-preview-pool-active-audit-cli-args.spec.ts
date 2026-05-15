import { parseP75R4O2PreviewPoolActiveAuditCliArgs } from "../src/dev-cli/p75-r4-o2-preview-pool-active-audit-cli-args";

describe("p75-r4-o2-preview-pool-active-audit-cli-args", () => {
  it("parses viewerUserId and optional mappingPath", () => {
    expect(
      parseP75R4O2PreviewPoolActiveAuditCliArgs([
        "--viewerUserId=u1",
        "--mappingPath=/tmp/m.json",
      ]),
    ).toEqual({ viewerUserId: "u1", mappingPath: "/tmp/m.json" });
  });

  it("supports spaced viewer flag", () => {
    expect(
      parseP75R4O2PreviewPoolActiveAuditCliArgs(["-v", "abc"]),
    ).toEqual({ viewerUserId: "abc", mappingPath: null });
  });
});
