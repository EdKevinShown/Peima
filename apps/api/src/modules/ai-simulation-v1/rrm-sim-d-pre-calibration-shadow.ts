/**
 * M1.3-M12 — D_pre static lift cap v1 **shadow-only** diagnostics.
 * Does not change production `evaluateRrmSimFromSimulationV2`, `extractDPre` defaults, or persisted `rrmSimResult`.
 *
 * Env (optional; defaults keep shadow off):
 * - `RRM_D_PRE_CALIBRATION_ENABLED` — `1` / `true` / `yes` to allow shadow consumers to attach payloads.
 * - `RRM_D_PRE_CALIBRATION_MODE` — `shadow` (default when enabled); `enabled` reserved for future sidecar-only paths (still not MatchResult).
 * - `RRM_D_PRE_STATIC_LIFT_CAP` — float, default **0.25**.
 * - `RRM_D_PRE_CALIBRATION_VERSION` — string, default **`m1.3-d-pre-static-lift-cap-v1`**.
 */
import { RRM_SIM_RESPECT_R_PRE_GATE } from "./rrm-sim.constants";
import type { RrmSimResult } from "./rrm-sim.types";
import { transcriptOnlyDPre, whatIfDPreStaticCapProxy } from "./rrm-sim-calibration-whatif";

export const D_PRE_CALIBRATION_SHADOW_SCHEMA_VERSION = 1 as const;
export const D_PRE_STATIC_LIFT_CAP_SHADOW_SOURCE_VERSION = "m1.3-d-pre-static-lift-cap-v1" as const;

function truthyEnv(v: string | undefined): boolean {
  const s = v?.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

export type DPreCalibrationEnv = {
  enabled: boolean;
  mode: "shadow" | "enabled";
  staticLiftCap: number;
  calibrationVersion: string;
};

export function readDPreCalibrationEnvFromProcess(
  env: NodeJS.ProcessEnv = process.env,
): DPreCalibrationEnv {
  const enabled = truthyEnv(env.RRM_D_PRE_CALIBRATION_ENABLED);
  const modeRaw = (env.RRM_D_PRE_CALIBRATION_MODE ?? "shadow").trim().toLowerCase();
  const mode = modeRaw === "enabled" ? "enabled" : "shadow";
  const capRaw = parseFloat((env.RRM_D_PRE_STATIC_LIFT_CAP ?? "0.25").trim());
  const staticLiftCap = Number.isFinite(capRaw) && capRaw > 0 ? capRaw : 0.25;
  const calibrationVersion =
    (env.RRM_D_PRE_CALIBRATION_VERSION ?? D_PRE_STATIC_LIFT_CAP_SHADOW_SOURCE_VERSION).trim() ||
    D_PRE_STATIC_LIFT_CAP_SHADOW_SOURCE_VERSION;
  return { enabled, mode, staticLiftCap, calibrationVersion };
}

export type DPreCalibrationShadowRecommendation = {
  suggestedAction: RrmSimResult["suggestedAction"];
  progressionWindow: RrmSimResult["progressionWindow"];
};

/** Per-candidate shadow payload (admin/dev/tools only; never viewer-facing). */
export type DPreStaticLiftCapShadowV1 = {
  schemaVersion: typeof D_PRE_CALIBRATION_SHADOW_SCHEMA_VERSION;
  sourceVersion: typeof D_PRE_STATIC_LIFT_CAP_SHADOW_SOURCE_VERSION;
  mode: "shadow";
  appliedToFinalScore: false;
  appliedToWorkerRanking: false;
  currentDPre: number;
  calibratedDPre: number;
  transcriptOnlyDPre: number;
  staticLiftBefore: number;
  staticLiftAfter: number;
  currentRhythmScore: number;
  calibratedRhythmScore: number;
  currentRecommendation: DPreCalibrationShadowRecommendation;
  calibratedRecommendation: DPreCalibrationShadowRecommendation;
  respectGateApplied: boolean;
  /** True when respect gate forces rhythm cap (R_pre ≥ gate). */
  safetyOverrideApplied: boolean;
  calibrationVersion: string;
  calibrationMode: DPreCalibrationEnv["mode"];
};

export type BuildDPreStaticLiftCapShadowInput = {
  transcriptLite: unknown;
  rrmSimResult: RrmSimResult;
  /** Overrides `RRM_D_PRE_STATIC_LIFT_CAP` for tests. */
  staticLiftCap?: number;
  calibrationVersion?: string;
  calibrationMode?: DPreCalibrationEnv["mode"];
};

/**
 * Builds M1.3-M12 shadow comparison for one succeeded, non-fallback `rrmSimResult` row.
 * Returns **null** when transcript-only D_pre cannot be computed or what-if cannot run.
 */
export function buildDPreStaticLiftCapShadowResult(
  input: BuildDPreStaticLiftCapShadowInput,
): DPreStaticLiftCapShadowV1 | null {
  const { transcriptLite, rrmSimResult: rr } = input;
  if (!rr || rr.fallbackUsed) return null;

  const env = readDPreCalibrationEnvFromProcess();
  const cap = input.staticLiftCap ?? env.staticLiftCap;
  const calibrationVersion = input.calibrationVersion ?? env.calibrationVersion;
  const calibrationMode = input.calibrationMode ?? env.mode;

  const D_tx = transcriptOnlyDPre(transcriptLite);
  if (D_tx == null) return null;

  const wi = whatIfDPreStaticCapProxy(rr, transcriptLite, cap);
  if (!wi) return null;

  const D_admin = rr.scores.D_pre;
  const staticLiftBefore = Math.max(0, D_admin - D_tx);
  const staticLiftAfter = wi.cappedLift ?? Math.min(staticLiftBefore, cap);

  const respectGateApplied = rr.scores.R_pre >= RRM_SIM_RESPECT_R_PRE_GATE;
  const safetyOverrideApplied = respectGateApplied;

  const calibratedDPre = wi.dPreAfter!;

  return {
    schemaVersion: D_PRE_CALIBRATION_SHADOW_SCHEMA_VERSION,
    sourceVersion: D_PRE_STATIC_LIFT_CAP_SHADOW_SOURCE_VERSION,
    mode: "shadow",
    appliedToFinalScore: false,
    appliedToWorkerRanking: false,
    currentDPre: D_admin,
    calibratedDPre,
    transcriptOnlyDPre: D_tx,
    staticLiftBefore,
    staticLiftAfter,
    currentRhythmScore: rr.scores.simulatedRhythmScore,
    calibratedRhythmScore: wi.simulatedRhythmScore,
    currentRecommendation: {
      suggestedAction: rr.suggestedAction,
      progressionWindow: rr.progressionWindow,
    },
    calibratedRecommendation: {
      suggestedAction: wi.suggestedAction ?? rr.suggestedAction,
      progressionWindow: wi.progressionWindow ?? rr.progressionWindow,
    },
    respectGateApplied,
    safetyOverrideApplied,
    calibrationVersion,
    calibrationMode,
  };
}
