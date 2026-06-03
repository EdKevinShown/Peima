/**
 * Onboarding photo preview pool — beta / ops toggles (env only).
 */

const DEFAULT_MIN_SLOTS = 6;

function parseMinSlots(raw: string | undefined): number {
  if (raw == null || raw.trim() === "") {
    return DEFAULT_MIN_SLOTS;
  }
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n < 1 || n > 6) {
    return DEFAULT_MIN_SLOTS;
  }
  return n;
}

function envFlag(env: NodeJS.ProcessEnv, key: string): boolean {
  return String(env[key] ?? "").trim() === "1";
}

export type OnboardingPreviewPoolGateEnv = {
  /** When true, candidates need photos but not `UserProfile` (questionnaire). */
  relaxProfileGate: boolean;
  /** When true, skip opposite-gender requirement (or when viewer gender unset). */
  relaxGenderGate: boolean;
  /** When true, skip preference hard gate for preview candidates. */
  relaxPreferenceGate: boolean;
  /** When true, upsert synthetic local candidates to fill the pool. */
  syntheticFallback: boolean;
  /** Minimum slots required to persist a pool (1–6; default 6). */
  minSlots: number;
};

export function readOnboardingPreviewPoolGateEnv(
  env: NodeJS.ProcessEnv = process.env,
): OnboardingPreviewPoolGateEnv {
  const betaBundle =
    envFlag(env, "PEIMA_ONBOARDING_PREVIEW_RELAX_PROFILE_GATE") ||
    envFlag(env, "PEIMA_ONBOARDING_PREVIEW_BETA_RELAXED");

  return {
    relaxProfileGate:
      betaBundle || envFlag(env, "PEIMA_ONBOARDING_PREVIEW_RELAX_PROFILE_GATE"),
    relaxGenderGate:
      betaBundle || envFlag(env, "PEIMA_ONBOARDING_PREVIEW_RELAX_GENDER_GATE"),
    relaxPreferenceGate:
      betaBundle ||
      envFlag(env, "PEIMA_ONBOARDING_PREVIEW_RELAX_PREFERENCE_GATE"),
    syntheticFallback:
      betaBundle ||
      envFlag(env, "PEIMA_ONBOARDING_PREVIEW_SYNTHETIC_FALLBACK"),
    minSlots: parseMinSlots(env.PEIMA_ONBOARDING_PREVIEW_MIN_SLOTS),
  };
}
