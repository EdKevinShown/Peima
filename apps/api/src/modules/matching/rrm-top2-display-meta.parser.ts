import {
  MATCH_RESULT_RRM_TOP2_DISPLAY_META_SCHEMA_VERSION,
  MATCH_RESULT_RRM_TOP2_DISPLAY_META_SOURCE_TYPE,
  type MatchResultRrmTop2DisplayMetaV1,
  type RrmTop2DisplayMetaGuardrailsV1,
  type ViewerSafeRrmTop2DisplayMeta,
} from "./rrm-top2-display-meta.types";

function isRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

function trimStr(v: unknown, maxLen: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, maxLen);
}

function parseStringArrayField(v: unknown, maxItems: number, maxStrLen: number): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== "string") return null;
    const t = x.trim().slice(0, maxStrLen);
    if (!t) return null;
    out.push(t);
    if (out.length >= maxItems) break;
  }
  return out;
}

/** Parses `meta.guardrails`; if key present but invalid → `null` (whole meta rejected). */
export function parseRrmTop2DisplayMetaGuardrailsV1Loose(raw: unknown): RrmTop2DisplayMetaGuardrailsV1 | null {
  if (!isRecord(raw)) return null;
  const st = raw.status;
  if (st !== "pass" && st !== "caution" && st !== "block" && st !== "not_evaluated") return null;
  const blockReasons = parseStringArrayField(raw.blockReasons, 24, 200);
  const cautionReasons = parseStringArrayField(raw.cautionReasons, 24, 200);
  if (blockReasons == null || cautionReasons == null) return null;
  const sourceVersionRaw = raw.sourceVersion;
  const sourceVersion =
    sourceVersionRaw == null || sourceVersionRaw === undefined
      ? undefined
      : trimStr(sourceVersionRaw, 120) || undefined;
  return { status: st, blockReasons, cautionReasons, ...(sourceVersion ? { sourceVersion } : {}) };
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

  let guardrails: RrmTop2DisplayMetaGuardrailsV1 | undefined;
  if (Object.prototype.hasOwnProperty.call(raw, "guardrails")) {
    const g = parseRrmTop2DisplayMetaGuardrailsV1Loose(raw.guardrails);
    if (!g) return null;
    guardrails = g;
  }

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
    ...(guardrails ? { guardrails } : {}),
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
    ...(meta.guardrails ? { guardrails: meta.guardrails } : {}),
  };
}
