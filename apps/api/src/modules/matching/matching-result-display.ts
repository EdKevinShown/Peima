import type { MatchResult } from "@peima/database";
import type { PrismaService } from "../../common/prisma/prisma.service";
import type { FinalMatchDecisionMetaV1 } from "./final-match-decision-meta.builder";
import { readPairwiseFinalizeEnv } from "./pairwise-finalize-env";

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
  | "static_fallback";

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
 * M3.8-M13: resolve display id for `GET /matching/result` and readout fusion.
 * Pool binding: only `PairwisePoolFinalizeMeta` rows where `meta.staticTop1CandidateUserId === matchResult.candidateUserId`
 * (batch static Top1 与侧车一致)；否则宁可 fallback，不猜 poolId。
 */
export async function resolveMatchResultDisplay(
  prisma: PrismaService,
  matchRow: MatchResult,
): Promise<MatchResultDisplayFields> {
  const original = matchRow.candidateUserId;
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
