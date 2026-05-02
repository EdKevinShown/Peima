import {
  calibrationHighQualityContinueLightly,
  calibrationHighStaticRiskGoodChat,
  calibrationPressureBoundaryRisk,
  staticContextHighStaticRisk,
} from "./fixtures/rrm-sim/calibration-fixtures";
import { evaluateRrmSimFromSimulationV2 } from "../src/modules/ai-simulation-v1/rrm-sim.evaluator";
import {
  whatIfLowerDPrePenalty,
  whatIfLowerFCapEffect,
  whatIfCPredWeightingVariant,
  whatIfPerScenarioWeightVariant,
  canRunRrmWhatIf,
  debugSummaryProxyInputs,
  computeDPreSoftCap,
  computeDPreStaticCapFromTxAdmin,
  computeDPreMajorRiskDedupProxyFromTxAdmin,
  whatIfDPreSoftCapProxy,
  whatIfDPreStaticCapProxy,
  whatIfDPreMajorRiskDedupProxy,
  everyUsableRowHasTranscriptOnlyDPre,
  deriveSuggestedActionAndProgressionWindow,
} from "../src/modules/ai-simulation-v1/rrm-sim-calibration-whatif";
import { RRM_SIM_RESPECT_R_PRE_GATE } from "../src/modules/ai-simulation-v1/rrm-sim.constants";

describe("rrm-sim-calibration-whatif (M1.3-M2 offline proxies)", () => {
  it("canRunRrmWhatIf is true for full 7-scenario non-fallback result", () => {
    const p = calibrationHighQualityContinueLightly();
    const rr = evaluateRrmSimFromSimulationV2(p, null);
    expect(rr.fallbackUsed).toBe(false);
    expect(canRunRrmWhatIf(rr)).toBe(true);
  });

  it("lower_d_pre_penalty changes RFI_sim / rhythm vs baseline for high-static fixture", () => {
    const p = calibrationHighStaticRiskGoodChat();
    const rr = evaluateRrmSimFromSimulationV2(p, staticContextHighStaticRisk());
    expect(rr.fallbackUsed).toBe(false);
    const w = whatIfLowerDPrePenalty(rr);
    expect(w).not.toBeNull();
    expect(w!.RFI_sim).not.toBeCloseTo(rr.scores.RFI_sim, 4);
    expect(w!.simulatedRhythmScore).not.toBe(rr.scores.simulatedRhythmScore);
  });

  it("lower_f_cap_effect changes RFI_sim vs baseline when F room below cap", () => {
    const p = calibrationHighQualityContinueLightly();
    const rr = evaluateRrmSimFromSimulationV2(p, null);
    expect(rr.fallbackUsed).toBe(false);
    const w = whatIfLowerFCapEffect(rr);
    expect(w).not.toBeNull();
    expect(w!.RFI_sim).not.toBeCloseTo(rr.scores.RFI_sim, 4);
  });

  it("c_pred_weighting_variant returns non-null rhythm for full fixture", () => {
    const p = calibrationHighQualityContinueLightly();
    const rr = evaluateRrmSimFromSimulationV2(p, null);
    const w = whatIfCPredWeightingVariant(rr);
    expect(w).not.toBeNull();
    expect(typeof w!.simulatedRhythmScore).toBe("number");
  });

  it("per_scenario_weight_variant re-aggregates with alternate weights", () => {
    const p = calibrationHighQualityContinueLightly();
    const rr = evaluateRrmSimFromSimulationV2(p, null);
    const w = whatIfPerScenarioWeightVariant(rr);
    expect(w).not.toBeNull();
    expect(w!.weightsUsed.length).toBe(7);
    expect(w!.note).toContain("offline");
  });

  it("debugSummaryProxyInputs lower_d uses reduced D proxy average", () => {
    const p = calibrationHighStaticRiskGoodChat();
    const rr = evaluateRrmSimFromSimulationV2(p, staticContextHighStaticRisk());
    const fakeResults = [{ rrmSimResult: rr }];
    const base = rr.scores.D_pre;
    const s = debugSummaryProxyInputs("lower_d_pre_penalty", fakeResults);
    expect(s.avgDPre).toBeLessThan(base);
  });
});

