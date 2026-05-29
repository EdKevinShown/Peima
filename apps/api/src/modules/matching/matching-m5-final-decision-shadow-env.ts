/**
 * M5.2-M0: env gate for multi-source final decision **shadow contract** only (no shadow engine).
 * Parsed in service layer — not read inside the pure sidecar builder.
 */
export function readM5FinalDecisionShadowEnabled(): boolean {
  const v = process.env.PEIMA_M5_FINAL_DECISION_SHADOW_ENABLED;
  return v === "true" || v === "1" || v === "yes";
}
