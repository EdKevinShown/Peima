import { ITEM_STATUS } from "../src/modules/ai-simulation-v1/ai-simulation-v1.constants";
import { recomputeAiSimulationJobSidecarsV0 } from "../src/modules/ai-simulation-v1/ai-simulation-job-sidecars-recompute";
import { computeShortlistFingerprint } from "../src/modules/ai-simulation-v1/shortlist-contract-binding";
import * as shortlistScenariosV0 from "../src/modules/ai-simulation-v1/shortlist-scenarios-v0";
import {
  buildLegacyThreeScenarioV2Payload,
  buildValidAiSimulationV2Payload,
} from "./fixtures/ai-simulation-v2-seven-scenarios";

function binding(ids: string[]) {
  return {
    previewPoolId: "p1",
    shortlistSchemaVersion: "preview_pool_shortlist_contract_v0",
    shortlistCandidateUserIds: ids,
    shortlistFingerprint: computeShortlistFingerprint(ids),
  };
}

function ev(score: number) {
  return {
    continue_recommendation: "hold" as const,
    risk_tags: [] as string[],
    mitigation_hints: [] as string[],
    simulationRankScore: score,
    confidence: "medium" as const,
  };
}

describe("recomputeAiSimulationJobSidecarsV0 (M0.7.1)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("v2 path does not call tryBuildShortlistScenariosV0 and returns fourDim + decision", () => {
    const spy = jest.spyOn(shortlistScenariosV0, "tryBuildShortlistScenariosV0");
    const ids = ["u_high", "u_low"];
    const b = binding(ids);
    const out = recomputeAiSimulationJobSidecarsV0({
      shortlistBinding: b,
      items: [
        {
          candidateUserId: "u_high",
          status: ITEM_STATUS.SUCCEEDED,
          evaluator: ev(0.9),
          transcriptLite: buildValidAiSimulationV2Payload({
            scenarioScores: [0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95],
          }),
        },
        {
          candidateUserId: "u_low",
          status: ITEM_STATUS.SUCCEEDED,
          evaluator: ev(0.5),
          transcriptLite: buildValidAiSimulationV2Payload({
            scenarioScores: [0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4],
          }),
        },
      ],
    });
    expect(spy).not.toHaveBeenCalled();
    expect(out.derivation).toBe("simulation_v2");
    expect(out.legacyScenariosBuildable).toBeNull();
    expect(out.fourDim).not.toBeNull();
    expect(out.decision).not.toBeNull();
    expect(out.rankConsistent).toBe(true);
    expect(out.fourDim!.comparison.rankedCandidateUserIds).toEqual(out.decision!.rankedCandidateUserIds);
    expect(out.fourDim!.comparison.rankedCandidateUserIds[0]).toBe("u_high");
  });

  it("pre-M0.8 three-scenario v2 still skips tryBuildShortlistScenariosV0 (v2 sidecar path)", () => {
    const spy = jest.spyOn(shortlistScenariosV0, "tryBuildShortlistScenariosV0");
    const ids = ["a", "b"];
    const b = binding(ids);
    const legacy = buildLegacyThreeScenarioV2Payload();
    const out = recomputeAiSimulationJobSidecarsV0({
      shortlistBinding: b,
      items: [
        { candidateUserId: "a", status: ITEM_STATUS.SUCCEEDED, evaluator: ev(0.9), transcriptLite: legacy },
        { candidateUserId: "b", status: ITEM_STATUS.SUCCEEDED, evaluator: ev(0.5), transcriptLite: legacy },
      ],
    });
    expect(spy).not.toHaveBeenCalled();
    expect(out.derivation).toBe("simulation_v2");
    expect(out.fourDim).not.toBeNull();
    expect(out.decision).not.toBeNull();
  });

  it("legacy evaluator-only path still calls tryBuildShortlistScenariosV0 (in-memory)", () => {
    const spy = jest.spyOn(shortlistScenariosV0, "tryBuildShortlistScenariosV0");
    const ids = ["a", "b"];
    const b = binding(ids);
    const out = recomputeAiSimulationJobSidecarsV0({
      shortlistBinding: b,
      items: [
        { candidateUserId: "a", status: ITEM_STATUS.SUCCEEDED, evaluator: ev(0.86), transcriptLite: { schemaVersion: 1 } },
        { candidateUserId: "b", status: ITEM_STATUS.SUCCEEDED, evaluator: ev(0.7), transcriptLite: null },
      ],
    });
    expect(spy).toHaveBeenCalled();
    expect(out.derivation).toBe("legacy_scenarios");
    expect(out.legacyScenariosBuildable).toBe(true);
    expect(out.fourDim).not.toBeNull();
    expect(out.decision).not.toBeNull();
  });
});
