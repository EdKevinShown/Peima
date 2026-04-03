import { P2SourceType } from "@peima/shared/constants";
import type { CopilotInsightsResponse } from "./dto/copilot-response.dto";

/** Bump when template / branching changes. */
export const COPILOT_RULE_VERSION = "p2-copilot-rule-v1";

export type CopilotRuleContext = {
  messageCount: number;
  viewerMsgCount: number;
  candidateMsgCount: number;
  summaryBody: string;
  summaryHint: string;
  /** Ratings (1–5) for feedback rows on this conversation, most recent first. */
  feedbackRatingsThisConv: number[];
  /** User’s behavior_signal rows in the trailing window. */
  userSignalCountWindow: number;
  pendingProfileSuggestionsCount: number;
};

/**
 * Rule/template Copilot output — no LLM. Keywords align with P1 chat summary 文案.
 */
export function buildCopilotInsights(
  conversationId: string,
  ctx: CopilotRuleContext,
): CopilotInsightsResponse {
  const advice: string[] = [];
  const risks: string[] = [];
  const topics: string[] = [];
  const combined = `${ctx.summaryBody}\n${ctx.summaryHint}`;

  let relationshipState = "getting_started";

  if (
    ctx.messageCount === 0 ||
    combined.includes("会话尚无消息") ||
    combined.includes("尚无消息")
  ) {
    relationshipState = "cold_start";
    advice.push("先一句简短问候，再观察对方回复节奏。");
    topics.push("轻松日常", "简短自我介绍");
    risks.push("避免一次性追问过多私人问题。");
  } else if (
    combined.includes("等待对方") ||
    (ctx.candidateMsgCount === 0 && ctx.viewerMsgCount > 0)
  ) {
    relationshipState = "awaiting_peer";
    advice.push("给对方回复时间，避免短时间内多条长消息。");
    risks.push("单方面连续输出可能让对方有压力。");
    topics.push("对方可能感兴趣的话题（观察其资料）");
  } else if (
    combined.includes("viewer 侧适时回复") ||
    (ctx.viewerMsgCount === 0 && ctx.candidateMsgCount > 0)
  ) {
    relationshipState = "awaiting_self";
    advice.push("可以简短回应，保持互动平衡。");
    topics.push("承接上一条话题的一两个小问题");
  } else if (combined.includes("来有回")) {
    relationshipState = "exchanging";
    advice.push("已有来有回，可以逐步加深话题或约定下一步。");
    topics.push("共同兴趣延伸", "线下或下次聊天安排");
  } else {
    advice.push("保持自然语气，先聊轻松话题，再视反馈逐步深入。");
    topics.push("近期安排", "兴趣爱好");
  }

  if (combined.includes("轰炸")) {
    risks.push("注意消息频率与长度，放慢节奏更稳妥。");
  }

  if (ctx.feedbackRatingsThisConv.some((r) => r <= 2)) {
    advice.push("你曾对此会话给出较低评价，可先放慢节奏、缩短篇幅。");
  }

  if (ctx.userSignalCountWindow < 4) {
    advice.push("近期互动信号较少，建议从轻量、易回复的话题开始。");
  }

  if (ctx.pendingProfileSuggestionsCount > 0) {
    advice.push(
      "你有待处理的画像更新建议，可在方便时在「建议」入口查看后再聊深层话题。",
    );
  }

  if (risks.length === 0) {
    risks.push("避免在对方未回复时过度追问。");
  }

  const basedOn: CopilotInsightsResponse["basedOn"] = {
    summary: true,
    feedbackOnConversation: ctx.feedbackRatingsThisConv.length > 0,
    behaviorSignals: true,
    pendingProfileSuggestions: ctx.pendingProfileSuggestionsCount > 0,
  };

  return {
    conversationId,
    relationshipState,
    communicationAdvice: dedupeCap(advice, 6),
    riskHints: dedupeCap(risks, 4),
    suggestedTopics: dedupeCap(topics, 4),
    sourceType: P2SourceType.RuleBased,
    sourceVersion: COPILOT_RULE_VERSION,
    generatedAt: new Date().toISOString(),
    basedOn,
  };
}

function dedupeCap(items: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of items) {
    const t = s.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}
