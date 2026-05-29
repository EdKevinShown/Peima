import {
  isOnboardingVisionCloudRoutedProvider,
  readOnboardingVisionEnv,
} from "../src/modules/onboarding/vision/onboarding-vision-env";

describe("readOnboardingVisionEnv cloud fields", () => {
  const orig = process.env;

  afterEach(() => {
    process.env = orig;
  });

  it("defaults provider rules with cloud dry-run safety defaults", () => {
    process.env = {};
    const env = readOnboardingVisionEnv();
    expect(env.provider).toBe("rules");
    expect(env.cloudVendor).toBe("mock");
    expect(env.cloudDryRun).toBe(true);
    expect(env.cloudAsync).toBe(true);
    expect(env.cloudMaxConcurrency).toBe(4);
    expect(env.cloudMockScenario).toBe("normal");
    expect(env.cloudHttpEnabled).toBe(false);
    expect(env.cloudAllowlistImageIds).toEqual([]);
    expect(env.cloudAllowlistUserIds).toEqual([]);
    expect(env.cloudRetry).toBe(0);
    expect(env.enabled).toBe(false);
    expect(env.timeoutMs).toBe(8000);
  });

  it("parses HTTP gate and allowlists", () => {
    process.env = {
      PEIMA_ONBOARDING_VISION_CLOUD_HTTP_ENABLED: "1",
      PEIMA_ONBOARDING_VISION_CLOUD_ALLOWLIST_IMAGE_IDS: " img1 , img2 ",
      PEIMA_ONBOARDING_VISION_CLOUD_ALLOWLIST_USER_IDS: "u1",
      PEIMA_ONBOARDING_VISION_CLOUD_RETRY: "2",
    };
    const env = readOnboardingVisionEnv();
    expect(env.cloudHttpEnabled).toBe(true);
    expect(env.cloudAllowlistImageIds).toEqual(["img1", "img2"]);
    expect(env.cloudAllowlistUserIds).toEqual(["u1"]);
    expect(env.cloudRetry).toBe(2);
  });

  it("parses cloud provider and vendor", () => {
    process.env = {
      PEIMA_ONBOARDING_VISION_PROVIDER: "cloud",
      PEIMA_ONBOARDING_VISION_CLOUD_VENDOR: "zhipu",
      PEIMA_ONBOARDING_VISION_CLOUD_DRY_RUN: "1",
      PEIMA_ONBOARDING_VISION_CLOUD_MOCK_SCENARIO: "empty",
    };
    const env = readOnboardingVisionEnv();
    expect(env.provider).toBe("cloud");
    expect(env.cloudVendor).toBe("zhipu");
    expect(env.cloudDryRun).toBe(true);
    expect(env.cloudMockScenario).toBe("empty");
  });

  it("cloud and zhipu are cloud-routed providers", () => {
    expect(isOnboardingVisionCloudRoutedProvider("cloud")).toBe(true);
    expect(isOnboardingVisionCloudRoutedProvider("zhipu")).toBe(true);
    expect(isOnboardingVisionCloudRoutedProvider("rules")).toBe(false);
  });
});
