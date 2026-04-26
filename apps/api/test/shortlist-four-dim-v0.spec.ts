import {
  ITEM_STATUS,
  SHORTLIST_FOUR_DIM_RANKING_FORMULA_V0,
  SHORTLIST_SCENE_KEYS_V0,
} from "../src/modules/ai-simulation-v1/ai-simulation-v1.constants";
import { computeShortlistFingerprint } from "../src/modules/ai-simulation-v1/shortlist-contract-binding";
import { tryBuildShortlistDecisionV0 } from "../src/modules/ai-simulation-v1/shortlist-decision-v0";
import { tryBuildShortlistFourDimV0 } from "../src/modules/ai-simulation-v1/shortlist-four-dim-v0";
import { tryBuildShortlistScenariosV0 } from "../src/modules/ai-simulation-v1/shortlist-scenarios-v0";

function binding(ids: string[]) {
  return {
    previewPoolId: "p1",
    shortlistSchemaVersion: "preview_pool_shortlist_contract_v0",
    shortlistCandidateUserIds: ids,
    shortlistFingerprint: computeShortlistFingerprint(ids),
  };
}

function evaluator(score: number, recommendation: "explore_more" | "hold" | "slow_down") {
  return {
    continue_recommendation: recommendation,
    risk_tags: recommendation === "slow_down" ? ["value_gap", "pace_mismatch"] : [],
    mitigation_hints: [],
    simulationRankScore: score,
    confidence: "medium" as const,
  };
}