describe("rrm-sim-calibration-whatif (M1.3-M5 D_pre proxy helpers)", () => {
  it("d_pre_soft_cap_proxy: D=1.0 maps to 0.87", () => {
    expect(computeDPreSoftCap(1)).toBeCloseTo(0.87, 5);
    const p = calibrationHighStaticRiskGoodChat();
    const rr = evaluateRrmSimFromSimulationV2(p, staticContextHighStaticRisk());
    expect(rr.fallbackUsed).toBe(false);
    const w = whatIfDPreSoftCapProxy(rr);
    expect(w).not.toBeNull();
    expect(w!.dPreAfter).toBeCloseTo(computeDPreSoftCap(rr.scores.D_pre), 5);
    if (rr.scores.D_pre > 0.8) {
      expect(w!.RFI_sim).not.toBeCloseTo(rr.scores.RFI_sim, 4);
    }
  });

  it("d_pre_static_cap_proxy: D_tx=0.65 D_admin=1 cap 0.25 → D'=0.90", () => {
    expect(computeDPreStaticCapFromTxAdmin(0.65, 1, 0.25)).toBeCloseTo(0.9, 5);
  });

  it("d_pre_static_cap_proxy accepts custom cap (0.10)", () => {
    const p = calibrationHighStaticRiskGoodChat();
    const rr = evaluateRrmSimFromSimulationV2(p, staticContextHighStaticRisk());
    const w025 = whatIfDPreStaticCapProxy(rr, p, 0.25);
    const w010 = whatIfDPreStaticCapProxy(rr, p, 0.1);
    expect(w025).not.toBeNull();
    expect(w010).not.toBeNull();
    expect(w010!.dPreAfter!).toBeLessThanOrEqual(w025!.dPreAfter! + 1e-9);
    expect(w010!.cappedLift).toBeLessThanOrEqual(0.1 + 1e-9);
  });

  it("d_pre_major_risk_dedup_proxy uses capped static lift (+0.18 max)", () => {
    expect(computeDPreMajorRiskDedupProxyFromTxAdmin(0.65, 1)).toBeCloseTo(0.83, 5);
    const p = calibrationHighStaticRiskGoodChat();
    const rr = evaluateRrmSimFromSimulationV2(p, staticContextHighStaticRisk());
    const w = whatIfDPreMajorRiskDedupProxy(rr, p);
    expect(w).not.toBeNull();
    expect(w!.proxyNote).toContain("dedup_proxy");
  });

  it("everyUsableRowHasTranscriptOnlyDPre is true for full fixture rows", () => {
    const p = calibrationHighQualityContinueLightly();
    const rr = evaluateRrmSimFromSimulationV2(p, null);
    const results = [{ status: "succeeded" as const, rrmSimResult: rr, transcriptLite: p }];
    expect(everyUsableRowHasTranscriptOnlyDPre(results)).toBe(true);
  });

  it("respect gate: high R_pre keeps stop_or_step_back after D_pre soft cap", () => {
    const p = calibrationPressureBoundaryRisk();
    const rr = evaluateRrmSimFromSimulationV2(p, null);
    expect(rr.fallbackUsed).toBe(false);
    expect(rr.scores.R_pre).toBeGreaterThanOrEqual(RRM_SIM_RESPECT_R_PRE_GATE);
    const w = whatIfDPreSoftCapProxy(rr);
    expect(w).not.toBeNull();
    expect(w!.suggestedAction).toBe("stop_or_step_back");
    expect(w!.progressionWindow).toBe("closed");
    const direct = deriveSuggestedActionAndProgressionWindow(
      w!.simulatedRhythmScore,
      rr.scores.R_pre,
      w!.dPreAfter ?? rr.scores.D_pre,
      0.5,
    );
    expect(direct.suggestedAction).toBe("stop_or_step_back");
  });
});
