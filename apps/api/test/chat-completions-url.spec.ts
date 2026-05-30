import { buildOpenAiCompatibleChatCompletionsUrl } from "../src/common/ai/chat-completions-url";
import { buildAiSimulationV1ChatCompletionsUrl } from "../src/modules/ai-simulation-v1/ai-simulation-v1-chat.client";

describe("buildOpenAiCompatibleChatCompletionsUrl", () => {
  it("appends /chat/completions for DeepSeek base URL", () => {
    expect(
      buildOpenAiCompatibleChatCompletionsUrl("https://api.deepseek.com"),
    ).toBe("https://api.deepseek.com/chat/completions");
  });

  it("keeps OpenAI /v1 prefix when provided", () => {
    expect(
      buildOpenAiCompatibleChatCompletionsUrl("https://api.openai.com/v1"),
    ).toBe("https://api.openai.com/v1/chat/completions");
  });

  it("does not duplicate path when URL already points to completions", () => {
    expect(
      buildOpenAiCompatibleChatCompletionsUrl(
        "https://api.openai.com/v1/chat/completions",
      ),
    ).toBe("https://api.openai.com/v1/chat/completions");
  });

  it("appends /v1/chat/completions for Moonshot (Kimi) root base URL", () => {
    expect(
      buildOpenAiCompatibleChatCompletionsUrl("https://api.moonshot.cn"),
    ).toBe("https://api.moonshot.cn/v1/chat/completions");
  });
});

describe("buildAiSimulationV1ChatCompletionsUrl", () => {
  it("delegates to shared OpenAI-compatible URL builder", () => {
    const base = "https://gateway.example.com/custom-v1";
    expect(buildAiSimulationV1ChatCompletionsUrl(base)).toBe(
      buildOpenAiCompatibleChatCompletionsUrl(base),
    );
  });
});
