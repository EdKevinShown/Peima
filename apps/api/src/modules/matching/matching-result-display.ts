import type { MatchResult } from "@peima/database";
import type { PrismaService } from "../../common/prisma/prisma.service";
import type { FinalMatchDecisionMetaV1 } from "./final-match-decision-meta.builder";
import { tryParseRrmSimReadonlySummaryPayloadV1FromMatchInsights } from "./matching-rrm-sim-readonly-summary";
import { readM6RrmV2SelectorDisplayEnv } from "./matching-m6-rrm-v2-selector-display-env";
import { tryParseRrmV2SelectorReadonlyDisplayFromMatchInsights } from "./matching-rrm-v2-selector-readonly-display";
import { readM5RrmTop2DisplayEnv } from "./m5-rrm-top2-display-env";
import { readPairwiseFinalizeEnv } from "./pairwise-finalize-env";
import { parseMatchResultRrmTop2DisplayMetaV1Loose } from "./rrm-top2-display-meta.parser";
import { validateRrmTop2DisplayEligibility } from "./rrm-top2-display-eligibility";

/** GET /matching/result viewer-safe slice + readout fusion alignment. */
export type ViewerSafeFinalMatchDecisionMeta = {
  sourceType: string;
  mode: string;
  pairwiseProposalRecommendation: string;
  selectedCandidateUserId: string;
  staticTop1CandidateUserId: string;
  pairwiseWinnerCandidateUserId: string | null;
  wouldChangeStaticResult: boolean;
  fallbackReason: string | null;
  frozen: boolean;
  frozenAt: string | null;
  appliedToFinalScore: boolean;
  appliedToWorkerRanking: boolean;
};

export type MatchResultDisplaySourceType =
  | "match_result_original"
  | "static_final"
  | "pairwise_final"
  | "static_fallback"
  /** M5.3: RRM Top2 bounded display (requires `PEIMA_M5_RRM_TOP2_ENABLED` + frozen sidecar + eligibility). */
  | "rrm_top2_bounded_selector"
  /** M6.0-r6: RRM V2 Top2 selector readonly display from `matchInsights` (flag + parse + DB checks only). */
  | "rrm_top2_v2_selector_readonly";

/**
 * GET display slice. When `displaySourceType === "rrm_top2_bounded_selector"`, `finalMatchDecisionMeta`
 * is **null** (M5.3-C2.1): do not reuse pairwise-shaped meta; RRM viewer-safe trace is deferred to M5.3-D / M6.1.
 */
