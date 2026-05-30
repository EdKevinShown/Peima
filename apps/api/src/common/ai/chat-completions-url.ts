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
  const lower = trimmed.toLowerCase();
  if (lower.endsWith("/chat/completions")) {
    return trimmed;
  }
  if (lower.endsWith("/v1")) {
    return `${trimmed}/chat/completions`;
  }
  try {
    const host = new URL(trimmed).hostname.toLowerCase();
    // Kimi / Moonshot: root `https://api.moonshot.cn` → `/v1/chat/completions` (see README).
    if (host.includes("moonshot.cn")) {
      return `${trimmed}/v1/chat/completions`;
    }
  } catch {
    /* ignore */
  }
  return `${trimmed}/chat/completions`;
}
