import type { RrmAdapterUnavailableReason } from "./rrm-adapter-unavailable.types";
import type { RrmAdapterLayer, RrmSourceVersion } from "./rrm-source-version.registry";

export const RRM_SIGNAL_SUMMARY_SCHEMA_VERSION = 1 as const;

export type RrmSignalSummaryMode =
  | "signal_summary_only"
  | "core_formula_output"
  | "consumer_readonly";

/**
 * Base envelope for Layer-2 Signal Adapters (Observed / Assistant / Timeline).
 * Consumers must not treat this as a MatchResult or finalScore input without an explicit milestone.
 */
export type RrmSignalSummaryBaseV1 = {
  schemaVersion: typeof RRM_SIGNAL_SUMMARY_SCHEMA_VERSION;
  sourceVersion: RrmSourceVersion;
  layer: RrmAdapterLayer;
  mode: RrmSignalSummaryMode;
  fallbackUsed: boolean;
  insufficientData: boolean;
  unavailableReason: RrmAdapterUnavailableReason | null;
  generatedAt: string;
};
