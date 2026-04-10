import { authHeaders, baseUrl, handleJson } from "./auth";

export type SummaryAiResponse = {
  summary: string;
  chatStageHint: string;
  generatedAt: string;
  sourceType: string;
  sourceVersion: string;
};

/** P6.5：独立路径，按需调用；失败由调用方处理，不绑发消息。 */
export async function getSummaryAi(conversationId: string) {
  const res = await fetch(
    `${baseUrl}/summary-ai/conversations/${encodeURIComponent(conversationId)}`,
    {
      headers: authHeaders(),
    },
  );
  return handleJson<SummaryAiResponse>(res);
}
