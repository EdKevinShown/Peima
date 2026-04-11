import { authHeaders, baseUrl, handleJson } from "./auth";

export type CopilotInsightsResponse = {
  conversationId: string;
  relationshipState: string;
  communicationAdvice: string[];
  riskHints: string[];
  suggestedTopics: string[];
  /** rule_based | model_<slug> — see docs/P6/P6.2-copilot-llm-runbook.md */
  sourceType: string;
  /** Rules: rule template id. Model: slug|model|promptVersion */
  sourceVersion: string;
  generatedAt: string;
  basedOn: {
    summary: boolean;
    feedbackOnConversation: boolean;
    behaviorSignals: boolean;
    pendingProfileSuggestions: boolean;
  };
};

export async function getCopilotInsights(conversationId: string) {
  const res = await fetch(
    `${baseUrl}/copilot/conversations/${encodeURIComponent(conversationId)}/insights`,
    { headers: authHeaders() },
  );
  return handleJson<CopilotInsightsResponse>(res);
}
