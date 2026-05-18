import {
  isOnboardingVisionCloudRoutedProvider,
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

  it("parses cloud env defaults with dry-run on", () => {
    process.env = {
      PEIMA_ONBOARDING_VISION_PROVIDER: "cloud",
    };
    const env = readOnboardingVisionEnv();
    expect(env.provider).toBe("cloud");
    expect(env.cloudDryRun).toBe(true);
    expect(env.cloudVendor).toBe("mock");
  });

  it("zhipu routes to cloud path in r7-b", () => {
    const env = readOnboardingVisionEnv({
      PEIMA_ONBOARDING_VISION_PROVIDER: "zhipu",
    } as NodeJS.ProcessEnv);
    expect(env.provider).toBe("zhipu");
    expect(isOnboardingVisionCloudRoutedProvider(env.provider)).toBe(true);
    expect(isOnboardingVisionExternalProviderSupported(env)).toBe(true);
  });
});
