import { authHeaders, baseUrl, handleJson } from "./auth";

export type MatchExplanationAiResponse = {
  explanationText: string;
  generatedAt: string;
  sourceType: string;
  sourceVersion: string;
};

/** P6.6：按需调用；失败由调用方处理；不绑 matching 主链路。 */
export async function getMatchExplanationAi(matchResultId: string) {
  const res = await fetch(
    `${baseUrl}/match-explanation-ai/match-results/${encodeURIComponent(matchResultId)}`,
    {
      headers: authHeaders(),
    },
  );
  return handleJson<MatchExplanationAiResponse>(res);
}
