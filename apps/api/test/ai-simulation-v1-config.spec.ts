import { AiSimulationV1ConfigService } from "../src/modules/ai-simulation-v1/ai-simulation-v1.config.service";

describe("AiSimulationV1ConfigService maxCompletionTokens", () => {
  let savedMax: string | undefined;

  beforeEach(() => {
    savedMax = process.env.AI_SIMULATION_V1_MAX_TOKENS;
  });

  afterEach(() => {
    if (savedMax === undefined) {
      delete process.env.AI_SIMULATION_V1_MAX_TOKENS;
    } else {
      process.env.AI_SIMULATION_V1_MAX_TOKENS = savedMax;
    }
  });

  it("defaults to 8000 when AI_SIMULATION_V1_MAX_TOKENS is unset", () => {
    delete process.env.AI_SIMULATION_V1_MAX_TOKENS;
    const c = new AiSimulationV1ConfigService();
    expect(c.maxCompletionTokens).toBe(8000);
  });

  it("uses env when set to a positive integer", () => {
    process.env.AI_SIMULATION_V1_MAX_TOKENS = "12000";
    const c = new AiSimulationV1ConfigService();
    expect(c.maxCompletionTokens).toBe(12000);
  });

  it("falls back to 8000 for non-numeric env", () => {
    process.env.AI_SIMULATION_V1_MAX_TOKENS = "not-a-number";
    const c = new AiSimulationV1ConfigService();
    expect(c.maxCompletionTokens).toBe(8000);
  });

  it("falls back to 8000 for zero or negative", () => {
    process.env.AI_SIMULATION_V1_MAX_TOKENS = "0";
    expect(new AiSimulationV1ConfigService().maxCompletionTokens).toBe(8000);
    process.env.AI_SIMULATION_V1_MAX_TOKENS = "-5";
    expect(new AiSimulationV1ConfigService().maxCompletionTokens).toBe(8000);
  });

  it("falls back to 8000 when above cap", () => {
    process.env.AI_SIMULATION_V1_MAX_TOKENS = "200000";
    const c = new AiSimulationV1ConfigService();
    expect(c.maxCompletionTokens).toBe(8000);
  });
});
