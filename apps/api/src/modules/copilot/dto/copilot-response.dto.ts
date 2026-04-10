/** GET /copilot/conversations/:id/insights — rule-based, no persistence. */
export type CopilotInsightsResponse = {
  conversationId: string;
  /** Coarse state label for clients (rule-derived). */
  relationshipState: string;
  communicationAdvice: string[];
  riskHints: string[];
  suggestedTopics: string[];
  /**
   * `rule_based` = rules only (model off or fallback).
   * `model_<slug>` = LLM ok; slug from AI_PROVIDER or inferred from AI_BASE_URL host (see P6.2 runbook).
   */
  sourceType: string;
  /**
   * Rules: template id (e.g. p2-copilot-rule-v1).
   * Model: `<slug>|<AI_MODEL>|<prompt version>` e.g. deepseek|deepseek-chat|p6-copilot-prompt-v1
   */
  sourceVersion: string;
  generatedAt: string;
  /** Which inputs were available / used for this response. */
  basedOn: {
    summary: boolean;
    feedbackOnConversation: boolean;
    behaviorSignals: boolean;
    pendingProfileSuggestions: boolean;
  };
};
