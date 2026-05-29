import { readOnboardingVisionEnv } from "../src/modules/onboarding/vision/onboarding-vision-env";
import { resolveCloudVisionAdapter } from "../src/modules/onboarding/vision/cloud-vision.adapter-registry";
import type { OnboardingVisionEnv } from "../src/modules/onboarding/vision/onboarding-vision-env";

function baseEnv(
  overrides: Partial<OnboardingVisionEnv> = {},
): OnboardingVisionEnv {
  return {
    ...readOnboardingVisionEnv({} as NodeJS.ProcessEnv),
    enabled: true,
    provider: "cloud",
    cloudDryRun: false,
    cloudHttpEnabled: true,
    cloudVendor: "zhipu",
    apiKey: "secret-key",
    cloudAllowlistImageIds: ["img-allowed"],
    cloudAllowlistUserIds: ["user-allowed"],
    ...overrides,
  };
}

describe("resolveCloudVisionAdapter", () => {
  it("defaults env selects mock", () => {
    const env = readOnboardingVisionEnv({} as NodeJS.ProcessEnv);
    const r = resolveCloudVisionAdapter(env, {});
    expect(r.adapter).toBe("mock");
    expect(r.reason).toBe("vision_disabled");
  });

  it("ENABLED=false selects mock", () => {
    const r = resolveCloudVisionAdapter(baseEnv({ enabled: false }), {});
    expect(r.adapter).toBe("mock");
    expect(r.reason).toBe("vision_disabled");
  });

  it("PROVIDER=rules selects mock", () => {
    const r = resolveCloudVisionAdapter(baseEnv({ provider: "rules" }), {});
    expect(r.adapter).toBe("mock");
    expect(r.reason).toBe("provider_not_cloud");
  });

  it("CLOUD_DRY_RUN=true selects mock", () => {
    const r = resolveCloudVisionAdapter(baseEnv({ cloudDryRun: true }), {});
    expect(r.adapter).toBe("mock");
    expect(r.reason).toBe("cloud_dry_run");
  });

  it("CLOUD_HTTP_ENABLED=false selects mock", () => {
    const r = resolveCloudVisionAdapter(
      baseEnv({ cloudHttpEnabled: false }),
      {},
    );
    expect(r.adapter).toBe("mock");
    expect(r.reason).toBe("cloud_http_disabled");
  });

  it("CLOUD_VENDOR=mock selects mock", () => {
    const r = resolveCloudVisionAdapter(baseEnv({ cloudVendor: "mock" }), {});
    expect(r.adapter).toBe("mock");
    expect(r.reason).toBe("cloud_vendor_mock");
  });

  it("missing API_KEY selects mock", () => {
    const r = resolveCloudVisionAdapter(baseEnv({ apiKey: "" }), {});
    expect(r.adapter).toBe("mock");
    expect(r.reason).toBe("api_key_missing");
  });

  it("empty allowlists select mock", () => {
    const r = resolveCloudVisionAdapter(
      baseEnv({
        cloudAllowlistImageIds: [],
        cloudAllowlistUserIds: [],
      }),
      { imageId: "img-allowed", userId: "user-allowed" },
    );
    expect(r.adapter).toBe("mock");
    expect(r.reason).toBe("allowlist_empty");
  });

  it("allowlist miss selects mock", () => {
    const r = resolveCloudVisionAdapter(baseEnv(), {
      imageId: "img-other",
      userId: "user-other",
    });
    expect(r.adapter).toBe("mock");
    expect(r.reason).toBe("allowlist_miss");
  });

  it("legacy zhipu provider still subject to HTTP gate", () => {
    const r = resolveCloudVisionAdapter(
      baseEnv({ provider: "zhipu", cloudDryRun: true }),
      { imageId: "img-allowed" },
    );
    expect(r.adapter).toBe("mock");
    expect(r.reason).toBe("cloud_dry_run");
  });

  it("imageId allowlist hit with live zhipu vendor returns real-zhipu", () => {
    const r = resolveCloudVisionAdapter(baseEnv(), { imageId: "img-allowed" });
    expect(r.adapter).toBe("real-zhipu");
    expect(r.reason).toBe("live_gate_passed_zhipu");
    expect(r.warnings).toContain("VISION_CLOUD_ADAPTER_ZHIPU");
  });

  it("userId allowlist hit with live env returns real-zhipu", () => {
    const r = resolveCloudVisionAdapter(baseEnv(), { userId: "user-allowed" });
    expect(r.adapter).toBe("real-zhipu");
    expect(r.adapter).not.toBe("mock");
  });

  it("unsupported vendor returns real-disabled", () => {
    const r = resolveCloudVisionAdapter(
      baseEnv({ cloudVendor: "openai" }),
      { imageId: "img-allowed" },
    );
    expect(r.adapter).toBe("real-disabled");
    expect(r.reason).toBe("live_gate_passed_vendor_unsupported");
  });
});
