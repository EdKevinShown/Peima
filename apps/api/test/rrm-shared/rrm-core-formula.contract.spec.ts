import { computeRfiScenario } from "../../src/modules/ai-simulation-v1/rrm-sim-formula";
import type { RrmCoreFormulaInputV1, RrmCoreFormulaOutputV1 } from "../../src/modules/rrm-shared";
import { RRM_CORE_FORMULA_INPUT_V1_KEYS, RRM_CORE_FORMULA_OUTPUT_V1_KEYS } from "./support/contract";

function toCoreInput(partial: Partial<RrmCoreFormulaInputV1> & Pick<RrmCoreFormulaInputV1, "A" | "C_pred">): RrmCoreFormulaInputV1 {
  return {
    schemaVersion: 1,
    S: 0.7,
    E: 0.75,
    F: 0.8,
    Q: 0.7,
    D_pre: 0.1,
    R_pre: 0.2,
    ...partial,
  };
}

function evaluateCoreOutput(input: RrmCoreFormulaInputV1): RrmCoreFormulaOutputV1 {
  const RFI = computeRfiScenario({
    A: input.A,
    C_pred: input.C_pred,
    S: input.S,
    E: input.E,
    F: input.F,
    Q: input.Q,
    D_pre: input.D_pre,
    R_pre: input.R_pre,
  });
  const over = input.A > input.C_pred;
  const P = over ? 1 + (1 - input.S) + (1 - input.E) + input.R_pre : undefined;
  return {
    schemaVersion: 1,
    RFI,
    branch: over ? "over_capacity" : "within_capacity",
    ...(P !== undefined ? { P } : {}),
  };
}

describe("RrmCoreFormula I/O contract (M5.1-r3)", () => {
  it("input and output key sets are stable", () => {
    expect(RRM_CORE_FORMULA_INPUT_V1_KEYS).toContain("C_pred");
    expect(RRM_CORE_FORMULA_OUTPUT_V1_KEYS).toContain("branch");
  });

  it("within_capacity branch matches computeRfiScenario", () => {
    const input = toCoreInput({ A: 0.2, C_pred: 0.5 });
    const out = evaluateCoreOutput(input);
    expect(out.branch).toBe("within_capacity");
    expect(out.P).toBeUndefined();
    expect(out.RFI).toBeCloseTo(0.7 * 0.75 * 0.2 + 0.8 * 0.7 - 0.1, 5);
  });

  it("over_capacity branch includes penalty P", () => {
    const input = toCoreInput({ A: 0.6, C_pred: 0.3 });
    const out = evaluateCoreOutput(input);
    expect(out.branch).toBe("over_capacity");
    expect(out.P).toBeCloseTo(1 + (1 - input.S) + (1 - input.E) + input.R_pre, 5);
    const expected =
      input.F * input.Q - input.D_pre - (input.A - input.C_pred) * (out.P as number);
    expect(out.RFI).toBeCloseTo(expected, 5);
  });
});
