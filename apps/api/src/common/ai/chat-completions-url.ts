/**
 * Build an OpenAI-compatible chat-completions URL from a provider base URL.
 * - `https://api.openai.com/v1` -> `.../v1/chat/completions`
 * - `https://api.deepseek.com` -> `.../chat/completions`
 * - If already ending with `/chat/completions`, keep unchanged.
 */
export function buildOpenAiCompatibleChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "/chat/completions";
  }
  if (trimmed.toLowerCase().endsWith("/chat/completions")) {
    return trimmed;
  }
  return `${trimmed}/chat/completions`;
}
