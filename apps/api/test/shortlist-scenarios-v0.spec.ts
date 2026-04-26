import {
  ITEM_STATUS,
  SHORTLIST_SCENARIOS_V0_SCHEMA,
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
    risk_tags: recommendation === "slow_down" ? ["value_gap"] : [],
    mitigation_hints: [],
    simulationRankScore: score,
    confidence: "medium" as const,
  };
}

describe("tryBuildShortlistScenariosV0", () => {
  it("emits fixed 10 scenes for each shortlist candidate with stable explanation templates", () => {
    const ids = ["c1", "c2", "c3"];
    const b = binding(ids);
    const items = ids.map((id, idx) => ({
      candidateUserId: id,
      status: ITEM_STATUS.SUCCEEDED,
      evaluator: evaluator(0.9 - idx * 0.1, "hold"),
    }));
    const out = tryBuildShortlistScenariosV0(b, items);
    expect(out).not.toBeNull();
    expect(out!.scenes).toHaveLength(ids.length * SHORTLIST_SCENE_KEYS_V0.length);
    for (const id of ids) {
      const rows = out!.scenes.filter((r) => r.candidateUserId === id);
      expect(rows.map((r) => r.sceneKey).sort()).toEqual([...SHORTLIST_SCENE_KEYS_V0].sort());
      for (const row of rows) {
        expect(typeof row.reason).toBe("string");
        expect(row.reason).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(typeof row.riskPoint).toBe("string");
        expect(row.riskPoint).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(typeof row.evidenceSnippet).toBe("string");
        expect(row.evidenceSnippet).toMatch(/^scene=[a-z_]+;cand=[a-z0-9]+;status=(succeeded|failed);score=\d\.\d{4}$/);
        expect(row.evidenceSnippet.length).toBeLessThanOrEqual(88);
        expect(row.reviewStatus === "reviewable" || row.reviewStatus === "unreviewable").toBe(true);
      }
    }
  });

  it("keeps failed candidate with fixed-scene failed rows", () => {
    const b = binding(["c1", "c2"]);
    const out = tryBuildShortlistScenariosV0(b, [
      { candidateUserId: "c1", status: ITEM_STATUS.SUCCEEDED, evaluator: evaluator(0.8, "explore_more") },
      { candidateUserId: "c2", status: ITEM_STATUS.FAILED, evaluator: null },
    ]);
    expect(out).not.toBeNull();
    const failedRows = out!.scenes.filter((r) => r.candidateUserId === "c2");
    expect(failedRows).toHaveLength(SHORTLIST_SCENE_KEYS_V0.length);
    expect(failedRows.every((r) => r.status === "failed")).toBe(true);
  });

  it("Phase C v1.0: same binding+items yield identical scenarios, fourDim, and decision (twice)", () => {
    const b = binding(["x1", "x2"]);
    const items = [
      { candidateUserId: "x1", status: ITEM_STATUS.SUCCEEDED, evaluator: evaluator(0.77, "hold") },
      { candidateUserId: "x2", status: ITEM_STATUS.SUCCEEDED, evaluator: evaluator(0.66, "slow_down") },
    ];
    const s1 = tryBuildShortlistScenariosV0(b, items);
    const s2 = tryBuildShortlistScenariosV0(b, items);
    expect(s1).toEqual(s2);
    expect(s1!.scenes).toHaveLength(2 * SHORTLIST_SCENE_KEYS_V0.length);
    const f1 = tryBuildShortlistFourDimV0(s1);
    const f2 = tryBuildShortlistFourDimV0(s2);
    expect(f1).toEqual(f2);
    const d1 = tryBuildShortlistDecisionV0(b, items);
    const d2 = tryBuildShortlistDecisionV0(b, items);
    expect(d1).toEqual(d2);
    expect(f1!.comparison.rankedCandidateUserIds).toEqual(d1!.rankedCandidateUserIds);
  });

  it("Phase C v1.0: locks full 10×N matrix (score/status/reason/riskPoint/evidenceSnippet/reviewStatus)", () => {
    const b = binding(["cand_alpha", "cand_beta"]);
    const items = [
      { candidateUserId: "cand_alpha", status: ITEM_STATUS.SUCCEEDED, evaluator: evaluator(0.8, "hold") },
      { candidateUserId: "cand_beta", status: ITEM_STATUS.SUCCEEDED, evaluator: evaluator(0.7, "slow_down") },
    ];
    const out = tryBuildShortlistScenariosV0(b, items);
    const expectedScenes = [
      {
        sceneKey: "first_message_opening" as const,
        candidateUserId: "cand_alpha",
        score: 0.8,
        status: "succeeded" as const,
        reason: "opening_flow_good",
        riskPoint: "opening_risk_low",
        evidenceSnippet: "scene=first_message_opening;cand=cand_alpha;status=succeeded;score=0.8000",
        reviewStatus: "reviewable" as const,
      },
      {
        sceneKey: "pace_negotiation" as const,
        candidateUserId: "cand_alpha",
        score: 0.7,
        status: "succeeded" as const,
        reason: "pace_alignment_moderate",
        riskPoint: "pace_risk_low",
        evidenceSnippet: "scene=pace_negotiation;cand=cand_alpha;status=succeeded;score=0.7000",
        reviewStatus: "reviewable" as const,
      },
      {
        sceneKey: "boundary_conflict_response" as const,
        candidateUserId: "cand_alpha",
        score: 1,
        status: "succeeded" as const,
        reason: "boundary_handling_stable",
        riskPoint: "boundary_risk_low",
        evidenceSnippet: "scene=boundary_conflict_response;cand=cand_alpha;status=succeeded;score=1.0000",
        reviewStatus: "reviewable" as const,
      },
      {
        sceneKey: "misunderstanding_repair" as const,
        candidateUserId: "cand_alpha",
        score: 0.9,
        status: "succeeded" as const,
        reason: "repair_capacity_good",
        riskPoint: "repair_risk_low",
        evidenceSnippet: "scene=misunderstanding_repair;cand=cand_alpha;status=succeeded;score=0.9000",
        reviewStatus: "reviewable" as const,
      },
      {
        sceneKey: "long_term_lifestyle_alignment" as const,
        candidateUserId: "cand_alpha",
        score: 0.8,
        status: "succeeded" as const,
        reason: "lifestyle_alignment_good",
        riskPoint: "lifestyle_risk_low",
        evidenceSnippet: "scene=long_term_lifestyle_alignment;cand=cand_alpha;status=succeeded;score=0.8000",
        reviewStatus: "reviewable" as const,
      },
      {
        sceneKey: "values_commitment_conflict" as const,
        candidateUserId: "cand_alpha",
        score: 0.775,
        status: "succeeded" as const,
        reason: "values_commitment_alignment_good",
        riskPoint: "values_commitment_risk_low",
        evidenceSnippet: "scene=values_commitment_conflict;cand=cand_alpha;status=succeeded;score=0.7750",
        reviewStatus: "reviewable" as const,
      },
      {
        sceneKey: "re_engagement_after_lull" as const,
        candidateUserId: "cand_alpha",
        score: 0.8167,
        status: "succeeded" as const,
        reason: "re_engagement_quality_good",
        riskPoint: "re_engagement_risk_low",
        evidenceSnippet: "scene=re_engagement_after_lull;cand=cand_alpha;status=succeeded;score=0.8167",
        reviewStatus: "reviewable" as const,
      },
      {
        sceneKey: "emotional_support_under_stress" as const,
        candidateUserId: "cand_alpha",
        score: 0.8067,
        status: "succeeded" as const,
        reason: "stress_support_capacity_good",
        riskPoint: "stress_support_risk_low",
        evidenceSnippet: "scene=emotional_support_under_stress;cand=cand_alpha;status=succeeded;score=0.8067",
        reviewStatus: "reviewable" as const,
      },
      {
        sceneKey: "friends_family_integration_boundary" as const,
        candidateUserId: "cand_alpha",
        score: 0.8,
        status: "succeeded" as const,
        reason: "friends_family_boundary_good",
        riskPoint: "friends_family_boundary_risk_low",
        evidenceSnippet: "scene=friends_family_integration_boundary;cand=cand_alpha;status=succeeded;score=0.8000",
        reviewStatus: "reviewable" as const,
      },
      {
        sceneKey: "future_planning_tradeoff" as const,
        candidateUserId: "cand_alpha",
        score: 0.8033,
        status: "succeeded" as const,
        reason: "future_planning_tradeoff_alignment_good",
        riskPoint: "future_planning_tradeoff_risk_low",
        evidenceSnippet: "scene=future_planning_tradeoff;cand=cand_alpha;status=succeeded;score=0.8033",
        reviewStatus: "reviewable" as const,
      },
      {
        sceneKey: "first_message_opening" as const,
        candidateUserId: "cand_beta",
        score: 0.7,
        status: "succeeded" as const,
        reason: "opening_flow_moderate",
        riskPoint: "opening_risk_low",
        evidenceSnippet: "scene=first_message_opening;cand=cand_beta;status=succeeded;score=0.7000",
        reviewStatus: "reviewable" as const,
      },
      {
        sceneKey: "pace_negotiation" as const,
        candidateUserId: "cand_beta",
        score: 0.45,
        status: "succeeded" as const,
        reason: "pace_alignment_moderate",
        riskPoint: "pace_risk_low",
        evidenceSnippet: "scene=pace_negotiation;cand=cand_beta;status=succeeded;score=0.4500",
        reviewStatus: "reviewable" as const,
      },
      {
        sceneKey: "boundary_conflict_response" as const,
        candidateUserId: "cand_beta",
        score: 0.8333,
        status: "succeeded" as const,
        reason: "boundary_handling_stable",
        riskPoint: "boundary_risk_low",
        evidenceSnippet: "scene=boundary_conflict_response;cand=cand_beta;status=succeeded;score=0.8333",
        reviewStatus: "reviewable" as const,
      },
      {
        sceneKey: "misunderstanding_repair" as const,
        candidateUserId: "cand_beta",
        score: 0.5917,
        status: "succeeded" as const,
        reason: "repair_capacity_moderate",
        riskPoint: "repair_risk_low",
        evidenceSnippet: "scene=misunderstanding_repair;cand=cand_beta;status=succeeded;score=0.5917",
        reviewStatus: "reviewable" as const,
      },
      {
        sceneKey: "long_term_lifestyle_alignment" as const,
        candidateUserId: "cand_beta",
        score: 0.6278,
        status: "succeeded" as const,
        reason: "lifestyle_alignment_moderate",
        riskPoint: "lifestyle_risk_low",
        evidenceSnippet: "scene=long_term_lifestyle_alignment;cand=cand_beta;status=succeeded;score=0.6278",
        reviewStatus: "reviewable" as const,
      },
      {
        sceneKey: "values_commitment_conflict" as const,
        candidateUserId: "cand_beta",
        score: 0.5667,
        status: "succeeded" as const,
        reason: "values_commitment_alignment_moderate",
        riskPoint: "values_commitment_risk_low",
        evidenceSnippet: "scene=values_commitment_conflict;cand=cand_beta;status=succeeded;score=0.5667",
        reviewStatus: "reviewable" as const,
      },
      {
        sceneKey: "re_engagement_after_lull" as const,
        candidateUserId: "cand_beta",
        score: 0.6278,
        status: "succeeded" as const,
        reason: "re_engagement_quality_moderate",
        riskPoint: "re_engagement_risk_low",
        evidenceSnippet: "scene=re_engagement_after_lull;cand=cand_beta;status=succeeded;score=0.6278",
        reviewStatus: "reviewable" as const,
      },
      {
        sceneKey: "emotional_support_under_stress" as const,
        candidateUserId: "cand_beta",
        score: 0.6378,
        status: "succeeded" as const,
        reason: "stress_support_capacity_moderate",
        riskPoint: "stress_support_risk_low",
        evidenceSnippet: "scene=emotional_support_under_stress;cand=cand_beta;status=succeeded;score=0.6378",
        reviewStatus: "reviewable" as const,
      },
      {
        sceneKey: "friends_family_integration_boundary" as const,
        candidateUserId: "cand_beta",
        score: 0.6311,
        status: "succeeded" as const,
        reason: "friends_family_boundary_moderate",
        riskPoint: "friends_family_boundary_risk_low",
        evidenceSnippet: "scene=friends_family_integration_boundary;cand=cand_beta;status=succeeded;score=0.6311",
        reviewStatus: "reviewable" as const,
      },
      {
        sceneKey: "future_planning_tradeoff" as const,
        candidateUserId: "cand_beta",
        score: 0.6344,
        status: "succeeded" as const,
        reason: "future_planning_tradeoff_alignment_moderate",
        riskPoint: "future_planning_tradeoff_risk_low",
        evidenceSnippet: "scene=future_planning_tradeoff;cand=cand_beta;status=succeeded;score=0.6344",
        reviewStatus: "reviewable" as const,
      },
    ];
    expect(out).toEqual({
      schemaVersion: SHORTLIST_SCENARIOS_V0_SCHEMA,
      shortlistFingerprint: b.shortlistFingerprint,
      scenes: expectedScenes,
    });
    expect(out!.scenes).toHaveLength(2 * SHORTLIST_SCENE_KEYS_V0.length);
  });

  it("Phase C v1.0: each candidate has 10 scenes; fourDim.rankedCandidateUserIds === decision (fixture a/b)", () => {
    const ids = ["b", "a"];
    const b = binding(ids);
    const items = [
      { candidateUserId: "a", status: ITEM_STATUS.SUCCEEDED, evaluator: evaluator(0.9, "explore_more") },
      { candidateUserId: "b", status: ITEM_STATUS.SUCCEEDED, evaluator: evaluator(0.9, "hold") },
    ];
    const scenarios = tryBuildShortlistScenariosV0(b, items);
    expect(scenarios).not.toBeNull();
    for (const id of ["a", "b"]) {
      const rows = scenarios!.scenes.filter((r) => r.candidateUserId === id);
      expect(rows).toHaveLength(10);
      const friends = rows.find((r) => r.sceneKey === "friends_family_integration_boundary");
      expect(friends).toBeDefined();
      expect(friends!.reason).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(friends!.riskPoint).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(friends!.evidenceSnippet).toContain("friends_family_integration_boundary");
      expect(friends!.reviewStatus).toBe("reviewable");
      const future = rows.find((r) => r.sceneKey === "future_planning_tradeoff");
      expect(future).toBeDefined();
      expect(future!.status).toBe("succeeded");
      expect(typeof future!.score).toBe("number");
      expect(future!.reason).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(future!.riskPoint).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(future!.evidenceSnippet).toContain("future_planning_tradeoff");
      expect(future!.reviewStatus).toBe("reviewable");
    }
    const fourDim = tryBuildShortlistFourDimV0(scenarios);
    const decision = tryBuildShortlistDecisionV0(b, items);
    expect(fourDim).not.toBeNull();
    expect(decision).not.toBeNull();
    expect(fourDim!.comparison.rankedCandidateUserIds).toEqual(decision!.rankedCandidateUserIds);
  });
});
