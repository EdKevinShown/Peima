/**
 * P7.5-r5-b: PEIMA_ONBOARDING_VISION_APPLY_* env reader (pure; testable).
 * Does not read legacy PEIMA_PREVIEW_VISUAL_ENHANCE_*.
 */

export const DEFAULT_ONBOARDING_VISION_APPLY_SOURCE_VERSION =
  "onboarding-photo-preview-v2-vision" as const;

export type OnboardingVisionApplyEnv = {
  /** True only when PEIMA_ONBOARDING_VISION_APPLY_TO_POOL is exactly "1". */
  applyToPoolEnabled: boolean;
  allowlistUserIds: string[];
  /** 0–100 inclusive; invalid env → 0. */
  applyPercent: number;
  applySourceVersion: string;
};

function parseAllowlist(raw: string | undefined): string[] {
  if (raw === undefined || raw.trim() === "") return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseApplyPercent(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return 0;
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n < 0 || n > 100) return 0;
  return n;
}

/**
 * Read P7.5-r5 apply-to-pool env from process.env (or override for tests).
 */
export function readOnboardingVisionApplyEnv(
  env: NodeJS.ProcessEnv = process.env,
): OnboardingVisionApplyEnv {
  const gate = env.PEIMA_ONBOARDING_VISION_APPLY_TO_POOL;
  const applyToPoolEnabled =
    gate !== undefined && String(gate).trim() === "1";

  const allowlistUserIds = parseAllowlist(
    env.PEIMA_ONBOARDING_VISION_APPLY_ALLOWLIST_USER_IDS,
  );

  const applyPercent = parseApplyPercent(
    env.PEIMA_ONBOARDING_VISION_APPLY_PERCENT,
  );

  const svRaw = env.PEIMA_ONBOARDING_VISION_APPLY_SOURCE_VERSION;
  const trimmed = (svRaw ?? "").trim();
  const applySourceVersion =
    trimmed.length > 0 ? trimmed : DEFAULT_ONBOARDING_VISION_APPLY_SOURCE_VERSION;

  return {
    applyToPoolEnabled,
    allowlistUserIds,
    applyPercent,
    applySourceVersion,
  };
}
