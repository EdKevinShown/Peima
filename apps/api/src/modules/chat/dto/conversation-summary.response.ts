/** Chat summary API shape (P1 fields + P2 persistence provenance). */
export type ConversationSummaryResponse = {
  summary: string;
  chatStageHint: string;
  /** ISO 8601 — DB row createdAt when persisted, or “now” for inline fallback. */
  generatedAt: string;
  sourceType: string;
  sourceVersion: string;
  /** True when body comes from `conversation_summaries`; false for on-the-fly rule summary. */
  persisted: boolean;
};
