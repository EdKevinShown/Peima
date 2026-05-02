import { buildAiSimulationV1ChatCompletionsUrl } from "../src/modules/ai-simulation-v1/ai-simulation-v1-chat.client";

describe("buildAiSimulationV1ChatCompletionsUrl", () => {
  it("DeepSeek host without /v1 → …/chat/completions (not …/v1/chat/completions)", () => {
    expect(buildAiSimulationV1ChatCompletionsUrl("https://api.deepseek.com")).toBe(
      "https://api.deepseek.com/chat/completions",
    );
    expect(buildAiSimulationV1ChatCompletionsUrl("https://api.deepseek.com/")).toBe(
      "https://api.deepseek.com/chat/completions",
    );
  });

  it("OpenAI-style base including /v1 → …/v1/chat/completions", () => {
    expect(buildAiSimulationV1ChatCompletionsUrl("https://api.openai.com/v1")).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
  });

  it("does not duplicate /chat/completions", () => {
    expect(buildAiSimulationV1ChatCompletionsUrl("https://api.deepseek.com/chat/completions")).toBe(
      "https://api.deepseek.com/chat/completions",
    );
  });

  it("trims whitespace", () => {
    expect(buildAiSimulationV1ChatCompletionsUrl("  https://api.deepseek.com  ")).toBe(
      "https://api.deepseek.com/chat/completions",
    );
  });
});
