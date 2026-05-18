/**
 * P7.5-r5-c2: snapshot / restore apply env keys for allowlist writer signoff runner.
 */

export const R5_C2_APPLY_ENV_KEYS = [
  "PEIMA_ONBOARDING_VISION_APPLY_TO_POOL",
  "PEIMA_ONBOARDING_VISION_APPLY_ALLOWLIST_USER_IDS",
  "PEIMA_ONBOARDING_VISION_APPLY_PERCENT",
  "PEIMA_ONBOARDING_VISION_APPLY_SOURCE_VERSION",
] as const;

export type R5C2ApplyEnvSnapshot = Partial<
  Record<(typeof R5_C2_APPLY_ENV_KEYS)[number], string | undefined>
>;

export function snapshotApplyEnv(
  env: NodeJS.ProcessEnv = process.env,
): R5C2ApplyEnvSnapshot {
  const out: R5C2ApplyEnvSnapshot = {};
  for (const k of R5_C2_APPLY_ENV_KEYS) {
    out[k] = env[k];
  }
  return out;
}

export function restoreApplyEnv(
  snap: R5C2ApplyEnvSnapshot,
  env: NodeJS.ProcessEnv = process.env,
): void {
  for (const k of R5_C2_APPLY_ENV_KEYS) {
    const v = snap[k];
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
}

export type R5C2CaseEnvSpec = {
  applyToPool: string;
  allowlist?: string;
  /** When false, delete allowlist key from env (empty allowlist). */
  allowlistDefined?: boolean;
  percent?: string;
  percentDefined?: boolean;
  applySourceVersion?: string;
  applySourceVersionDefined?: boolean;
};

export function applyR5C2CaseEnv(
  spec: R5C2CaseEnvSpec,
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
  if (spec.applySourceVersionDefined === false) {
    delete env.PEIMA_ONBOARDING_VISION_APPLY_SOURCE_VERSION;
  } else if (spec.applySourceVersion !== undefined) {
    env.PEIMA_ONBOARDING_VISION_APPLY_SOURCE_VERSION =
      spec.applySourceVersion;
  }
}
