import {
  readP76ReadPathEnv,
  resolveP76ReadPathSafeFallback,
} from "../src/modules/matching/p76-read-path-env";

describe("p76-read-path-env safe fallback alias (P7.10-r2b / r2c)", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  function clearFallbackEnv() {
    delete process.env.PEIMA_P76_READ_PATH_SAFE_FALLBACK;
    delete process.env.PEIMA_P76_READ_PATH_FALLBACK_LEGACY;
  }

  it("both unset → safe fallback enabled (legacy default true)", () => {
    clearFallbackEnv();
    const resolved = resolveP76ReadPathSafeFallback(process.env);
    expect(resolved.safeFallbackEnabled).toBe(true);
    expect(resolved.deprecatedAliasUsed).toBe(false);
    const env = readP76ReadPathEnv(process.env);
    expect(env.safeFallbackEnabled).toBe(true);
    expect(env.fallbackLegacy).toBe(true);
    expect(env.deprecatedAliasUsed).toBe(false);
  });

  it("PEIMA_P76_READ_PATH_SAFE_FALLBACK=1 → enabled, no deprecated alias", () => {
    clearFallbackEnv();
    process.env.PEIMA_P76_READ_PATH_SAFE_FALLBACK = "1";
    const resolved = resolveP76ReadPathSafeFallback(process.env);
    expect(resolved.safeFallbackEnabled).toBe(true);
    expect(resolved.deprecatedAliasUsed).toBe(false);
    expect(readP76ReadPathEnv(process.env).safeFallbackEnabled).toBe(true);
  });

  it("PEIMA_P76_READ_PATH_FALLBACK_LEGACY=1 → enabled via deprecated alias", () => {
    clearFallbackEnv();
    process.env.PEIMA_P76_READ_PATH_FALLBACK_LEGACY = "1";
    const resolved = resolveP76ReadPathSafeFallback(process.env);
    expect(resolved.safeFallbackEnabled).toBe(true);
    expect(resolved.deprecatedAliasUsed).toBe(true);
    expect(readP76ReadPathEnv(process.env).deprecatedAliasUsed).toBe(true);
  });

  it("both set → SAFE_FALLBACK wins (0 disables despite legacy=1)", () => {
    clearFallbackEnv();
    process.env.PEIMA_P76_READ_PATH_SAFE_FALLBACK = "0";
    process.env.PEIMA_P76_READ_PATH_FALLBACK_LEGACY = "1";
    const resolved = resolveP76ReadPathSafeFallback(process.env);
    expect(resolved.safeFallbackEnabled).toBe(false);
    expect(resolved.deprecatedAliasUsed).toBe(false);
    const env = readP76ReadPathEnv(process.env);
    expect(env.safeFallbackEnabled).toBe(false);
    expect(env.fallbackLegacy).toBe(false);
  });

  it("both set → SAFE_FALLBACK=1 wins over legacy=0", () => {
    clearFallbackEnv();
    process.env.PEIMA_P76_READ_PATH_SAFE_FALLBACK = "1";
    process.env.PEIMA_P76_READ_PATH_FALLBACK_LEGACY = "0";
    expect(resolveP76ReadPathSafeFallback(process.env).safeFallbackEnabled).toBe(
      true,
    );
    expect(
      resolveP76ReadPathSafeFallback(process.env).deprecatedAliasUsed,
    ).toBe(false);
  });

  it("legacy only =0 → disabled via deprecated alias", () => {
    clearFallbackEnv();
    process.env.PEIMA_P76_READ_PATH_FALLBACK_LEGACY = "0";
    expect(resolveP76ReadPathSafeFallback(process.env).safeFallbackEnabled).toBe(
      false,
    );
    expect(resolveP76ReadPathSafeFallback(process.env).deprecatedAliasUsed).toBe(
      true,
    );
  });
});
