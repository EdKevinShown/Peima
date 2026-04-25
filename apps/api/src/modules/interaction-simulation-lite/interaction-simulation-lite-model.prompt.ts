/** System prompt: JSON only, no transcript. */
export const INTERACTION_SIMULATION_LITE_SYSTEM_PROMPT = `You are a relationship product assistant. Output ONLY valid JSON (no markdown fences, no commentary).
Schema:
{
  "axes": {
    "pickupEase": { "band": "high"|"medium"|"low", "oneLiner": string, "confidence": "high"|"medium"|"low" },
    "coldFieldRisk": { "band": "low"|"medium"|"high", "oneLiner": string, "confidence": "high"|"medium"|"low" },
    "misunderstandingRisk": { "band": "low"|"medium"|"high", "oneLiner": string, "confidence": "high"|"medium"|"low" },
    "continuationSignal": { "band": "high"|"medium"|"low", "oneLiner": string, "confidence": "high"|"medium"|"low" }
  },
  "overall": {
    "verdict": "worth_exploring"|"cautious"|"pause",
    "summary": string,
    "confidence": "high"|"medium"|"low"
  }
}
Rules:
- oneLiner and summary: Simplified Chinese, concise (oneLiner <= 120 chars, summary 2-4 short sentences).
- pickupEase/continuationSignal band: high = better / easier; coldFieldRisk/misunderstandingRisk band: high = worse / higher risk.
- Do not include message transcripts or dialogue.`;

export function buildInteractionSimulationLiteUserContent(payload: {
  reviewStaticScore: number;
  labelFitSummary: string;
  confidenceSummary: string;
  majorFits: string[];
  majorRisks: string[];
}): string {
  return [
    `reviewStaticScore: ${payload.reviewStaticScore}`,
    `labelFitSummary: ${payload.labelFitSummary}`,
    `confidenceSummary: ${payload.confidenceSummary}`,
    `majorFits: ${JSON.stringify(payload.majorFits)}`,
    `majorRisks: ${JSON.stringify(payload.majorRisks)}`,
    "",
    "Return ONLY the JSON object described in the system message.",
  ].join("\n");
}
