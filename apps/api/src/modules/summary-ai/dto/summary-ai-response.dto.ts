/** P6.5 GET /summary-ai/conversations/:id — independent from chat summary DTO path. */
export type SummaryAiResponseDto = {
  summary: string;
  chatStageHint: string;
  generatedAt: string;
  sourceType: string;
  sourceVersion: string;
};
