import { resolveSimulationQueueFromHintSnapshot } from "../src/modules/ai-simulation-v1/ai-simulation-v1-hint";
import { SIMULATION_V1_MAX_CANDIDATES_PER_JOB } from "../src/modules/ai-simulation-v1/ai-simulation-v1.constants";

describe("resolveSimulationQueueFromHintSnapshot", () => {
  it("filters demote, sorts by rankHint, caps at Top-8", () => {
    const hints = [];
    for (let i = 1; i <= 12; i += 1) {
      hints.push({
        rankHint: 13 - i,
        candidateUserId: `u${i}`,
        bucket: i === 5 ? "demote" : "neutral",
        prescreenScore: 0.5,
      });
    }
    const { simulationQueueActual, entries } = resolveSimulationQueueFromHintSnapshot(hints);
    expect(simulationQueueActual.length).toBe(SIMULATION_V1_MAX_CANDIDATES_PER_JOB);
    expect(entries.length).toBe(SIMULATION_V1_MAX_CANDIDATES_PER_JOB);
    expect(simulationQueueActual).not.toContain("u5");
    expect(simulationQueueActual[0]).toBe("u12");
  });
});
