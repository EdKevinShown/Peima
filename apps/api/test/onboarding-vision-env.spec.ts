import {
  isOnboardingVisionExternalProviderSupported,
  readOnboardingVisionEnv,
} from "../src/modules/onboarding/vision/onboarding-vision-env";

describe("readOnboardingVisionEnv", () => {
  const orig = process.env;

  afterEach(() => {
    process.env = orig;
  });

  it("defaults to disabled rules provider", () => {
    process.env = {};
    const env = readOnboardingVisionEnv();
    expect(env.enabled).toBe(false);
    expect(env.provider).toBe("rules");
    expect(env.timeoutMs).toBe(8000);
    expect(env.cacheTtlMs).toBe(86400000);
    expect(env.maxTags).toBe(6);
    expect(env.shadowEnabled).toBe(true);
  });

  it("parses enabled and stub provider", () => {
    process.env = {
      PEIMA_ONBOARDING_VISION_ENABLED: "1",
      PEIMA_ONBOARDING_VISION_PROVIDER: "stub",
      PEIMA_ONBOARDING_VISION_MAX_TAGS: "4",
    };
    const env = readOnboardingVisionEnv();
    expect(env.enabled).toBe(true);
    expect(env.provider).toBe("stub");
    expect(env.maxTags).toBe(4);
  });

  it("invalid provider string falls back to rules", () => {
    process.env = {
      PEIMA_ONBOARDING_VISION_PROVIDER: "unknown",
    };
    expect(readOnboardingVisionEnv().provider).toBe("rules");
  });

  it("zhipu is not externally supported in r1", () => {
    const env = readOnboardingVisionEnv({
      PEIMA_ONBOARDING_VISION_PROVIDER: "zhipu",
    } as NodeJS.ProcessEnv);
    expect(env.provider).toBe("zhipu");
    expect(isOnboardingVisionExternalProviderSupported(env)).toBe(false);
  });
});
