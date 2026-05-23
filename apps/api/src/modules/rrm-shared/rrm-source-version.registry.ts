/**
 * Canonical RRM `sourceVersion` registry (M5.1 commit 2).
 * New adapters must register here — do not reuse `rrm-sim-v1` for non-Sim outputs.
 */

export const RRM_ADAPTER_LAYER = {
  CORE: "core",
  ADAPTER: "adapter",
  CONSUMER: "consumer",
} as const;

export type RrmAdapterLayer = (typeof RRM_ADAPTER_LAYER)[keyof typeof RRM_ADAPTER_LAYER];

export type RrmSourceVersionMeta = {
  layer: RrmAdapterLayer;
  module: string;
  /** Whether this version may emit a full segmented RFI (Core Formula). */
  runsCoreFormula: boolean;
  description: string;
};

export const RRM_SOURCE_VERSION_REGISTRY = {
  "rrm-sim-v1": {
    layer: RRM_ADAPTER_LAYER.CORE,
    module: "rrm-sim",
    runsCoreFormula: true,
    description: "RRM-Sim read-time evaluator (`evaluateRrmSimFromSimulationV2`).",
  },
  "rrm-observed-v1": {
    layer: RRM_ADAPTER_LAYER.ADAPTER,
    module: "rrm-observed",
    runsCoreFormula: false,
    description: "Observed chat signals; v1 signal summary only (no RFI_obs until advancement events).",
  },
  "rrm-assistant-v1": {
    layer: RRM_ADAPTER_LAYER.ADAPTER,
    module: "rrm-assistant",
    runsCoreFormula: false,
    description: "Assistant suggestions; ActionFit only when draft contains advancement.",
  },
  "rrm-timeline-v1": {
    layer: RRM_ADAPTER_LAYER.ADAPTER,
    module: "rrm-timeline",
    runsCoreFormula: false,
    description: "Timeline trend signals; window RFI_t only on advancement windows.",
  },
  "rrm-eval-v1": {
    layer: RRM_ADAPTER_LAYER.CONSUMER,
    module: "rrm-eval",
    runsCoreFormula: false,
    description: "De-identified aggregate eval metrics (Outcome ~ signals).",
  },
  "m4.0-readonly-rrm-ranking-proposal-v1": {
    layer: RRM_ADAPTER_LAYER.CONSUMER,
    module: "m4.0-rrm-ranking-proposal",
    runsCoreFormula: false,
    description: "Read-only RRM ranking proposal derived from Sim diagnostics.",
  },
  "rrm-lite-pairwise-decision-v1": {
    layer: RRM_ADAPTER_LAYER.ADAPTER,
    module: "pairwise",
    runsCoreFormula: false,
    description: "Pairwise comparator (RRM-lite); not RRM-Sim Core output.",
  },
} as const satisfies Record<string, RrmSourceVersionMeta>;

export type RrmSourceVersion = keyof typeof RRM_SOURCE_VERSION_REGISTRY;

export const RRM_SOURCE_VERSION_SIM = "rrm-sim-v1" as const satisfies RrmSourceVersion;

/** Alias used across RRM-Sim evaluator and matching read paths. */
export const RRM_SIM_SOURCE_VERSION = RRM_SOURCE_VERSION_SIM;

export const RRM_SOURCE_VERSION_OBSERVED = "rrm-observed-v1" as const satisfies RrmSourceVersion;

export const RRM_SOURCE_VERSION_ASSISTANT = "rrm-assistant-v1" as const satisfies RrmSourceVersion;

export const RRM_SOURCE_VERSION_TIMELINE = "rrm-timeline-v1" as const satisfies RrmSourceVersion;

export const RRM_SOURCE_VERSION_EVAL = "rrm-eval-v1" as const satisfies RrmSourceVersion;

export const RRM_SOURCE_VERSION_RANKING_PROPOSAL =
  "m4.0-readonly-rrm-ranking-proposal-v1" as const satisfies RrmSourceVersion;

const REGISTRY_KEYS = new Set<string>(Object.keys(RRM_SOURCE_VERSION_REGISTRY));

export function isKnownRrmSourceVersion(value: string): value is RrmSourceVersion {
  return REGISTRY_KEYS.has(value);
}

export function getRrmSourceVersionMeta(version: RrmSourceVersion): RrmSourceVersionMeta {
  return RRM_SOURCE_VERSION_REGISTRY[version];
}

/** Adapters must not alias Core Sim version (M5.0 / M5.1). */
export function assertAdapterSourceVersionNotCoreSim(version: RrmSourceVersion): void {
  if (version === RRM_SOURCE_VERSION_SIM) {
    throw new Error("adapter must not use rrm-sim-v1 sourceVersion");
  }
  const meta = getRrmSourceVersionMeta(version);
  if (meta.layer === RRM_ADAPTER_LAYER.CORE) {
    throw new Error(`adapter must not use core layer sourceVersion: ${version}`);
  }
}
