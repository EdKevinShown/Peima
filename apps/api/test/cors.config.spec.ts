import {
  DEV_CORS_DEFAULT_ORIGINS,
  assertCorsAllowedOriginsConfigured,
  buildNestCorsOptions,
  parseCorsAllowedOrigins,
} from "../src/common/config/cors.config";

describe("cors.config", () => {
  const corsKey = "PEIMA_CORS_ALLOWED_ORIGINS";
  const nodeEnvKey = "NODE_ENV";
  let prevCors: string | undefined;
  let prevNodeEnv: string | undefined;

  beforeEach(() => {
    prevCors = process.env[corsKey];
    prevNodeEnv = process.env[nodeEnvKey];
  });

  afterEach(() => {
    if (prevCors === undefined) delete process.env[corsKey];
    else process.env[corsKey] = prevCors;
    if (prevNodeEnv === undefined) delete process.env[nodeEnvKey];
    else process.env[nodeEnvKey] = prevNodeEnv;
  });

  it("parseCorsAllowedOrigins splits comma-separated values", () => {
    expect(parseCorsAllowedOrigins(" http://a.test , http://b.test ")).toEqual([
      "http://a.test",
      "http://b.test",
    ]);
  });

  it("development uses localhost defaults when PEIMA_CORS_ALLOWED_ORIGINS is unset", () => {
    process.env.NODE_ENV = "development";
    delete process.env[corsKey];
    expect(assertCorsAllowedOriginsConfigured()).toEqual([...DEV_CORS_DEFAULT_ORIGINS]);
  });

  it("development accepts explicit origins", () => {
    process.env.NODE_ENV = "development";
    process.env[corsKey] = "http://dev.example.com";
    expect(assertCorsAllowedOriginsConfigured()).toEqual(["http://dev.example.com"]);
  });

  it("production throws when PEIMA_CORS_ALLOWED_ORIGINS is missing", () => {
    process.env.NODE_ENV = "production";
    delete process.env[corsKey];
    expect(() => assertCorsAllowedOriginsConfigured()).toThrow(
      /PEIMA_CORS_ALLOWED_ORIGINS is required/,
    );
  });

  it("production throws for wildcard origin", () => {
    process.env.NODE_ENV = "production";
    process.env[corsKey] = "*";
    expect(() => assertCorsAllowedOriginsConfigured()).toThrow(/wildcard/);
  });

  it("production accepts explicit origins", () => {
    process.env.NODE_ENV = "production";
    process.env[corsKey] = "https://app.example.com,https://admin.example.com";
    expect(assertCorsAllowedOriginsConfigured()).toEqual([
      "https://app.example.com",
      "https://admin.example.com",
    ]);
  });

  it("buildNestCorsOptions disables credentials and allows configured origins only", () => {
    process.env.NODE_ENV = "development";
    process.env[corsKey] = "http://localhost:5173";

    const options = buildNestCorsOptions();
    expect(options.credentials).toBe(false);

    const originFn = options.origin as (
      origin: string | undefined,
      callback: (err: Error | null, allow: boolean) => void,
    ) => void;

    const allowed: boolean[] = [];
    originFn("http://localhost:5173", (_err, allow) => {
      allowed.push(allow);
    });
    originFn("http://evil.example.com", (_err, allow) => {
      allowed.push(allow);
    });
    originFn(undefined, (_err, allow) => {
      allowed.push(allow);
    });

    expect(allowed).toEqual([true, false, true]);
  });
});
