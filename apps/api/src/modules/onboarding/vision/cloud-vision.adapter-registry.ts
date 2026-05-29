/**
 * P7.5-r7-c0/c1: cloud vision adapter selection (mock / real-zhipu / real-disabled).
 */

import type { OnboardingVisionEnv } from "./onboarding-vision-env";
import { isOnboardingVisionCloudRoutedProvider } from "./onboarding-vision-env";

export type CloudVisionAdapterKind = "mock" | "real-zhipu" | "real-disabled";

export type CloudVisionAdapterResolveContext = {
  imageId?: string;
  userId?: string;
  routedFrom?: "cloud" | "zhipu";
};

export type CloudVisionAdapterResolution = {
  adapter: CloudVisionAdapterKind;
  reason: string;
  warnings: string[];
};

function parseIdList(ids: readonly string[]): Set<string> {
  return new Set(ids.map((id) => id.trim()).filter(Boolean));
}

function allowlistHit(
  env: OnboardingVisionEnv,
  context: CloudVisionAdapterResolveContext,
): boolean {
  const imageIds = parseIdList(env.cloudAllowlistImageIds);
  const userIds = parseIdList(env.cloudAllowlistUserIds);
  if (imageIds.size === 0 && userIds.size === 0) {
    return false;
  }
  const imageId = (context.imageId ?? "").trim();
  const userId = (context.userId ?? "").trim();
  if (imageId.length > 0 && imageIds.has(imageId)) {
    return true;
  }
  if (userId.length > 0 && userIds.has(userId)) {
    return true;
  }
  return false;
}

function mockResolution(
  reason: string,
  warnings: string[],
): CloudVisionAdapterResolution {
  return {
    adapter: "mock",
    reason,
    warnings: ["VISION_CLOUD_HTTP_GATE_MOCK", ...warnings],
  };
}

/**
 * Decide mock vs real-zhipu vs real-disabled.
 */
export function resolveCloudVisionAdapter(
  env: OnboardingVisionEnv,
  context: CloudVisionAdapterResolveContext = {},
): CloudVisionAdapterResolution {
  if (!env.enabled) {
    return mockResolution("vision_disabled", ["VISION_CLOUD_GATE_VISION_DISABLED"]);
  }

  if (!isOnboardingVisionCloudRoutedProvider(env.provider)) {
    return mockResolution("provider_not_cloud", [
      "VISION_CLOUD_GATE_PROVIDER_NOT_CLOUD",
    ]);
  }

  if (env.cloudDryRun) {
    return mockResolution("cloud_dry_run", ["VISION_CLOUD_GATE_DRY_RUN"]);
  }

  if (!env.cloudHttpEnabled) {
    return mockResolution("cloud_http_disabled", [
      "VISION_CLOUD_GATE_HTTP_DISABLED",
    ]);
  }

  if (env.cloudVendor.trim().toLowerCase() === "mock") {
    return mockResolution("cloud_vendor_mock", ["VISION_CLOUD_GATE_VENDOR_MOCK"]);
  }

  if (!env.apiKey.trim()) {
    return mockResolution("api_key_missing", ["VISION_CLOUD_GATE_API_KEY_MISSING"]);
  }

  const imageIds = env.cloudAllowlistImageIds;
  const userIds = env.cloudAllowlistUserIds;
  if (imageIds.length === 0 && userIds.length === 0) {
    return mockResolution("allowlist_empty", ["VISION_CLOUD_GATE_ALLOWLIST_EMPTY"]);
  }

  if (!allowlistHit(env, context)) {
    return mockResolution("allowlist_miss", ["VISION_CLOUD_GATE_ALLOWLIST_MISS"]);
  }

  const vendor = env.cloudVendor.trim().toLowerCase();
  if (vendor === "zhipu") {
    return {
      adapter: "real-zhipu",
      reason: "live_gate_passed_zhipu",
      warnings: [
        "VISION_CLOUD_HTTP_GATE_LIVE",
        "VISION_CLOUD_ADAPTER_ZHIPU",
      ],
    };
  }

  return {
    adapter: "real-disabled",
    reason: "live_gate_passed_vendor_unsupported",
    warnings: [
      "VISION_CLOUD_HTTP_GATE_REAL_DISABLED",
      "VISION_CLOUD_VENDOR_UNSUPPORTED",
    ],
  };
}
