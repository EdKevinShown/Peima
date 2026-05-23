import { calibrationHighQualityContinueLightly, staticContextHighQuality } from "../fixtures/rrm-sim/calibration-fixtures";
import { evaluateRrmSimFromSimulationV2 } from "../../src/modules/ai-simulation-v1/rrm-sim.evaluator";
import {
  RRM_SOURCE_VERSION_SIM,
  getRrmSourceVersionMeta,
  isKnownRrmSourceVersion,
} from "../../src/modules/rrm-shared";

describe("RrmSimResult ↔ rrm-shared registry alignment (M5.1-r3)", () => {
  it("production evaluator sourceVersion is registered as core", () => {
    const out = evaluateRrmSimFromSimulationV2(
      calibrationHighQualityContinueLightly(),
      staticContextHighQuality(),
    );
    expect(out.fallbackUsed).toBe(false);
    expect(out.sourceVersion).toBe(RRM_SOURCE_VERSION_SIM);
    expect(isKnownRrmSourceVersion(out.sourceVersion)).toBe(true);
    const meta = getRrmSourceVersionMeta(out.sourceVersion);
    expect(meta.layer).toBe("core");
    expect(meta.runsCoreFormula).toBe(true);
  });

  it("fallback result still uses registered sim sourceVersion", () => {
    const out = evaluateRrmSimFromSimulationV2({ schemaVersion: "transcript_lite_v1" }, null);
    expect(out.fallbackUsed).toBe(true);
    expect(out.sourceVersion).toBe(RRM_SOURCE_VERSION_SIM);
  });
});
