/**
 * P7.6-r6b: extract stage summaries from prior r3b/r4b/r5b audit JSON (pure parse).
 */

import type {
  P76Stage1PhotoVisualCandidateSummaryV1,
  P76Stage1PhotoVisualSummaryV1,
  P76Stage2TwentyDCandidateSummaryV1,
  P76Stage2TwentyDSummaryV1,
  P76Stage3RrmCandidateSummaryV1,
  P76Stage3RrmSummaryV1,
} from "./p76-end-to-end-funnel-shadow.types";

export const P76_R6B_DEFAULT_STAGE1_SOURCE_VERSION =
  "p7.6-r3-photovisual-first-pool-shadow-v1";

export const P76_R6B_DEFAULT_STAGE2_SOURCE_VERSION =
  "p7.6-r4a-20d-bidirectional-ranking-shadow-v1";

export const P76_R6B_DEFAULT_STAGE3_SOURCE_VERSION =
  "p7.6-r5a-rrm-top2-final-selector-shadow-v1";

export type P76StageAuditJsonExtractV1 = {
  stage1?: Partial<P76Stage1PhotoVisualSummaryV1>;
  stage2?: Partial<P76Stage2TwentyDSummaryV1>;
  stage3?: Partial<P76Stage3RrmSummaryV1>;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

function normalizeId(id: unknown): string | null {
  const v = String(id ?? "").trim();
  return v.length > 0 ? v : null;
}

function normalizeIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const id = normalizeId(item);
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

function readFiniteNumber(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

export function parseP76StageAuditJsonDocument(
  raw: unknown,
): P76StageAuditJsonExtractV1 {
  if (!isRecord(raw)) return {};

  const shadow = isRecord(raw.shadow) ? raw.shadow : raw;
  const out: P76StageAuditJsonExtractV1 = {};

  const stage1Pool = isRecord(shadow.stage1PhotoVisualPool)
    ? shadow.stage1PhotoVisualPool
    : isRecord(shadow.stage1)
      ? shadow.stage1
      : null;

  if (stage1Pool || Array.isArray(raw.selectedCandidateIds)) {
    const selectedCandidateIds = stage1Pool
      ? normalizeIdList(stage1Pool.selectedCandidateIds)
      : normalizeIdList(raw.selectedCandidateIds);

    const pairs = stage1Pool && Array.isArray(stage1Pool.pairs) ? stage1Pool.pairs : [];
    const topCandidatesSummary: P76Stage1PhotoVisualCandidateSummaryV1[] = [];

    for (const pair of pairs) {
      if (!isRecord(pair)) continue;
      const candidateUserId = normalizeId(pair.candidateUserId);
      if (!candidateUserId) continue;
      topCandidatesSummary.push({
        candidateUserId,
        mutualPhotoVisualFit: readFiniteNumber(pair.mutualPhotoVisualFit),
        AtoBPhotoVisualFit: readFiniteNumber(pair.AtoBPhotoVisualFit),
        BtoAPhotoVisualFit: readFiniteNumber(pair.BtoAPhotoVisualFit),
        rank:
          typeof pair.rank === "number" && Number.isFinite(pair.rank)
            ? pair.rank
            : topCandidatesSummary.length + 1,
      });
    }

    topCandidatesSummary.sort((a, b) => {
      if (a.rank > 0 && b.rank > 0 && a.rank !== b.rank) return a.rank - b.rank;
      const am = a.mutualPhotoVisualFit ?? -1;
      const bm = b.mutualPhotoVisualFit ?? -1;
      return bm - am;
    });

    out.stage1 = {
      sourceVersion:
        (typeof stage1Pool?.sourceVersion === "string" &&
          stage1Pool.sourceVersion.trim()) ||
        P76_R6B_DEFAULT_STAGE1_SOURCE_VERSION,
      selectedCandidateIds,
      topCandidatesSummary,
    };
  }

  const stage2 =
    isRecord(shadow.stage2TwentyD) ? shadow.stage2TwentyD : shadow;
  const top2FromDoc = normalizeIdList(
    stage2.top2CandidateIds ?? raw.top2CandidateIds,
  );
  const selected20d = normalizeId(
    stage2.selectedBy20DOnlyCandidateId ?? raw.selectedBy20DOnlyCandidateId,
  );

  if (top2FromDoc.length > 0 || selected20d) {
    const rankedRaw = Array.isArray(stage2.rankedCandidates)
      ? stage2.rankedCandidates
      : [];
    const rankedCandidatesSummary: P76Stage2TwentyDCandidateSummaryV1[] = [];
    for (const row of rankedRaw) {
      if (!isRecord(row)) continue;
      const candidateUserId = normalizeId(row.candidateUserId);
      if (!candidateUserId) continue;
      rankedCandidatesSummary.push({
        candidateUserId,
        mutual20DFit: readFiniteNumber(row.mutual20DFit),
        AtoB20DFit: readFiniteNumber(row.AtoB20DFit),
        BtoA20DFit: readFiniteNumber(row.BtoA20DFit),
        rank:
          typeof row.rank === "number" && Number.isFinite(row.rank)
            ? row.rank
            : rankedCandidatesSummary.length + 1,
      });
    }

    out.stage2 = {
      sourceVersion:
        (typeof stage2.sourceVersion === "string" && stage2.sourceVersion.trim()) ||
        P76_R6B_DEFAULT_STAGE2_SOURCE_VERSION,
      top2CandidateIds: top2FromDoc,
      selectedBy20DOnlyCandidateId: selected20d,
      rankedCandidatesSummary,
    };
  }

  const stage3 = isRecord(shadow.stage3Rrm) ? shadow.stage3Rrm : shadow;
  const selectedRrm = normalizeId(
    stage3.selectedByRrmCandidateId ?? raw.selectedByRrmCandidateId,
  );
  const reasonSummary =
    typeof stage3.reasonSummary === "string"
      ? stage3.reasonSummary
      : typeof raw.reasonSummary === "string"
        ? raw.reasonSummary
        : undefined;

  if (selectedRrm || Array.isArray(stage3.rankedCandidates)) {
    const rankedRaw = Array.isArray(stage3.rankedCandidates)
      ? stage3.rankedCandidates
      : [];
    const rankedCandidatesSummary: P76Stage3RrmCandidateSummaryV1[] = [];
    for (const row of rankedRaw) {
      if (!isRecord(row)) continue;
      const candidateUserId = normalizeId(row.candidateUserId);
      if (!candidateUserId) continue;
      rankedCandidatesSummary.push({
        candidateUserId,
        mutualRrmFit: readFiniteNumber(row.mutualRrmFit),
        AtoBRrmFit: readFiniteNumber(row.AtoBRrmFit),
        BtoARrmFit: readFiniteNumber(row.BtoARrmFit),
        riskFlagCount:
          typeof row.riskFlagCount === "number" && Number.isFinite(row.riskFlagCount)
            ? row.riskFlagCount
            : undefined,
        rank:
          typeof row.rank === "number" && Number.isFinite(row.rank)
            ? row.rank
            : rankedCandidatesSummary.length + 1,
      });
    }

    out.stage3 = {
      sourceVersion:
        (typeof stage3.sourceVersion === "string" && stage3.sourceVersion.trim()) ||
        P76_R6B_DEFAULT_STAGE3_SOURCE_VERSION,
      selectedByRrmCandidateId: selectedRrm,
      rankedCandidatesSummary,
      reasonSummary: reasonSummary ?? "stage3_rrm_from_audit_json",
    };
  }

  return out;
}

export function buildMinimalStage1Summary(
  selectedCandidateIds: string[],
  sourceVersion = P76_R6B_DEFAULT_STAGE1_SOURCE_VERSION,
): P76Stage1PhotoVisualSummaryV1 {
  return {
    sourceVersion,
    selectedCandidateIds,
    topCandidatesSummary: selectedCandidateIds.map((candidateUserId, index) => ({
      candidateUserId,
      mutualPhotoVisualFit: null,
      rank: index + 1,
    })),
  };
}

export function buildMinimalStage2Summary(params: {
  top2CandidateIds: [string, string];
  selectedBy20DOnlyCandidateId: string;
  sourceVersion?: string;
}): P76Stage2TwentyDSummaryV1 {
  return {
    sourceVersion: params.sourceVersion ?? P76_R6B_DEFAULT_STAGE2_SOURCE_VERSION,
    top2CandidateIds: [...params.top2CandidateIds],
    selectedBy20DOnlyCandidateId: params.selectedBy20DOnlyCandidateId,
    rankedCandidatesSummary: params.top2CandidateIds.map(
      (candidateUserId, index) => ({
        candidateUserId,
        mutual20DFit: null,
        rank: index + 1,
      }),
    ),
  };
}

export function buildMinimalStage3Summary(params: {
  selectedByRrmCandidateId: string;
  top2CandidateIds: [string, string];
  reasonSummary?: string;
  sourceVersion?: string;
}): P76Stage3RrmSummaryV1 {
  return {
    sourceVersion: params.sourceVersion ?? P76_R6B_DEFAULT_STAGE3_SOURCE_VERSION,
    selectedByRrmCandidateId: params.selectedByRrmCandidateId,
    rankedCandidatesSummary: params.top2CandidateIds.map(
      (candidateUserId, index) => ({
        candidateUserId,
        mutualRrmFit: null,
        rank: index + 1,
      }),
    ),
    reasonSummary: params.reasonSummary ?? "stage3_rrm_from_cli_fixture",
  };
}