describe("tryBuildShortlistFourDimV0", () => {
  it("builds 4-dim rows for all shortlist members and strict ranked permutation", () => {
    const ids = ["c2", "c1", "c3"];
    const b = binding(ids);
    const items = [
      { candidateUserId: "c1", status: ITEM_STATUS.SUCCEEDED, evaluator: evaluator(0.8, "hold") },
      { candidateUserId: "c2", status: ITEM_STATUS.SUCCEEDED, evaluator: evaluator(0.9, "explore_more") },
      { candidateUserId: "c3", status: ITEM_STATUS.SUCCEEDED, evaluator: evaluator(0.7, "slow_down") },
    ];
    const scenarios = tryBuildShortlistScenariosV0(b, items);
    const out = tryBuildShortlistFourDimV0(scenarios);
    expect(out).not.toBeNull();
    expect(out!.rankingFormulaVersion).toBe(SHORTLIST_FOUR_DIM_RANKING_FORMULA_V0);
    expect(out!.candidateDimensions).toHaveLength(3);
    expect(new Set(out!.candidateDimensions.map((r) => r.candidateUserId))).toEqual(new Set(ids));
    expect(out!.comparison.rankedCandidateUserIds).toEqual(["c2", "c1", "c3"]);
    expect(new Set(out!.comparison.rankedCandidateUserIds).size).toBe(3);
    expect(out!.shortlistFingerprint).toBe(b.shortlistFingerprint);
    for (const row of out!.candidateDimensions) {
      expect(row.openingSmoothness).toBeGreaterThanOrEqual(0);
      expect(row.openingSmoothness).toBeLessThanOrEqual(1);
      expect(row.continuation).toBeGreaterThanOrEqual(0);
      expect(row.continuation).toBeLessThanOrEqual(1);
      expect(row.conflictRisk).toBeGreaterThanOrEqual(0);
      expect(row.conflictRisk).toBeLessThanOrEqual(1);
      expect(row.longTermStability).toBeGreaterThanOrEqual(0);
      expect(row.longTermStability).toBeLessThanOrEqual(1);
    }
  });

  it("Phase C v1.0: fourDim.rankedCandidateUserIds === shortlistDecisionV0 (fixture b/a)", () => {
    const ids = ["b", "a"];
    const b = binding(ids);
    const items = [
      { candidateUserId: "a", status: ITEM_STATUS.SUCCEEDED, evaluator: evaluator(0.9, "explore_more") },
      { candidateUserId: "b", status: ITEM_STATUS.SUCCEEDED, evaluator: evaluator(0.9, "hold") },
    ];
    const scenarios = tryBuildShortlistScenariosV0(b, items);
    const fourDim = tryBuildShortlistFourDimV0(scenarios);
    const decision = tryBuildShortlistDecisionV0(b, items);
    expect(fourDim).not.toBeNull();
    expect(decision).not.toBeNull();
    expect(fourDim!.comparison.rankedCandidateUserIds).toEqual(decision!.rankedCandidateUserIds);
  });

  it("returns null if any shortlist item failed", () => {
    const ids = ["c1", "c2"];
    const b = binding(ids);
    const items = [
      { candidateUserId: "c1", status: ITEM_STATUS.SUCCEEDED, evaluator: evaluator(0.8, "hold") },
      { candidateUserId: "c2", status: ITEM_STATUS.FAILED, evaluator: null },
    ];
    const scenarios = tryBuildShortlistScenariosV0(b, items);
    expect(scenarios).not.toBeNull();
    expect(tryBuildShortlistFourDimV0(scenarios)).toBeNull();
  });

  it("Phase C v1.0: locks scenarios -> fourDim -> decision chain for same input (deterministic)", () => {
    const ids = ["p3", "p2", "p1"];
    const b = binding(ids);
    const items = [
      { candidateUserId: "p1", status: ITEM_STATUS.SUCCEEDED, evaluator: evaluator(0.62, "slow_down") },
      { candidateUserId: "p2", status: ITEM_STATUS.SUCCEEDED, evaluator: evaluator(0.78, "hold") },
      { candidateUserId: "p3", status: ITEM_STATUS.SUCCEEDED, evaluator: evaluator(0.91, "explore_more") },
    ];
    const scenariosA = tryBuildShortlistScenariosV0(b, items);
    const fourDimA = tryBuildShortlistFourDimV0(scenariosA);
    const decisionA = tryBuildShortlistDecisionV0(b, items);
    const scenariosB = tryBuildShortlistScenariosV0(b, items);
    const fourDimB = tryBuildShortlistFourDimV0(scenariosB);
    const decisionB = tryBuildShortlistDecisionV0(b, items);

    expect(scenariosA).toEqual(scenariosB);
    expect(fourDimA).toEqual(fourDimB);
    expect(decisionA).toEqual(decisionB);
    expect(fourDimA!.comparison.rankedCandidateUserIds).toEqual(decisionA!.rankedCandidateUserIds);
  });

  it("Phase C v1.0: explanation-only mutation does not change fourDim or decision (10-scene matrix)", () => {
    const ids = ["k1", "k2"];
    const b = binding(ids);
    const items = [
      { candidateUserId: "k1", status: ITEM_STATUS.SUCCEEDED, evaluator: evaluator(0.88, "hold") },
      { candidateUserId: "k2", status: ITEM_STATUS.SUCCEEDED, evaluator: evaluator(0.66, "slow_down") },
    ];
    const baseScenarios = tryBuildShortlistScenariosV0(b, items)!;
    expect(baseScenarios.scenes).toHaveLength(ids.length * SHORTLIST_SCENE_KEYS_V0.length);
    for (const id of ids) {
      const per = baseScenarios.scenes.filter((r) => r.candidateUserId === id);
      expect(per).toHaveLength(SHORTLIST_SCENE_KEYS_V0.length);
      for (const key of SHORTLIST_SCENE_KEYS_V0) {
        expect(per.some((r) => r.sceneKey === key)).toBe(true);
      }
    }
    const mutatedScenarios = structuredClone(baseScenarios);
    mutatedScenarios.scenes = mutatedScenarios.scenes.map((row) => ({
      ...row,
      reason: "manual_override_text",
      riskPoint: "manual_risk_label",
      evidenceSnippet: "manual_snippet",
      reviewStatus: "unreviewable" as const,
    }));
    expect(mutatedScenarios.scenes).toHaveLength(ids.length * SHORTLIST_SCENE_KEYS_V0.length);

    const fourDimBase = tryBuildShortlistFourDimV0(baseScenarios);
    const fourDimMutated = tryBuildShortlistFourDimV0(mutatedScenarios);
    const decision = tryBuildShortlistDecisionV0(b, items);

    expect(fourDimBase).not.toBeNull();
    expect(fourDimMutated).not.toBeNull();
    expect(decision).not.toBeNull();
    expect(fourDimBase).toEqual(fourDimMutated);
    expect(fourDimBase!.comparison.rankedCandidateUserIds).toEqual(decision!.rankedCandidateUserIds);
    expect(fourDimMutated!.comparison.rankedCandidateUserIds).toEqual(decision!.rankedCandidateUserIds);
    expect(tryBuildShortlistFourDimV0(baseScenarios)).toEqual(fourDimBase);
    expect(tryBuildShortlistDecisionV0(b, items)).toEqual(decision);
  });
});
