import {
  RRM_ASSISTANT_A_DRAFT_BY_BUCKET,
  type RrmAssistantADraftBucket,
  type RrmAssistantDraftAdvancementType,
} from "./rrm-assistant-draft.constants";
import type { RrmAssistantDraftDetectionV1 } from "./rrm-assistant-draft.types";

type DraftRule = {
  type: RrmAssistantDraftAdvancementType;
  bucket: RrmAssistantADraftBucket;
  advancement: boolean;
  reasonTag: string;
  patterns: RegExp[];
};

const DRAFT_RULES_ORDERED: DraftRule[] = [
  {
    type: "urge_reply_pressure",
    bucket: "very_high",
    advancement: true,
    reasonTag: "urge_reply_or_pressure",
    patterns: [
      /怎么不回|为什么不回|回我|别晾|must reply|answer me/i,
      /不然就|再不回|催你/i,
    ],
  },
  {
    type: "high_pressure_invite",
    bucket: "high",
    advancement: true,
    reasonTag: "high_pressure_invite",
    patterns: [/必须见面|今晚一定|马上见|现在就见|non-negotiable/i],
  },
  {
    type: "romantic_intimacy",
    bucket: "high",
    advancement: true,
    reasonTag: "romantic_or_intimacy",
    patterns: [/暧昧|亲密|抱抱|亲吻|想你|喜欢你|爱你|在一起|交往/i],
  },
  {
    type: "light_invite",
    bucket: "medium_to_high",
    advancement: true,
    reasonTag: "light_invite",
    patterns: [/见面|喝咖啡|吃饭|约会|周末|有空吗|一起|invite|meet up/i],
  },
  {
    type: "express_interest",
    bucket: "medium",
    advancement: true,
    reasonTag: "express_interest",
    patterns: [/挺喜欢|有兴趣|想了解你|想多聊聊/i],
  },
  {
    type: "light_compliment",
    bucket: "low_to_medium",
    advancement: false,
    reasonTag: "light_compliment",
    patterns: [/很好看|很厉害|不错|挺棒|欣赏/i],
  },
  {
    type: "open_question",
    bucket: "low",
    advancement: false,
    reasonTag: "open_question",
    patterns: [/[?？]$/, /吗[?？]?$/, /怎么样|如何|what do you think/i],
  },
  {
    type: "topic_continuation",
    bucket: "low",
    advancement: false,
    reasonTag: "topic_continuation",
    patterns: [/对了|说到|继续|接话|刚才/i],
  },
  {
    type: "greeting",
    bucket: "very_low",
    advancement: false,
    reasonTag: "greeting",
    patterns: [/^(你好|嗨|hello|hi\b|早上好|晚上好)/i],
  },
];

function normalizeDraft(draft: string): string {
  return draft.replace(/\s+/g, " ").trim();
}

/**
 * Classify user draft into advancement type + discrete A_draft bucket (no LLM floats).
 */
export function detectRrmAssistantDraft(draft: string): RrmAssistantDraftDetectionV1 {
  const text = normalizeDraft(draft);
  if (!text) {
    return {
      advancementDetected: false,
      advancementType: "neutral_chat",
      A_draft_bucket: "very_low",
      A_draft: RRM_ASSISTANT_A_DRAFT_BY_BUCKET.very_low,
      reasonTags: ["empty_draft"],
    };
  }

  for (const rule of DRAFT_RULES_ORDERED) {
    if (rule.patterns.some((re) => re.test(text))) {
      return {
        advancementDetected: rule.advancement,
        advancementType: rule.type,
        A_draft_bucket: rule.bucket,
        A_draft: RRM_ASSISTANT_A_DRAFT_BY_BUCKET[rule.bucket],
        reasonTags: [rule.reasonTag],
      };
    }
  }

  return {
    advancementDetected: false,
    advancementType: "neutral_chat",
    A_draft_bucket: "very_low",
    A_draft: RRM_ASSISTANT_A_DRAFT_BY_BUCKET.very_low,
    reasonTags: ["neutral_chat"],
  };
}

export function mapAdvancementTypeToADraftBucket(
  type: RrmAssistantDraftAdvancementType,
): RrmAssistantADraftBucket {
  const found = DRAFT_RULES_ORDERED.find((r) => r.type === type);
  if (found) return found.bucket;
  if (type === "neutral_chat") return "very_low";
  return "low";
}
