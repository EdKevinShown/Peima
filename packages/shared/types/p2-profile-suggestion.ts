import type { P2SourceTypeId } from "../constants/p2-source-type";
import type { P2SuggestionStatusId } from "../constants/p2-suggestion-status";

/**
 * Suggested delta to questionnaire-derived profile dimensions (opaque payload).
 * Apply only after user accept; never silent upsert.
 */
export type P2ProfileUpdateSuggestion = {
  suggestionId: string;
  userId: string;
  status: P2SuggestionStatusId;
  sourceType: P2SourceTypeId;
  sourceVersion: string;
  createdAt: string;
  /** When status became accepted or dismissed, if applicable. */
  resolvedAt?: string;
  /** Rule/template-produced patch; schema defined when API persists. */
  proposedPatch: Record<string, unknown>;
};
