/**
 * P7.5-r5-b2: snapshot / restore apply env keys for dev signoff runner (testable).
 */

export const R5_B2_APPLY_ENV_KEYS = [
  "PEIMA_ONBOARDING_VISION_APPLY_TO_POOL",
  "PEIMA_ONBOARDING_VISION_APPLY_ALLOWLIST_USER_IDS",
  "PEIMA_ONBOARDING_VISION_APPLY_PERCENT",
  "PEIMA_ONBOARDING_VISION_APPLY_SOURCE_VERSION",
] as const;

export type R5B2ApplyEnvSnapshot = Partial<
  Record<(typeof R5_B2_APPLY_ENV_KEYS)[number], string | undefined>
>;

export function snapshotApplyEnv(
  env: NodeJS.ProcessEnv = process.env,
): R5B2ApplyEnvSnapshot {
  const out: R5B2ApplyEnvSnapshot = {};
  for (const k of R5_B2_APPLY_ENV_KEYS) {
    out[k] = env[k];
  }
  return out;
}

export function restoreApplyEnv(
  snap: R5B2ApplyEnvSnapshot,
  env: NodeJS.ProcessEnv = process.env,
): void {
  for (const k of R5_B2_APPLY_ENV_KEYS) {
    const v = snap[k];
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
}

export type R5B2CaseEnvSpec = {
  applyToPool: string;
  allowlist?: string;
  /** When false, delete allowlist key from env (empty allowlist). */
  allowlistDefined?: boolean;
  percent?: string;
  percentDefined?: boolean;
};

export function applyR5B2CaseEnv(
  spec: R5B2CaseEnvSpec,
  env: NodeJS.ProcessEnv = process.env,
): void {
  env.PEIMA_ONBOARDING_VISION_APPLY_TO_POOL = spec.applyToPool;
  if (spec.allowlistDefined === false) {
    delete env.PEIMA_ONBOARDING_VISION_APPLY_ALLOWLIST_USER_IDS;
  } else if (spec.allowlist !== undefined) {
    env.PEIMA_ONBOARDING_VISION_APPLY_ALLOWLIST_USER_IDS = spec.allowlist;
  }
  if (spec.percentDefined === false) {
    delete env.PEIMA_ONBOARDING_VISION_APPLY_PERCENT;
  } else if (spec.percent !== undefined) {
    env.PEIMA_ONBOARDING_VISION_APPLY_PERCENT = spec.percent;
  }
}
