import {
  DEV_JWT_SECRET_FALLBACK,
  assertJwtSecretConfigured,
  getJwtSecret,
  resetJwtSecretCacheForTests,
} from "../src/common/config/jwt-secret.config";

const STRONG_SECRET =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("jwt-secret.config", () => {
  const jwtKey = "JWT_SECRET";
  const nodeEnvKey = "NODE_ENV";
  let prevJwt: string | undefined;
  let prevNodeEnv: string | undefined;

  beforeEach(() => {
    prevJwt = process.env[jwtKey];
    prevNodeEnv = process.env[nodeEnvKey];
    resetJwtSecretCacheForTests();
  });

  afterEach(() => {
    resetJwtSecretCacheForTests();
    if (prevJwt === undefined) delete process.env[jwtKey];
    else process.env[jwtKey] = prevJwt;
    if (prevNodeEnv === undefined) delete process.env[nodeEnvKey];
    else process.env[nodeEnvKey] = prevNodeEnv;
  });

  it("production throws when JWT_SECRET is missing", () => {
    process.env.NODE_ENV = "production";
    delete process.env.JWT_SECRET;
    expect(() => assertJwtSecretConfigured()).toThrow(/JWT_SECRET is required/);
  });

  it("production throws when JWT_SECRET is too short", () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "short";
    expect(() => assertJwtSecretConfigured()).toThrow(/at least 32 characters/);
  });

  it("production throws for change-me-in-production", () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "change-me-in-production";
    expect(() => assertJwtSecretConfigured()).toThrow(/insecure placeholder/);
  });

  it("production accepts a strong secret", () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = STRONG_SECRET;
    expect(assertJwtSecretConfigured()).toBe(STRONG_SECRET);
  });

  it("development uses dev fallback when JWT_SECRET is unset", () => {
    process.env.NODE_ENV = "development";
    delete process.env.JWT_SECRET;
    expect(assertJwtSecretConfigured()).toBe(DEV_JWT_SECRET_FALLBACK);
  });

  it("test uses dev fallback when JWT_SECRET is unset", () => {
    process.env.NODE_ENV = "test";
    delete process.env.JWT_SECRET;
    expect(assertJwtSecretConfigured()).toBe(DEV_JWT_SECRET_FALLBACK);
  });

  it("development rejects change-me-in-production placeholder", () => {
    process.env.NODE_ENV = "development";
    process.env.JWT_SECRET = "change-me-in-production";
    expect(() => assertJwtSecretConfigured()).toThrow(/insecure placeholder/);
  });

  it("development accepts explicit custom secret", () => {
    process.env.NODE_ENV = "development";
    process.env.JWT_SECRET = "local-dev-custom-secret-value";
    expect(assertJwtSecretConfigured()).toBe("local-dev-custom-secret-value");
  });

  it("getJwtSecret caches resolved value", () => {
    process.env.NODE_ENV = "development";
    process.env.JWT_SECRET = "cached-secret-for-jwt-config-test";
    expect(getJwtSecret()).toBe("cached-secret-for-jwt-config-test");
    process.env.JWT_SECRET = "mutated-should-not-change-cache";
    expect(getJwtSecret()).toBe("cached-secret-for-jwt-config-test");
  });
});
