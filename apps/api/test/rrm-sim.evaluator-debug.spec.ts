import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildLegacyThreeScenarioV2Payload, buildValidAiSimulationV2Payload } from "./fixtures/ai-simulation-v2-seven-scenarios";
import {
  calibrationHighQualityContinueLightly,
  calibrationPressureBoundaryRisk,
  staticContextHighQuality,
} from "./fixtures/rrm-sim/calibration-fixtures";
import { evaluateRrmSimFromSimulationV2 } from "../src/modules/ai-simulation-v1/rrm-sim.evaluator";
import { evaluateRrmSimDebugFromSimulationV2 } from "../src/modules/ai-simulation-v1/rrm-sim.evaluator-debug";
import { RRM_SIM_SCENARIO_WEIGHTS } from "../src/modules/ai-simulation-v1/rrm-sim.constants";
import { RRM_SCENARIO_KEYS_ORDERED } from "../src/modules/ai-simulation-v1/ai-simulation-v1-rrm.constants";

const REPO_ROOT = join(__dirname, "../../..");

function readApiSource(relFromRepoRoot: string): string {
  return readFileSync(join(REPO_ROOT, relFromRepoRoot), "utf8");
}

describe("evaluateRrmSimDebugFromSimulationV2", () => {
  it("ok=true on valid v2 fixture with full debug", () => {
    const p = buildValidAiSimulationV2Payload();
    const out = evaluateRrmSimDebugFromSimulationV2(p, null);
    expect(out.ok).toBe(true);
    expect(out.fallbackUsed).toBe(false);
    expect(out.production.fallbackUsed).toBe(false);
    expect(out.debug).toBeDefined();
  });

  it("production.scores.simulatedRhythmScore matches debug.mapping.finalRhythmScore", () => {
    const p = buildValidAiSimulationV2Payload();
    const out = evaluateRrmSimDebugFromSimulationV2(p, null);
    expect(out.debug?.mapping.finalRhythmScore).toBe(out.production.scores.simulatedRhythmScore);
  });

  it("debug.scores exposes C_pred / F_sim / D_pre / R_pre / RFI_sim as finite numbers", () => {
    const p = buildValidAiSimulationV2Payload();
    const out = evaluateRrmSimDebugFromSimulationV2(p, null);
    const s = out.debug?.scores;
    expect(s).toBeDefined();
    for (const k of ["C_pred", "F_sim", "D_pre", "R_pre", "RFI_sim", "simulatedRhythmScore"] as const) {
      expect(typeof s![k]).toBe("number");
      expect(Number.isFinite(s![k])).toBe(true);
    }
  });

  it("scenarioDebug has 7 rows with A/S/E/Q/R_scenario/RFI_scenario/weight", () => {
    const p = buildValidAiSimulationV2Payload();
    const out = evaluateRrmSimDebugFromSimulationV2(p, null);
    expect(out.debug?.scenarioDebug).toHaveLength(7);
    for (let i = 0; i < 7; i += 1) {
      const row = out.debug!.scenarioDebug[i];
      expect(row.scenarioKey).toBe(RRM_SCENARIO_KEYS_ORDERED[i]);
      expect(row.weight).toBe(RRM_SIM_SCENARIO_WEIGHTS[RRM_SCENARIO_KEYS_ORDERED[i]]);
      expect(typeof row.A).toBe("number");
      expect(typeof row.S).toBe("number");
      expect(typeof row.E).toBe("number");
      expect(typeof row.Q).toBe("number");
      expect(typeof row.R_scenario).toBe("number");
      expect(typeof row.RFI_scenario).toBe("number");
      expect(typeof row.weightedContribution).toBe("number");
    }
  });

  it("respect gate: final rhythm <= 25 and respectGateApplied", () => {
    const out = evaluateRrmSimDebugFromSimulationV2(calibrationPressureBoundaryRisk(), null);
    expect(out.production.scores.R_pre).toBeGreaterThanOrEqual(0.7);
    expect(out.debug?.gates.respectGateApplied).toBe(true);
    expect(out.debug?.mapping.finalRhythmScore).toBeLessThanOrEqual(25);
    expect(out.production.scores.simulatedRhythmScore).toBeLessThanOrEqual(25);
  });

  it("invalid / incomplete payload: fallback, no throw, debug omitted", () => {
    const legacy = buildLegacyThreeScenarioV2Payload();
    const out = evaluateRrmSimDebugFromSimulationV2(legacy, null);
    expect(out.production.fallbackUsed).toBe(true);
    expect(out.fallbackUsed).toBe(true);
    expect(out.debug).toBeUndefined();
    expect(() => evaluateRrmSimDebugFromSimulationV2({ schemaVersion: "transcript_lite_v1" }, null)).not.toThrow();
  });

  it("matches evaluateRrmSimFromSimulationV2 production branch for static + hq fixture", () => {
    const hq = calibrationHighQualityContinueLightly();
    const ctx = staticContextHighQuality();
    const direct = evaluateRrmSimFromSimulationV2(hq, ctx);
    const wrapped = evaluateRrmSimDebugFromSimulationV2(hq, ctx);
    expect(wrapped.ok).toBe(true);
    expect(wrapped.production).toEqual(direct);
  });
});

describe("M1.3-M1 API surface — debug not exposed on HTTP paths", () => {
  it("ai-simulation-v1.service does not reference debug wrapper", () => {
    const src = readApiSource("apps/api/src/modules/ai-simulation-v1/ai-simulation-v1.service.ts");
    expect(src).not.toMatch(/evaluateRrmSimDebugFromSimulationV2|RrmSimDebugResult|rrmSimDebug/);
  });

  it("viewer controller does not reference debug wrapper", () => {
    const src = readApiSource("apps/api/src/modules/ai-simulation-v1/ai-simulation-v1-viewer.controller.ts");
    expect(src).not.toMatch(/evaluateRrmSimDebugFromSimulationV2|RrmSimDebugResult|rrmSimDebug/);
  });

  it("admin.controller does not reference debug wrapper", () => {
    const src = readApiSource("apps/api/src/modules/admin/admin.controller.ts");
    expect(src).not.toMatch(/evaluateRrmSimDebugFromSimulationV2|RrmSimDebugResult|rrmSimDebug/);
  });
});

describe("M1.3-M1 web — no debug evaluator references", () => {
  it("apps/web has no evaluateRrmSimDebugFromSimulationV2 symbol", () => {
    expect(() =>
      execSync('git grep "evaluateRrmSimDebugFromSimulationV2" apps/web', {
        cwd: REPO_ROOT,
        encoding: "utf8",
      }),
    ).toThrow();
  });
});
