import {
  calibrationHighStaticRiskGoodChat,
  calibrationPressureBoundaryRisk,
  staticContextHighStaticRisk,
} from "./fixtures/rrm-sim/calibration-fixtures";
import { evaluateRrmSimFromSimulationV2 } from "../src/modules/ai-simulation-v1/rrm-sim.evaluator";
import { RRM_SIM_RESPECT_R_PRE_GATE } from "../src/modules/ai-simulation-v1/rrm-sim.constants";
import {
  buildDPreStaticLiftCapShadowResult,
  readDPreCalibrationEnvFromProcess,
} from "../src/modules/ai-simulation-v1/rrm-sim-d-pre-calibration-shadow";
import { transcriptOnlyDPre } from "../src/modules/ai-simulation-v1/rrm-sim-calibration-whatif";

describe("rrm-sim-d-pre-calibration-shadow (M1.3-M12)", () => {
  it("readDPreCalibrationEnvFromProcess defaults: disabled, shadow, cap 0.25", () => {
    const e = readDPreCalibrationEnvFromProcess({
      RRM_D_PRE_CALIBRATION_ENABLED: undefined,
      RRM_D_PRE_CALIBRATION_MODE: undefined,
      RRM_D_PRE_STATIC_LIFT_CAP: undefined,
      RRM_D_PRE_CALIBRATION_VERSION: undefined,
    } as NodeJS.ProcessEnv);
    expect(e.enabled).toBe(false);
    expect(e.mode).toBe("shadow");
    expect(e.staticLiftCap).toBeCloseTo(0.25, 5);
    expect(e.calibrationVersion).toContain("m1.3-d-pre-static-lift-cap-v1");
  });

  it("buildDPreStaticLiftCapShadowResult: calibratedDPre >= transcriptOnlyDPre and cap reduces lift", () => {
    const p = calibrationHighStaticRiskGoodChat();
    const rr = evaluateRrmSimFromSimulationV2(p, staticContextHighStaticRisk());
    expect(rr.fallbackUsed).toBe(false);
    const D_tx = transcriptOnlyDPre(p)!;
    const sh = buildDPreStaticLiftCapShadowResult({
      transcriptLite: p,
      rrmSimResult: rr,
      staticLiftCap: 0.25,
      calibrationVersion: "test",
      calibrationMode: "shadow",
    });
    expect(sh).not.toBeNull();
    expect(sh!.appliedToFinalScore).toBe(false);
    expect(sh!.appliedToWorkerRanking).toBe(false);
    expect(sh!.transcriptOnlyDPre).toBeCloseTo(D_tx, 5);
    expect(sh!.calibratedDPre).toBeGreaterThanOrEqual(D_tx - 1e-9);
    expect(sh!.calibratedDPre).toBeLessThanOrEqual(rr.scores.D_pre + 1e-9);
    expect(sh!.staticLiftAfter).toBeLessThanOrEqual(0.25 + 1e-9);
    expect(sh!.staticLiftBefore).toBeGreaterThanOrEqual(0);
  });

  it("tighter cap lowers calibratedDPre when static lift is large", () => {
    const p = calibrationHighStaticRiskGoodChat();
    const rr = evaluateRrmSimFromSimulationV2(p, staticContextHighStaticRisk());
    expect(rr.fallbackUsed).toBe(false);
    const loose = buildDPreStaticLiftCapShadowResult({ transcriptLite: p, rrmSimResult: rr, staticLiftCap: 0.25 })!;
    const tight = buildDPreStaticLiftCapShadowResult({ transcriptLite: p, rrmSimResult: rr, staticLiftCap: 0.05 })!;
    expect(tight.calibratedDPre).toBeLessThanOrEqual(loose.calibratedDPre + 1e-9);
    expect(tight.staticLiftAfter).toBeLessThanOrEqual(0.05 + 1e-9);
  });

  it("respect gate: high R_pre keeps stop_or_step_back on calibrated path", () => {
    const p = calibrationPressureBoundaryRisk();
    const rr = evaluateRrmSimFromSimulationV2(p, null);
    expect(rr.fallbackUsed).toBe(false);
    expect(rr.scores.R_pre).toBeGreaterThanOrEqual(RRM_SIM_RESPECT_R_PRE_GATE);
    const sh = buildDPreStaticLiftCapShadowResult({ transcriptLite: p, rrmSimResult: rr, staticLiftCap: 0.25 });
    expect(sh).not.toBeNull();
    expect(sh!.respectGateApplied).toBe(true);
    expect(sh!.safetyOverrideApplied).toBe(true);
    expect(sh!.calibratedRecommendation.suggestedAction).toBe("stop_or_step_back");
    expect(sh!.calibratedRecommendation.progressionWindow).toBe("closed");
    expect(sh!.calibratedRhythmScore).toBeLessThanOrEqual(25);
  });
});
