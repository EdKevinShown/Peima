import {
  MATCH_RESULT_RRM_TOP2_DISPLAY_META_SCHEMA_VERSION,
  MATCH_RESULT_RRM_TOP2_DISPLAY_META_SOURCE_TYPE,
  type MatchResultRrmTop2DisplayMetaV1,
  type ViewerSafeRrmTop2DisplayMeta,
} from "./rrm-top2-display-meta.types";

function isRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

function trimStr(v: unknown, maxLen: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, maxLen);
}

/**
 * Best-effort parse of persisted `MatchResultRrmTop2DisplayMeta.meta` JSON.
 * Rejects malformed or non-v1 contracts (no throws).
 */
export function parseMatchResultRrmTop2DisplayMetaV1Loose(raw: unknown): MatchResultRrmTop2DisplayMetaV1 | null {
  if (!isRecord(raw)) return null;
  if (raw.schemaVersion !== MATCH_RESULT_RRM_TOP2_DISPLAY_META_SCHEMA_VERSION) return null;
  if (raw.sourceType !== MATCH_RESULT_RRM_TOP2_DISPLAY_META_SOURCE_TYPE) return null;

  const sourceVersion = trimStr(raw.sourceVersion, 120);
  const baselineCandidateUserId = trimStr(raw.baselineCandidateUserId, 64);
  const previousDisplayCandidateUserId = trimStr(raw.previousDisplayCandidateUserId, 64);
  const newDisplayCandidateUserId = trimStr(raw.newDisplayCandidateUserId, 64);
  const decisionRule = trimStr(raw.decisionRule, 160);
  const top2Fingerprint = trimStr(raw.top2Fingerprint, 200);

  if (!sourceVersion || !baselineCandidateUserId || !previousDisplayCandidateUserId || !newDisplayCandidateUserId || !top2Fingerprint) {
    return null;
  }

  if (raw.appliedToFinalScore !== false || raw.appliedToWorkerRanking !== false) return null;
  if (typeof raw.rollbackAvailable !== "boolean") return null;

  return {
    schemaVersion: MATCH_RESULT_RRM_TOP2_DISPLAY_META_SCHEMA_VERSION,
    sourceType: MATCH_RESULT_RRM_TOP2_DISPLAY_META_SOURCE_TYPE,
    sourceVersion,
    baselineCandidateUserId,
    previousDisplayCandidateUserId,
    newDisplayCandidateUserId,
    decisionRule: decisionRule || "unspecified",
    top2Fingerprint,
    appliedToFinalScore: false,
    appliedToWorkerRanking: false,
    rollbackAvailable: raw.rollbackAvailable,
  };
}

export function toViewerSafeRrmTop2DisplayMeta(meta: MatchResultRrmTop2DisplayMetaV1): ViewerSafeRrmTop2DisplayMeta {
  return {
    sourceType: meta.sourceType,
    sourceVersion: meta.sourceVersion,
    baselineCandidateUserId: meta.baselineCandidateUserId,
    previousDisplayCandidateUserId: meta.previousDisplayCandidateUserId,
    newDisplayCandidateUserId: meta.newDisplayCandidateUserId,
    decisionRule: meta.decisionRule,
    top2Fingerprint: meta.top2Fingerprint,
    appliedToFinalScore: false,
    appliedToWorkerRanking: false,
    rollbackAvailable: meta.rollbackAvailable,
  };
}
