import { existsSync, readFileSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";
import { buildLegacyThreeScenarioV2Payload, buildValidAiSimulationV2Payload } from "./fixtures/ai-simulation-v2-seven-scenarios";
import {
  calibrationAwkwardContextLowS,
  calibrationHighQualityContinueLightly,
  calibrationHighStaticRiskGoodChat,
  calibrationPressureBoundaryRisk,
  calibrationSafeButLowMomentum,
  calibrationWrongSourceVersion,
  staticContextHighQuality,
  staticContextHighStaticRisk,
} from "./fixtures/rrm-sim/calibration-fixtures";
import {
  buildFullSevenScenarioCalibrationTable,
  evaluateCalibrationAcceptanceFlags,
} from "./rrm-sim-calibration-table";
import { computeRfiScenario } from "../src/modules/ai-simulation-v1/rrm-sim-formula";
import {
  buildFallbackRrmSimResult,
  evaluateRrmSimFromSimulationV2,
  isFullRrmSimEvaluatorInput,
} from "../src/modules/ai-simulation-v1/rrm-sim.evaluator";
import {
  RRM_SIM_SCENARIO_WEIGHTS,
  RRM_SIM_UNAVAILABLE_NOT_FULL,
  type RrmSimSuggestedAction,
} from "../src/modules/ai-simulation-v1/rrm-sim.constants";
import { RRM_SCENARIO_APPROACH_INTENSITY, RRM_SCENARIO_KEYS_ORDERED } from "../src/modules/ai-simulation-v1/ai-simulation-v1-rrm.constants";

const REPO_ROOT = join(__dirname, "../../..");

/** Production paths that must never call read-time RRM-Sim (worker ranking / match scoring). */
const RRM_SIM_ENTRYPOINT_FORBIDDEN_PREFIXES = [
  "apps/worker/",
  "apps/api/src/modules/matching/",
  "apps/web/",
];

/**
 * Read-time `evaluateRrmSimFromSimulationV2` — ai-simulation enrich, calibration tests, M13 offline tools only.
 */
function isAllowedRrmSimEntrypointFile(rel: string): boolean {
  const n = rel.replace(/\\/g, "/");
  if (RRM_SIM_ENTRYPOINT_FORBIDDEN_PREFIXES.some((p) => n.startsWith(p))) return false;
  if (n === "apps/api/src/modules/ai-simulation-v1/rrm-sim.evaluator.ts") return true;
  if (n.startsWith("apps/api/src/modules/ai-simulation-v1/")) return true;
  if (n.startsWith("apps/api/test/")) return true;
  if (n.startsWith("tools/m13-") && n.endsWith(".impl.ts")) return true;
  return false;
}

/** Debug wrapper — evaluator-debug module, its spec, and M13 calibration simulator only. */
function isAllowedRrmSimDebugEntrypointFile(rel: string): boolean {
  const n = rel.replace(/\\/g, "/");
  if (RRM_SIM_ENTRYPOINT_FORBIDDEN_PREFIXES.some((p) => n.startsWith(p))) return false;
  if (n === "apps/api/src/modules/ai-simulation-v1/rrm-sim.evaluator-debug.ts") return true;
  if (n === "apps/api/test/rrm-sim.evaluator-debug.spec.ts") return true;
  if (n === "tools/m13-m0-calibration-simulator.impl.ts") return true;
  return false;
}

const RRM_SIM_DEBUG_ENTRYPOINT_REQUIRED_FILES = [
  "apps/api/src/modules/ai-simulation-v1/rrm-sim.evaluator-debug.ts",
  "apps/api/test/rrm-sim.evaluator-debug.spec.ts",
] as const;

describe("computeRfiScenario", () => {
  it("uses S*E*A + F*Q - D_pre when A <= C_pred", () => {
    const rfi = computeRfiScenario({
      A: 0.2,
      C_pred: 0.5,
      S: 0.8,
      E: 0.8,
      F: 0.7,
      Q: 0.75,
      D_pre: 0.1,
      R_pre: 0.2,
    });
    expect(rfi).toBeCloseTo(0.8 * 0.8 * 0.2 + 0.7 * 0.75 - 0.1, 5);
  });

  it("uses penalty branch when A > C_pred", () => {
    const A = 0.45;
    const C = 0.25;
    const S = 0.7;
    const E = 0.75;
    const F = 0.6;
    const Q = 0.65;
    const D = 0.12;
    const Rpre = 0.3;
    const P = 1 + (1 - S) + (1 - E) + Rpre;
    const expected = F * Q - D - (A - C) * P;
    const rfi = computeRfiScenario({ A, C_pred: C, S, E, F, Q, D_pre: D, R_pre: Rpre });
    expect(rfi).toBeCloseTo(expected, 5);
  });
});

describe("evaluateRrmSimFromSimulationV2", () => {
  it("produces full rrmSimResult for 7-scenario v2 + v2 sourceVersion", () => {
    const p = buildValidAiSimulationV2Payload();
    expect(isFullRrmSimEvaluatorInput(p)).toBe(true);
    const out = evaluateRrmSimFromSimulationV2(p, null);
    expect(out.fallbackUsed).toBe(false);
    expect(out.rrmUnavailableReason).toBeNull();
    expect(out.scenarioScores).toHaveLength(7);
    for (let i = 0; i < 7; i += 1) {
      const key = RRM_SCENARIO_KEYS_ORDERED[i];
      expect(out.scenarioScores[i].scenario).toBe(key);
      expect(out.scenarioScores[i].A_scenario).toBe(RRM_SCENARIO_APPROACH_INTENSITY[key]);
    }
    expect(out.scores.F_sim).toBeLessThanOrEqual(0.85);
  });

  it("rejects legacy 3-scenario v2 with fallback", () => {
    const legacy = buildLegacyThreeScenarioV2Payload();
    expect(isFullRrmSimEvaluatorInput(legacy)).toBe(false);
    const out = evaluateRrmSimFromSimulationV2(legacy, null);
    expect(out.fallbackUsed).toBe(true);
    expect(out.rrmUnavailableReason).toBe(RRM_SIM_UNAVAILABLE_NOT_FULL);
    expect(out.scenarioScores).toHaveLength(0);
  });

  it("rejects v1 transcript shape", () => {
    const out = evaluateRrmSimFromSimulationV2({ schemaVersion: "transcript_lite_v1" }, null);
    expect(out.fallbackUsed).toBe(true);
  });

  it("when R_pre >= 0.7 forces stop_or_step_back, closed window, low rhythm", () => {
    const p = buildValidAiSimulationV2Payload();
    const spam = "强迫威胁羞辱骚扰道德绑架".repeat(8);
    for (const row of p.scenarioResults) {
      row.simulationTranscript[0]!.message = spam.slice(0, 160);
      row.signals.pressureOrBoundaryRisk = spam.slice(0, 80);
    }
    p.overallSimulationAssessment.mainRisks = [...p.overallSimulationAssessment.mainRisks, spam.slice(0, 100)];
    const out = evaluateRrmSimFromSimulationV2(p, null);
    expect(out.scores.R_pre).toBeGreaterThanOrEqual(0.7);
    expect(out.suggestedAction).toBe("stop_or_step_back");
    expect(out.progressionWindow).toBe("closed");
    expect(out.scores.simulatedRhythmScore).toBeLessThanOrEqual(25);
  });
});

describe("buildFallbackRrmSimResult", () => {
  it("returns maintain suggestedAction", () => {
    const f = buildFallbackRrmSimResult(RRM_SIM_UNAVAILABLE_NOT_FULL);
    expect(f.suggestedAction).toBe("maintain");
    expect(f.fallbackUsed).toBe(true);
  });
});

describe("M1.1 RRM-Sim calibration / regression", () => {
  const hq = calibrationHighQualityContinueLightly();
  const hqCtx = staticContextHighQuality();
  const lowMom = calibrationSafeButLowMomentum();
  const awkward = calibrationAwkwardContextLowS();
  const pressure = calibrationPressureBoundaryRisk();
  const staticChat = calibrationHighStaticRiskGoodChat();
  const staticCtx = staticContextHighStaticRisk();

  it("weights sum to 1 (stable aggregation contract)", () => {
    const s = RRM_SCENARIO_KEYS_ORDERED.reduce((a, k) => a + RRM_SIM_SCENARIO_WEIGHTS[k], 0);
    expect(s).toBeCloseTo(1, 6);
  });

  it("high_quality rhythm score is higher than safe_but_low_momentum", () => {
    const a = evaluateRrmSimFromSimulationV2(hq, hqCtx);
    const b = evaluateRrmSimFromSimulationV2(lowMom, null);
    expect(a.scores.simulatedRhythmScore).toBeGreaterThan(b.scores.simulatedRhythmScore);
  });

  it("safe_but_low_momentum is never strong_open", () => {
    const out = evaluateRrmSimFromSimulationV2(lowMom, null);
    expect(out.progressionWindow).not.toBe("strong_open");
  });

  it("awkward_context mean S_sim is below high_quality mean S_sim", () => {
    const hi = evaluateRrmSimFromSimulationV2(hq, hqCtx);
    const aw = evaluateRrmSimFromSimulationV2(awkward, null);
    const meanS = (rows: typeof hi.scenarioScores) => rows.reduce((a, r) => a + r.S_sim, 0) / 7;
    expect(meanS(aw.scenarioScores)).toBeLessThan(meanS(hi.scenarioScores));
  });

  it("pressure_boundary_risk triggers stop_or_step_back and low rhythm", () => {
    const out = evaluateRrmSimFromSimulationV2(pressure, null);
    expect(out.scores.R_pre).toBeGreaterThanOrEqual(0.7);
    expect(out.suggestedAction).toBe("stop_or_step_back");
    expect(out.scores.simulatedRhythmScore).toBeLessThanOrEqual(25);
  });

  it("when R_pre >= 0.7 rhythm is capped at 25 (pressure fixture)", () => {
    const out = evaluateRrmSimFromSimulationV2(pressure, null);
    expect(out.scores.R_pre).toBeGreaterThanOrEqual(0.7);
    expect(out.scores.simulatedRhythmScore).toBeLessThanOrEqual(25);
  });

  it("high_static_risk D_pre is clearly above high_quality D_pre", () => {
    const hi = evaluateRrmSimFromSimulationV2(hq, hqCtx);
    const st = evaluateRrmSimFromSimulationV2(staticChat, staticCtx);
    expect(st.scores.D_pre).toBeGreaterThan(hi.scores.D_pre + 0.08);
  });

  it("legacy_or_incomplete uses fallback (3-scenario and wrong sourceVersion)", () => {
    const legacy = buildLegacyThreeScenarioV2Payload();
    expect(evaluateRrmSimFromSimulationV2(legacy, null).fallbackUsed).toBe(true);
    const wrong = calibrationWrongSourceVersion();
    expect(isFullRrmSimEvaluatorInput(wrong)).toBe(false);
    expect(evaluateRrmSimFromSimulationV2(wrong, null).fallbackUsed).toBe(true);
    expect(evaluateRrmSimFromSimulationV2(wrong, null).rrmUnavailableReason).toBe(RRM_SIM_UNAVAILABLE_NOT_FULL);
  });

  it("F_sim is always <= 0.85 for full calibration payloads", () => {
    for (const p of [hq, lowMom, awkward, pressure, staticChat]) {
      const out = evaluateRrmSimFromSimulationV2(p, p === hq ? hqCtx : p === staticChat ? staticCtx : null);
      expect(out.scores.F_sim).toBeLessThanOrEqual(0.85);
    }
  });

  it("scenarioScores length is 7 whenever full evaluator runs", () => {
    for (const [p, ctx] of [
      [hq, hqCtx],
      [lowMom, null],
      [awkward, null],
      [pressure, null],
      [staticChat, staticCtx],
    ] as const) {
      expect(evaluateRrmSimFromSimulationV2(p, ctx).scenarioScores).toHaveLength(7);
    }
  });

  it("evaluateRrmSimFromSimulationV2 is only imported from ai-simulation read path (not worker / match scoring)", () => {
    const raw = execSync('git grep -l "evaluateRrmSimFromSimulationV2" -- "*.ts" "*.tsx"', {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    const files = raw
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((p) => p.replace(/\\/g, "/"));
    expect(files.length).toBeGreaterThan(0);
    const disallowed = files.filter((f) => !isAllowedRrmSimEntrypointFile(f));
    expect(disallowed).toEqual([]);
  });

  it("evaluateRrmSimDebugFromSimulationV2 is only referenced from evaluator-debug + its spec", () => {
    const paths = new Set<string>();
    try {
      const tracked = execSync('git ls-files "apps/api/**/*.ts" "apps/api/**/*.tsx"', {
        cwd: REPO_ROOT,
        encoding: "utf8",
      })
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .map((p) => p.replace(/\\/g, "/"));
      tracked.forEach((p) => paths.add(p));
    } catch {
      /* no git in sandbox */
    }
    for (const f of RRM_SIM_DEBUG_ENTRYPOINT_REQUIRED_FILES) {
      if (existsSync(join(REPO_ROOT, f))) paths.add(f);
    }
    try {
      const toolPaths = execSync('git ls-files "tools/m13-m0-calibration-simulator.impl.ts"', {
        cwd: REPO_ROOT,
        encoding: "utf8",
      })
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .map((p) => p.replace(/\\/g, "/"));
      toolPaths.forEach((p) => paths.add(p));
    } catch {
      /* no git */
    }
    const referencesRrmSimDebug = (body: string) =>
      /import\s*\{[^}]*\bevaluateRrmSimDebugFromSimulationV2\b/.test(body) ||
      /\bevaluateRrmSimDebugFromSimulationV2\s*\(/.test(body) ||
      /\bevaluateRrmSimDebugFromSimulationV2\s*=/.test(body);
    for (const rel of paths) {
      const abs = join(REPO_ROOT, rel);
      if (!existsSync(abs)) continue;
      const body = readFileSync(abs, "utf8");
      if (!referencesRrmSimDebug(body)) continue;
      expect(isAllowedRrmSimDebugEntrypointFile(rel)).toBe(true);
    }
    for (const must of RRM_SIM_DEBUG_ENTRYPOINT_REQUIRED_FILES) {
      const body = readFileSync(join(REPO_ROOT, must), "utf8");
      expect(referencesRrmSimDebug(body)).toBe(true);
    }
  });
});

describe("M1.1 calibration result table & extra acceptance", () => {
  const table = buildFullSevenScenarioCalibrationTable();
  const flags = evaluateCalibrationAcceptanceFlags(table);
  const by = (name: (typeof table)[number]["fixtureName"]) => table.find((r) => r.fixtureName === name)!;

  it("prints calibration table (fixtureName, scores, avgs)", () => {
    // eslint-disable-next-line no-console -- M1.1 human-readable calibration dump
    console.log(
      "\n| fixtureName | simulatedRhythmScore | suggestedAction | progressionWindow | C_pred | F_sim | D_pre | R_pre | avg_S_sim | avg_E_sim | avg_Q_sim |\n|---|---|---|---|---|---|---|---|---|---|---|",
    );
    for (const r of table) {
      // eslint-disable-next-line no-console
      console.log(
        `| ${r.fixtureName} | ${r.simulatedRhythmScore} | ${r.suggestedAction} | ${r.progressionWindow} | ${r.C_pred.toFixed(3)} | ${r.F_sim.toFixed(3)} | ${r.D_pre.toFixed(3)} | ${r.R_pre.toFixed(3)} | ${r.avg_S_sim.toFixed(3)} | ${r.avg_E_sim.toFixed(3)} | ${r.avg_Q_sim.toFixed(3)} |`,
      );
    }
    // eslint-disable-next-line no-console
    console.log("flags:", JSON.stringify(flags));
  });

  it("1: high_quality rhythm >= safe_but_low + 8", () => {
    const gap = by("high_quality_continue_lightly").simulatedRhythmScore - by("safe_but_low_momentum").simulatedRhythmScore;
    expect(gap).toBeGreaterThanOrEqual(8);
  });

  it("2: high_quality rhythm > awkward_context_low_s", () => {
    expect(by("high_quality_continue_lightly").simulatedRhythmScore).toBeGreaterThan(
      by("awkward_context_low_s").simulatedRhythmScore,
    );
  });

  it("3: pressure_boundary_risk rhythm <= 25", () => {
    expect(by("pressure_boundary_risk").simulatedRhythmScore).toBeLessThanOrEqual(25);
  });

  it("4: high_static rhythm <= high_quality (not higher)", () => {
    expect(by("high_static_risk_but_good_chat").simulatedRhythmScore).toBeLessThanOrEqual(
      by("high_quality_continue_lightly").simulatedRhythmScore,
    );
  });

  it("5: safe_but_low_momentum not strong_open", () => {
    expect(by("safe_but_low_momentum").progressionWindow).not.toBe("strong_open");
  });

  it("6–7: seven scenarioScores and F_sim cap for all full fixtures", () => {
    const payloads: Array<{ name: string; p: ReturnType<typeof calibrationHighQualityContinueLightly>; ctx: unknown }> = [
      { name: "hq", p: calibrationHighQualityContinueLightly(), ctx: staticContextHighQuality() },
      { name: "low", p: calibrationSafeButLowMomentum(), ctx: null },
      { name: "awk", p: calibrationAwkwardContextLowS(), ctx: null },
      { name: "pr", p: calibrationPressureBoundaryRisk(), ctx: null },
      { name: "st", p: calibrationHighStaticRiskGoodChat(), ctx: staticContextHighStaticRisk() },
    ];
    for (const { p, ctx } of payloads) {
      const out = evaluateRrmSimFromSimulationV2(p, ctx as Record<string, unknown> | null);
      expect(out.scenarioScores).toHaveLength(7);
      expect(out.scores.F_sim).toBeLessThanOrEqual(0.85);
    }
  });

  it("8: non-risk rhythm spread — fail with score_distribution_too_narrow if all in [60,80]", () => {
    if (flags.score_distribution_too_narrow) {
      throw new Error(
        "score_distribution_too_narrow: 非风险样本 rhythm 全落在 60–80。建议：略降 extractQPerScenario / extractSPerScenario 对 scenarioScore 的系数、或略升 D_pre 基线、或拉大 awkward / low_momentum fixture 与 high_quality 的信号差距。",
      );
    }
  });

  it("9: pressure must trigger stop — fail with boundary_risk_under_detected if not", () => {
    if (flags.boundary_risk_under_detected) {
      throw new Error(
        "boundary_risk_under_detected: R_pre<0.7 或未 stop_or_step_back。建议：优先扩充 COERCION_RE / extractRScenario 关键词与命中权重。",
      );
    }
  });

  it("10: high_static must not beat high_quality rhythm — fail with D_pre_under_weighted if it does", () => {
    if (flags.D_pre_under_weighted) {
      throw new Error(
        "D_pre_under_weighted: 静态高风险样本 rhythm 高于高质量。建议：提高 extractDPre 中 static majorRisks / overall mainRisks 权重或风险词覆盖面。",
      );
    }
  });
});

/** Push strength: lower index = less forward-leaning (M1.2 safe_but_low cap). */
const SUGGESTED_ACTION_PUSH_ORDER: RrmSimSuggestedAction[] = [
  "stop_or_step_back",
  "slow_down",
  "maintain",
  "continue_lightly",
  "soft_progress",
];

describe("M1.2 RRM-Sim output consistency (calibration)", () => {
  const table = buildFullSevenScenarioCalibrationTable();
  const by = (name: (typeof table)[number]["fixtureName"]) => table.find((r) => r.fixtureName === name)!;

  it("high_static_risk_but_good_chat: slow_down, closed|weak_open, rhythm <= high_quality", () => {
    const st = by("high_static_risk_but_good_chat");
    const hq = by("high_quality_continue_lightly");
    expect(st.suggestedAction).toBe("slow_down");
    expect(["closed", "weak_open"] as const).toContain(st.progressionWindow);
    expect(st.simulatedRhythmScore).toBeLessThanOrEqual(hq.simulatedRhythmScore);
  });

  it("high_quality_continue_lightly: gap vs low_momentum, suggested ok, no strong_open unless score>=85", () => {
    const hq = by("high_quality_continue_lightly");
    const low = by("safe_but_low_momentum");
    expect(hq.simulatedRhythmScore - low.simulatedRhythmScore).toBeGreaterThanOrEqual(8);
    expect(["continue_lightly", "soft_progress"] as const).toContain(hq.suggestedAction);
    if (hq.simulatedRhythmScore < 85) {
      expect(hq.progressionWindow).not.toBe("strong_open");
    }
  });

  it("pressure_boundary_risk: stop_or_step_back, closed, score<=25", () => {
    const pr = by("pressure_boundary_risk");
    expect(pr.suggestedAction).toBe("stop_or_step_back");
    expect(pr.progressionWindow).toBe("closed");
    expect(pr.simulatedRhythmScore).toBeLessThanOrEqual(25);
  });

  it("safe_but_low_momentum: not strong_open; suggestedAction not above continue_lightly", () => {
    const s = by("safe_but_low_momentum");
    expect(s.progressionWindow).not.toBe("strong_open");
    expect(
      SUGGESTED_ACTION_PUSH_ORDER.indexOf(s.suggestedAction),
    ).toBeLessThanOrEqual(SUGGESTED_ACTION_PUSH_ORDER.indexOf("continue_lightly"));
  });
});
