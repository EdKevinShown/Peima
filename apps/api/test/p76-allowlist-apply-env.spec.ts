import {
  isViewerOnP76Allowlist,
  readP76AllowlistApplyEnv,
} from "../src/modules/matching/p76-allowlist-apply-env";
import { P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION } from "../src/modules/matching/p76-allowlist-apply-meta.types";

describe("readP76AllowlistApplyEnv", () => {
  const keys = [
    "PEIMA_P76_ALLOWLIST_APPLY_ENABLED",
    "PEIMA_P76_ALLOWLIST_APPLY_DRY_RUN",
    "PEIMA_P76_ALLOWLIST_VIEWER_IDS",
    "PEIMA_P76_ALLOWLIST_POOL_SOURCE_VERSION",
    "PEIMA_P76_ALLOWLIST_REQUIRE_PM_SIGNOFF",
    "PEIMA_P76_ALLOWLIST_REQUIRE_OPS_SIGNOFF",
  ] as const;

  const prev: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of keys) {
      prev[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  it("defaults to disabled, dryRun=true, empty allowlist", () => {
    const env = readP76AllowlistApplyEnv();
    expect(env.enabled).toBe(false);
    expect(env.dryRun).toBe(true);
    expect(env.viewerAllowlist).toEqual([]);
    expect(env.poolSourceVersion).toBe(P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION);
    expect(env.requirePmSignoff).toBe(true);
    expect(env.requireOpsSignoff).toBe(true);
  });

  it("parses enabled and viewer allowlist", () => {
    process.env.PEIMA_P76_ALLOWLIST_APPLY_ENABLED = "1";
    process.env.PEIMA_P76_ALLOWLIST_VIEWER_IDS = " v1 , v2 ";
    const env = readP76AllowlistApplyEnv();
    expect(env.enabled).toBe(true);
    expect(env.viewerAllowlist).toEqual(["v1", "v2"]);
    expect(isViewerOnP76Allowlist("v1", env)).toBe(true);
    expect(isViewerOnP76Allowlist("v3", env)).toBe(false);
  });

  it("empty allowlist never matches", () => {
    process.env.PEIMA_P76_ALLOWLIST_APPLY_ENABLED = "true";
    const env = readP76AllowlistApplyEnv();
    expect(isViewerOnP76Allowlist("any", env)).toBe(false);
  });
});
