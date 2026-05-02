import type { MatchResult } from "@peima/database";
import type { MatchResultDisplayFields, MatchResultDisplaySourceType } from "./matching-result-display";

/** M5.1-M0 — readonly sidecar; does not participate in display resolution. */
export const MULTI_SOURCE_FINAL_DECISION_READONLY_SCHEMA_VERSION = 1 as const;

export const MULTI_SOURCE_FINAL_DECISION_READONLY_SOURCE_VERSION =
  "m5.1-m0-multi-source-final-decision-readonly-v1" as const;

export type MultiSourceFinalDecisionReadonlyM51M0 = {
  schemaVersion: typeof MULTI_SOURCE_FINAL_DECISION_READONLY_SCHEMA_VERSION;
  sourceVersion: typeof MULTI_SOURCE_FINAL_DECISION_READONLY_SOURCE_VERSION;
  /** Mirrors resolved `displayCandidateUserId` after existing finalize logic. */
  currentDisplayCandidateUserId: string;
  /** Mirrors resolved `displaySourceType`. */
  currentDisplaySourceType: MatchResultDisplaySourceType;
  /** M5.1+ may propose a display id; M5.1-M0 always null. */
  m5ProposedDisplayCandidateUserId: string | null;
  /** M5.1-M0 never applies M5 synthesis to display. */
  m5AppliedToDisplay: false;
  wouldChangeCurrentDisplay: false;
  decisionRule: "current_display_preserved_readonly";
};

/**
 * M5.1-M0: attach readonly multi-source sidecar echoing current display.
 * Must not alter `displayCandidateUserId` / `displaySourceType` resolution.
 */
export function buildMultiSourceFinalDecisionReadonlyM51M0(
  _matchRow: MatchResult,
  display: MatchResultDisplayFields,
): MultiSourceFinalDecisionReadonlyM51M0 {
  return {
    schemaVersion: MULTI_SOURCE_FINAL_DECISION_READONLY_SCHEMA_VERSION,
    sourceVersion: MULTI_SOURCE_FINAL_DECISION_READONLY_SOURCE_VERSION,
    currentDisplayCandidateUserId: display.displayCandidateUserId,
    currentDisplaySourceType: display.displaySourceType,
    m5ProposedDisplayCandidateUserId: null,
    m5AppliedToDisplay: false,
    wouldChangeCurrentDisplay: false,
    decisionRule: "current_display_preserved_readonly",
  };
}
