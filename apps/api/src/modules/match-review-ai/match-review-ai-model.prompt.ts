import type { MatchReviewStaticSummaryPayload } from "./match-review-ai.types";

const MAX_USER_PAYLOAD = 12000;

/**
 * 模型必须只输出一个 JSON 对象（可含 markdown 代码块包裹，mapper 会剥离）。
 */
export const MATCH_REVIEW_AI_SYSTEM_PROMPT = `你是「配吗」产品的关系匹配复审器（不是恋爱教练、不是写手、不做心理/医学诊断）。
你的任务：仅根据用户消息里给出的**双方问卷画像结构化摘要**，输出保守、可解释、少幻觉的匹配复审结论。

硬性约束：
- 不得编造输入中未出现的具体事实；不得把单一标签绝对化。
- 必须先考虑相处上的共振点，再写风险；风险用可观察的相处层面表述，不夸张。
- strengths / risks 使用短中文句；explanation 适合产品前端展示（1–3 段内）。
- 若信息不足，应降低 confidence 字段，而不是虚构细节。
- 只输出一个 JSON 对象，不要 markdown 说明文字、不要代码块外的多余文本。

JSON 字段（全部为必填）：
- finalScore: 数字 0–100，表示复审综合分（不是数据库里的 worker finalScore）。
- recommendation: 只能是 strong_match | match | cautious_match | not_recommended 之一。
- conversationPotential: high | medium | low
- longTermPotential: high | medium | low
- strengths: 字符串数组，2–6 条。
- risks: 字符串数组，2–6 条。
- explanation: 字符串，完整可读说明。
- confidence: high | medium | low`;

export function buildMatchReviewUserContent(payload: {
  viewerUserId: string;
  candidateUserId: string;
  matchResultId: string;
  reviewStaticScore: number;
  staticSummary: MatchReviewStaticSummaryPayload;
  viewerOverall: { title: string; paragraph: string };
  candidateOverall: { title: string; paragraph: string };
}): string {
  const core = {
    viewerUserId: payload.viewerUserId,
    candidateUserId: payload.candidateUserId,
    matchResultId: payload.matchResultId,
    reviewStaticScore: payload.reviewStaticScore,
    staticSummary: payload.staticSummary,
    viewerOverallExplanation: payload.viewerOverall,
    candidateOverallExplanation: payload.candidateOverall,
  };
  let json = JSON.stringify(core);
  if (json.length > MAX_USER_PAYLOAD) {
    json = `${json.slice(0, MAX_USER_PAYLOAD)}…`;
  }
  return [
    "以下为仅供复审的结构化输入（不要复述敏感标识符给用户）：",
    json,
  ].join("\n");
}
