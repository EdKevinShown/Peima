/**
 * Portable Core Formula I/O (M5.1). Math lives in `rrm-sim-formula.computeRfiScenario`.
 * Adapters with stable A/C may map into this shape before calling the shared formula.
 */
export type RrmCoreFormulaBranch = "within_capacity" | "over_capacity";

export type RrmCoreFormulaInputV1 = {
  schemaVersion: 1;
  /** Advancement intensity (bucket-mapped, not LLM-freeform). */
  A: number;
  /** Relationship capacity. */
  C_pred: number;
  S: number;
  E: number;
  F: number;
  Q: number;
  D_pre: number;
  R_pre: number;
};

export type RrmCoreFormulaOutputV1 = {
  schemaVersion: 1;
  RFI: number;
  branch: RrmCoreFormulaBranch;
  /** Penalty coefficient when `branch === "over_capacity"`. */
  P?: number;
};
