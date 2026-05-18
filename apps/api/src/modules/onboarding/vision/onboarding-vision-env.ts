/**
 * P7.5-r1: PEIMA_ONBOARDING_VISION_* env reader.
 */

import type { CloudVisionMockScenario } from "./cloud-vision.types";
import type { OnboardingVisionProvider } from "./onboarding-vision.types";

export type OnboardingVisionEnv = {
  enabled: boolean;
  provider: OnboardingVisionProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  cacheTtlMs: number;
  maxTags: number;
  shadowEnabled: boolean;
  cloudVendor: string;
  cloudDryRun: boolean;
  cloudAsync: boolean;
  cloudMaxConcurrency: number;
  cloudMockScenario: CloudVisionMockScenario;
  cloudHttpEnabled: boolean;
  cloudAllowlistImageIds: string[];
  cloudAllowlistUserIds: string[];
  cloudRetry: number;
};

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_CACHE_TTL_MS = 86_400_000;
const DEFAULT_MAX_TAGS = 6;
const DEFAULT_CLOUD_MAX_CONCURRENCY = 4;

function parseBool(v: string | undefined, defaultValue: boolean): boolean {
  if (v === undefined || v.trim() === "") return defaultValue;
  const s = v.trim().toLowerCase();
  if (s === "1" || s === "true" || s === "yes") return true;
  if (s === "0" || s === "false" || s === "no") return false;
  return defaultValue;
}

function parsePositiveInt(
  v: string | undefined,
  defaultValue: number,
): number {
  if (v === undefined || v.trim() === "") return defaultValue;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : defaultValue;
}

function parseCloudMockScenario(
  raw: string | undefined,
): CloudVisionMockScenario {
  const v = (raw ?? "normal").trim().toLowerCase();
  if (v === "empty") return "empty";
  if (v === "invalidtag" || v === "invalid_tag") return "invalidTag";
  if (v === "timeout") return "timeout";
  if (v === "refusal") return "refusal";
  return "normal";
}

function parseCommaSeparatedIds(raw: string | undefined): string[] {
  if (raw === undefined || raw.trim() === "") return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseNonNegativeInt(
  raw: string | undefined,
  defaultValue: number,
): number {
  if (raw === undefined || raw.trim() === "") return defaultValue;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return defaultValue;
  return n;
}

function parseProvider(raw: string | undefined): OnboardingVisionProvider {
  const v = (raw ?? "rules").trim().toLowerCase();
  if (v === "stub") return "stub";
  if (v === "cloud") return "cloud";
  if (v === "zhipu") return "zhipu";
  return "rules";
}

/**
 * Read onboarding vision config from process.env (or override for tests).
 */
export function readOnboardingVisionEnv(
  env: NodeJS.ProcessEnv = process.env,
): OnboardingVisionEnv {
  return {
    enabled: parseBool(env.PEIMA_ONBOARDING_VISION_ENABLED, false),
    provider: parseProvider(env.PEIMA_ONBOARDING_VISION_PROVIDER),
    baseUrl: (env.PEIMA_ONBOARDING_VISION_BASE_URL ?? "").trim(),
    apiKey: (env.PEIMA_ONBOARDING_VISION_API_KEY ?? "").trim(),
    model: (env.PEIMA_ONBOARDING_VISION_MODEL ?? "").trim(),
    timeoutMs: parsePositiveInt(
      env.PEIMA_ONBOARDING_VISION_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
    ),
    cacheTtlMs: parsePositiveInt(
      env.PEIMA_ONBOARDING_VISION_CACHE_TTL_MS,
      DEFAULT_CACHE_TTL_MS,
    ),
    maxTags: parsePositiveInt(
      env.PEIMA_ONBOARDING_VISION_MAX_TAGS,
      DEFAULT_MAX_TAGS,
    ),
    shadowEnabled: parseBool(env.PEIMA_ONBOARDING_VISION_SHADOW_ENABLED, true),
    cloudVendor: (env.PEIMA_ONBOARDING_VISION_CLOUD_VENDOR ?? "mock").trim(),
    cloudDryRun: parseBool(env.PEIMA_ONBOARDING_VISION_CLOUD_DRY_RUN, true),
    cloudAsync: parseBool(env.PEIMA_ONBOARDING_VISION_CLOUD_ASYNC, true),
    cloudMaxConcurrency: parsePositiveInt(
      env.PEIMA_ONBOARDING_VISION_CLOUD_MAX_CONCURRENCY,
      DEFAULT_CLOUD_MAX_CONCURRENCY,
    ),
    cloudMockScenario: parseCloudMockScenario(
      env.PEIMA_ONBOARDING_VISION_CLOUD_MOCK_SCENARIO,
    ),
    cloudHttpEnabled: parseBool(
      env.PEIMA_ONBOARDING_VISION_CLOUD_HTTP_ENABLED,
      false,
    ),
    cloudAllowlistImageIds: parseCommaSeparatedIds(
      env.PEIMA_ONBOARDING_VISION_CLOUD_ALLOWLIST_IMAGE_IDS,
    ),
    cloudAllowlistUserIds: parseCommaSeparatedIds(
      env.PEIMA_ONBOARDING_VISION_CLOUD_ALLOWLIST_USER_IDS,
    ),
    cloudRetry: parseNonNegativeInt(env.PEIMA_ONBOARDING_VISION_CLOUD_RETRY, 0),
  };
}

export function isOnboardingVisionCloudRoutedProvider(
  provider: OnboardingVisionProvider,
): boolean {
  return provider === "cloud" || provider === "zhipu";
}

/**
 * r7-b: cloud/zhipu route to mock/dry-run facade — never real HTTP in this milestone.
 * Kept for backward-compatible import sites; always true (routing decides path).
 */
export function isOnboardingVisionExternalProviderSupported(
  _env: OnboardingVisionEnv,
): boolean {
  return true;
}
