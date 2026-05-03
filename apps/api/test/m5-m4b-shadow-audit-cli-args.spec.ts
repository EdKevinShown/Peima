import {
  M5_M4B_DEFAULT_LIMIT,
  M5_M4B_MAX_LIMIT,
  parseM5M4bShadowAuditCliArgs,
} from "../src/dev-cli/m5-m4b-shadow-audit-cli-args";

describe("parseM5M4bShadowAuditCliArgs (M5.2-M4B)", () => {
  it("defaults limit 20 and pretty false", () => {
    expect(parseM5M4bShadowAuditCliArgs([])).toEqual({ limit: M5_M4B_DEFAULT_LIMIT, pretty: false });
  });

  it("parses --limit and --pretty", () => {
    expect(parseM5M4bShadowAuditCliArgs(["--limit", "40", "--pretty"])).toEqual({
      limit: 40,
      pretty: true,
    });
    expect(parseM5M4bShadowAuditCliArgs(["--limit=7"])).toEqual({ limit: 7, pretty: false });
  });

  it("clamps limit to max 100", () => {
    expect(parseM5M4bShadowAuditCliArgs(["--limit=5000"]).limit).toBe(M5_M4B_MAX_LIMIT);
  });
});
