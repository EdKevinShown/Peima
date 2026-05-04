/**
 * M6.0-B: viewer-safe score breakdown parsed from persisted `reasonSummary` (v1 worker text).
 * Does not read DB; does not echo raw `reasonSummary` in the returned object.
 */

const NUM = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?`;

const REASON_SUMMARY_V1_RE = new RegExp(
  String.raw`^\s*Selected by finalScore v1 \(previewPoolScore=(${NUM}), preferenceScore=(${NUM}), styleScore=(${NUM}), profileScore=(${NUM})\)\.\s*$`,
);

export type ScoreBreakdownSource = "reason_summary_v1" | "missing" | "parse_failed";

export type ViewerSafeScoreBreakdown = {
  previewPoolScore: number | null;
  preferenceScore: number | null;
  styleScore: number | null;
  profileScore: number | null;
  source: ScoreBreakdownSource;
};

const NULL_BREAKDOWN: ViewerSafeScoreBreakdown = {
  previewPoolScore: null,
  preferenceScore: null,
  styleScore: null,
  profileScore: null,
  source: "missing",
};

function parseComponent(raw: string): number | null {
  const v = Number.parseFloat(raw);
  if (!Number.isFinite(v) || v < 0 || v > 1) {
    return null;
  }
  return v;
}

/**
 * Parse v1 `formatReasonSummaryV1` output, e.g.
 * `Selected by finalScore v1 (previewPoolScore=0.8, preferenceScore=1, styleScore=1, profileScore=0.821217).`
 */
export function parseScoreBreakdownFromReasonSummary(
  reasonSummary?: string | null,
): ViewerSafeScoreBreakdown {
  if (reasonSummary == null) {
    return { ...NULL_BREAKDOWN, source: "missing" };
  }
  const trimmed = reasonSummary.trim();
  if (trimmed.length === 0) {
    return { ...NULL_BREAKDOWN, source: "missing" };
  }

  const m = REASON_SUMMARY_V1_RE.exec(trimmed);
  if (!m) {
    return {
      previewPoolScore: null,
      preferenceScore: null,
      styleScore: null,
      profileScore: null,
      source: "parse_failed",
    };
  }

  const previewPoolScore = parseComponent(m[1]);
  const preferenceScore = parseComponent(m[2]);
  const styleScore = parseComponent(m[3]);
  const profileScore = parseComponent(m[4]);

  if (
    previewPoolScore == null ||
    preferenceScore == null ||
    styleScore == null ||
    profileScore == null
  ) {
    return {
      previewPoolScore: null,
      preferenceScore: null,
      styleScore: null,
      profileScore: null,
      source: "parse_failed",
    };
  }

  return {
    previewPoolScore,
    preferenceScore,
    styleScore,
    profileScore,
    source: "reason_summary_v1",
  };
}
