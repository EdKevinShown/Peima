/**
 * P7.5-r1: PEIMA_ONBOARDING_VISION_* env reader.
 */

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
};

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_CACHE_TTL_MS = 86_400_000;
const DEFAULT_MAX_TAGS = 6;

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

function parseProvider(raw: string | undefined): OnboardingVisionProvider {
  const v = (raw ?? "rules").trim().toLowerCase();
  if (v === "stub") return "stub";
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
  };
}

export function isOnboardingVisionExternalProviderSupported(
  env: OnboardingVisionEnv,
): boolean {
  return env.provider !== "zhipu";
}