export type MatchResultDisplayFields = {
  displayCandidateUserId: string;
  displaySourceType: MatchResultDisplaySourceType;
  finalMatchDecisionMeta: ViewerSafeFinalMatchDecisionMeta | null;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

/** Best-effort parse of persisted finalize meta (rejects malformed rows). */
export function parseFinalizeMetaV1Loose(raw: unknown): FinalMatchDecisionMetaV1 | null {
  if (!isRecord(raw)) return null;
  if (raw.schemaVersion !== 1) return null;
  const selected =
    typeof raw.selectedCandidateUserId === "string" ? raw.selectedCandidateUserId.trim() : "";
  const staticTop1 =
    typeof raw.staticTop1CandidateUserId === "string" ? raw.staticTop1CandidateUserId.trim() : "";
  if (!selected || !staticTop1) return null;
  if (raw.appliedToFinalScore !== false || raw.appliedToWorkerRanking !== false) return null;
  if (raw.frozen !== true) return null;
  const mode = typeof raw.mode === "string" ? raw.mode : "";
  if (mode !== "proposal_only" && mode !== "shadow" && mode !== "enabled") return null;
  return raw as unknown as FinalMatchDecisionMetaV1;
}

export function toViewerSafeFinalMatchDecisionMeta(meta: FinalMatchDecisionMetaV1): ViewerSafeFinalMatchDecisionMeta {
  return {
    sourceType: meta.sourceType,
    mode: meta.mode,
    pairwiseProposalRecommendation: meta.pairwiseProposalRecommendation,
    selectedCandidateUserId: meta.selectedCandidateUserId,
    staticTop1CandidateUserId: meta.staticTop1CandidateUserId,
    pairwiseWinnerCandidateUserId: meta.pairwiseWinnerCandidateUserId,
    wouldChangeStaticResult: meta.wouldChangeStaticResult,
    fallbackReason: meta.fallbackReason,
    frozen: meta.frozen,
    frozenAt: meta.frozenAt,
    appliedToFinalScore: meta.appliedToFinalScore,
    appliedToWorkerRanking: meta.appliedToWorkerRanking,
  };
}

function mapDisplaySourceTypeFromMeta(
  meta: FinalMatchDecisionMetaV1,
  selected: string,
  originalCandidateUserId: string,
): MatchResultDisplaySourceType {
  if (selected !== originalCandidateUserId) {
    return "pairwise_final";
  }
  if (meta.sourceType === "static_fallback") {
    return "static_fallback";
  }
  if (meta.sourceType === "pairwise_final") {
    return "pairwise_final";
  }
  return "static_final";
}

/**
 * M3.8-M13 + M5.3-C2: resolve display id for `GET /matching/result` and readout fusion.
 * Priority: RRM Top2 display meta → M6 RRM V2 selector readonly (flag) → Pairwise finalize meta → `match_result_original`.
 * Pool binding (pairwise): only `PairwisePoolFinalizeMeta` rows where `meta.staticTop1CandidateUserId === matchResult.candidateUserId`
 * (batch static Top1 与侧车一致)；否则宁可 fallback，不猜 poolId。
 */
export async function resolveMatchResultDisplay(
  prisma: PrismaService,
  matchRow: MatchResult,
): Promise<MatchResultDisplayFields> {
  const original = matchRow.candidateUserId;

  const rrmEnv = readM5RrmTop2DisplayEnv();
  if (rrmEnv.enabled) {
    const rrmRow = await prisma.matchResultRrmTop2DisplayMeta.findUnique({
      where: { matchResultId: matchRow.id },
    });
    if (rrmRow?.frozen) {
      const rrmParsed = parseMatchResultRrmTop2DisplayMetaV1Loose(rrmRow.meta);
      if (rrmParsed) {
        const baseline = rrmParsed.baselineCandidateUserId.trim();
        const winner = rrmParsed.newDisplayCandidateUserId.trim();
        const top2CandidateUserIds = [baseline, winner] as const;

        const summary = tryParseRrmSimReadonlySummaryPayloadV1FromMatchInsights(matchRow.matchInsights);

        const elig = validateRrmTop2DisplayEligibility({
          m5RrmTop2Enabled: true,
          matchResultCandidateUserId: original,
          top2CandidateUserIds,
          top2Fingerprint: rrmParsed.top2Fingerprint.trim(),
          rrmDisplayMeta: rrmParsed,
          rowTop2Fingerprint: rrmRow.top2Fingerprint,
          rrmSimReadonlySummary: summary,
        });

        if (elig.ok) {
          const selected = rrmParsed.newDisplayCandidateUserId.trim();
          const userOk = await prisma.user.findUnique({ where: { id: selected }, select: { id: true } });
          if (userOk) {
            /**
             * M5.3-C2.1: RRM 命中时 `finalMatchDecisionMeta` 刻意为 `null`，避免把 pairwise 形状的
             * `ViewerSafeFinalMatchDecisionMeta` 伪造进 GET（会误导 FinalMatchTechnicalDetails）。
             * Viewer-safe 的 RRM decisionContext / 技术侧 meta 由 **M5.3-D / M6.1** 单独建模与投影。
             */
            return {
              displayCandidateUserId: selected,
              displaySourceType: "rrm_top2_bounded_selector",
              finalMatchDecisionMeta: null,
            };
          }
        }
      }
    }
  }

  const m6Env = readM6RrmV2SelectorDisplayEnv();
  if (m6Env.enabled) {
    try {
      const m6Parsed = tryParseRrmV2SelectorReadonlyDisplayFromMatchInsights(matchRow.matchInsights);
      if (m6Parsed) {
        const selected = m6Parsed.displayUserId;
        const userOk = await prisma.user.findUnique({ where: { id: selected }, select: { id: true } });
        const profileOk = userOk
          ? await prisma.userProfile.findUnique({ where: { userId: selected }, select: { userId: true } })
          : null;
        if (userOk && profileOk) {
          return {
            displayCandidateUserId: selected,
            displaySourceType: "rrm_top2_v2_selector_readonly",
            finalMatchDecisionMeta: null,
          };
        }
      }
    } catch {
      /* display-only fallback */
    }
  }

  const env = readPairwiseFinalizeEnv();

  if (!env.enabledFlag || env.mode !== "enabled") {
    return {
      displayCandidateUserId: original,
      displaySourceType: "match_result_original",
      finalMatchDecisionMeta: null,
    };
  }

  const rows = await prisma.pairwisePoolFinalizeMeta.findMany({
    where: { viewerUserId: matchRow.userId, frozen: true },
    orderBy: [{ frozenAt: "desc" }, { updatedAt: "desc" }],
    take: 12,
  });

  for (const row of rows) {
    if (!row.frozen) continue;
    const meta = parseFinalizeMetaV1Loose(row.meta);
    if (!meta) continue;
    if (meta.staticTop1CandidateUserId !== original) continue;

    const selected = meta.selectedCandidateUserId.trim();
    if (!selected) continue;

    const userOk = await prisma.user.findUnique({ where: { id: selected }, select: { id: true } });
    if (!userOk) continue;

    const allowed = new Set<string>([meta.staticTop1CandidateUserId]);
    if (typeof meta.pairwiseWinnerCandidateUserId === "string" && meta.pairwiseWinnerCandidateUserId.trim()) {
      allowed.add(meta.pairwiseWinnerCandidateUserId.trim());
    }
    if (!allowed.has(selected)) continue;

    const displaySourceType = mapDisplaySourceTypeFromMeta(meta, selected, original);
    return {
      displayCandidateUserId: selected,
      displaySourceType,
      finalMatchDecisionMeta: toViewerSafeFinalMatchDecisionMeta(meta),
    };
  }

  return {
    displayCandidateUserId: original,
    displaySourceType: "match_result_original",
    finalMatchDecisionMeta: null,
  };
}
