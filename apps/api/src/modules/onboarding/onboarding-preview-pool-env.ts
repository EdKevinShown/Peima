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
  /** When true, skip opposite-gender requirement. */
  relaxGenderGate: boolean;
  /** When true, skip preference hard gate for preview candidates. */
  relaxPreferenceGate: boolean;
  /** Minimum slots required to persist a pool (1–6; default 6). */
  minSlots: number;
};

export function readOnboardingPreviewPoolGateEnv(
  env: NodeJS.ProcessEnv = process.env,
): OnboardingPreviewPoolGateEnv {
  return {
    relaxProfileGate: envFlag(env, "PEIMA_ONBOARDING_PREVIEW_RELAX_PROFILE_GATE"),
    relaxGenderGate: envFlag(env, "PEIMA_ONBOARDING_PREVIEW_RELAX_GENDER_GATE"),
    relaxPreferenceGate: envFlag(
      env,
      "PEIMA_ONBOARDING_PREVIEW_RELAX_PREFERENCE_GATE",
    ),
    minSlots: parseMinSlots(env.PEIMA_ONBOARDING_PREVIEW_MIN_SLOTS),
  };
}
