export function labelRehearsalStatus(status) {
  if (status === "shadow_only") return "shadow_only";
  return status ?? "—";
}

export function labelProductApplyStatus(status) {
  if (status === "not_applied") return "not_applied";
  return status ?? "—";
}

export function labelViolationStatus(status) {
  if (status === "p0_applied_to_match_result") return "P0 appliedToMatchResult";
  if (status === "ok") return "ok";
  return status ?? "—";
}

export function violationTone(status) {
  if (status === "p0_applied_to_match_result") return "p0";
  return "ok";
}

export function eligibleTone(eligible, guardrailReason) {
  if (!eligible) return "blocked";
  if (guardrailReason && guardrailReason !== "ok") return "warning";
  return "ok";
}

export function appliedToMatchResultLabel(applied) {
  return applied === false ? "false (safe)" : String(applied);
}
