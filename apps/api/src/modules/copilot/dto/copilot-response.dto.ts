/** GET /copilot/conversations/:id/insights — rule-based, no persistence. */
export type CopilotInsightsResponse = {
  conversationId: string;
  /** Coarse state label for clients (rule-derived). */
  relationshipState: string;
  communicationAdvice: string[];
  riskHints: string[];
  suggestedTopics: string[];
  sourceType: string;
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
