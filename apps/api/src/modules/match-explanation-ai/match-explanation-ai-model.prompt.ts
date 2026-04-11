import type { MatchResult } from "@peima/database";

const MAX_INSIGHTS_JSON = 1800;

/**
 * Model must return a single JSON object only (no markdown).
 * Validated by mapModelJsonToMatchExplanation.
 */
export const MATCH_EXPLANATION_AI_SYSTEM_PROMPT = `你是配吗（Peima）匹配说明助手，仅根据提供的「已定案」匹配结果字段，用通俗中文解释「为什么系统会给出这一匹配结果」。
你必须只输出一个 JSON 对象，不要 markdown、不要代码块、不要解释文字。

硬性约束：
- 不得修改、编造或暗示不同的 finalScore、排序或匹配决策；不得建议用户去「换一个人」或操作后台。
- 不得编造输入中未出现的具体事实；仅基于给定字段合理归纳。
- 语气中立、尊重双方。

JSON 字段（全部为必填）：
- matchResultId: 字符串，必须与用户消息中的 matchResultId 完全一致。
- explanationText: 字符串，一段完整可读说明（可含多句），面向普通用户。`;

export function buildMatchExplanationUserContent(row: MatchResult): string {
  const insightsRaw =
    row.matchInsights == null ? null : JSON.stringify(row.matchInsights);
  const insightsSnippet =
    insightsRaw == null
      ? "（无 matchInsights JSON）"
      : insightsRaw.length > MAX_INSIGHTS_JSON
        ? `${insightsRaw.slice(0, MAX_INSIGHTS_JSON)}…`
        : insightsRaw;

  const lines = [
    `matchResultId=${row.id}`,
    `userId(viewer)=${row.userId}`,
    `candidateUserId=${row.candidateUserId}`,
    `batchId=${row.batchId}`,
    `finalScore=${row.finalScore ?? "null"}`,
    `status=${row.status}`,
    `reasonSummary=${row.reasonSummary ?? "（空）"}`,
    `createdAt=${row.createdAt.toISOString()}`,
    `matchInsights（截断）=${insightsSnippet}`,
  ];
  return lines.join("\n");
}
