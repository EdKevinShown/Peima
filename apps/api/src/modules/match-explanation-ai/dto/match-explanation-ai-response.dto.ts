/** P6.6 GET /match-explanation-ai/match-results/:id */
export type MatchExplanationAiResponseDto = {
  explanationText: string;
  generatedAt: string;
  sourceType: string;
  sourceVersion: string;
};
