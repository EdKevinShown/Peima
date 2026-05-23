import {
  RRM_ADAPTER_LAYER,
  RRM_ADAPTER_UNAVAILABLE_REASONS,
  RRM_SIGNAL_SUMMARY_SCHEMA_VERSION,
  RRM_SOURCE_VERSION_REGISTRY,
  type RrmAdapterLayer,
  type RrmAdapterUnavailableReason,
  type RrmSignalSummaryBaseV1,
  type RrmSourceVersion,
  isKnownRrmSourceVersion,
} from "../../../src/modules/rrm-shared";

export const RRM_SIGNAL_SUMMARY_BASE_V1_KEYS = [
  "schemaVersion",
  "sourceVersion",
  "layer",
  "mode",
  "fallbackUsed",
  "insufficientData",
  "unavailableReason",
  "generatedAt",
] as const;

export const RRM_CORE_FORMULA_INPUT_V1_KEYS = [
  "schemaVersion",
  "A",
  "C_pred",
  "S",
  "E",
  "F",
  "Q",
  "D_pre",
  "R_pre",
] as const;

export const RRM_CORE_FORMULA_OUTPUT_V1_KEYS = ["schemaVersion", "RFI", "branch"] as const;

const SIGNAL_SUMMARY_MODES = new Set(["signal_summary_only", "core_formula_output", "consumer_readonly"]);

export function isRrmAdapterUnavailableReason(value: unknown): value is RrmAdapterUnavailableReason {
  return (
    typeof value === "string" &&
    (RRM_ADAPTER_UNAVAILABLE_REASONS as readonly string[]).includes(value)
  );
}

export function assertRrmSignalSummaryBaseV1(value: unknown): asserts value is RrmSignalSummaryBaseV1 {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("expected object");
  }
  const o = value as Record<string, unknown>;
  for (const k of RRM_SIGNAL_SUMMARY_BASE_V1_KEYS) {
    if (!(k in o)) throw new Error(`missing key: ${k}`);
  }
  if (o.schemaVersion !== RRM_SIGNAL_SUMMARY_SCHEMA_VERSION) {
    throw new Error("invalid schemaVersion");
  }
  if (typeof o.sourceVersion !== "string" || !isKnownRrmSourceVersion(o.sourceVersion)) {
    throw new Error("invalid sourceVersion");
  }
  const layer = o.layer as RrmAdapterLayer;
  if (layer !== RRM_ADAPTER_LAYER.ADAPTER && layer !== RRM_ADAPTER_LAYER.CONSUMER) {
    throw new Error("signal summary layer must be adapter or consumer");
  }
  if (!SIGNAL_SUMMARY_MODES.has(String(o.mode))) {
    throw new Error("invalid mode");
  }
  if (typeof o.fallbackUsed !== "boolean" || typeof o.insufficientData !== "boolean") {
    throw new Error("invalid fallbackUsed or insufficientData");
  }
  if (o.unavailableReason != null && !isRrmAdapterUnavailableReason(o.unavailableReason)) {
    throw new Error("invalid unavailableReason");
  }
  if (typeof o.generatedAt !== "string" || !o.generatedAt.includes("T")) {
    throw new Error("invalid generatedAt");
  }
}

export function listRegisteredRrmSourceVersions(): RrmSourceVersion[] {
  return Object.keys(RRM_SOURCE_VERSION_REGISTRY) as RrmSourceVersion[];
}
