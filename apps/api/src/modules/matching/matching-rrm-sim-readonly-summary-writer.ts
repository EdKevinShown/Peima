/**
 * M5.2-M2B — controlled DB write for `MatchResult.matchInsights.rrmSimReadonlySummary` only.
 * Does not alter `candidateUserId`, `finalScore`, or any display fields.
 *
 * No production call sites in-repo yet (`matchResult.update` is otherwise unused in API);
 * invoke from a future job/admin path when `matchResultId`, `existingMatchInsights`, and a
 * viewer-safe payload from M5.2-M2A builders are all available.
 */

import type { Prisma } from "@peima/database";
import {
  mergeRrmSimReadonlySummaryIntoMatchInsights,
  RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY,
  type RrmSimReadonlySummaryPayloadV1,
} from "./matching-rrm-sim-readonly-summary";
import { tryParseRrmSimReadonlySummaryFromMatchInsights } from "./matching-multi-source-final-decision-m51m0";

export type WriteRrmSimReadonlySummaryReason =
  | "disabled"
  | "invalid_summary"
  | "frozen_existing_summary"
  | "updated";

export type WriteRrmSimReadonlySummaryResult = {
  written: boolean;
  reason: WriteRrmSimReadonlySummaryReason;
  sourceVersion: string | null;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function existingRrmSummaryFrozen(matchInsights: unknown): boolean {
  if (!isRecord(matchInsights)) return false;
  const raw = matchInsights[RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY];
  if (!isRecord(raw)) return false;
  const fz = raw.frozenAt;
  return typeof fz === "string" && fz.trim().length > 0;
}

export type MatchResultMatchInsightsUpdateClient = {
  matchResult: {
    update: (args: {
      where: { id: string };
      data: { matchInsights: Prisma.InputJsonValue };
    }) => Promise<unknown>;
  };
};

/**
 * Validates `incomingSummary` with the same rules as GET-side hydration (`tryParse` after merge).
 * When `writeEnabled` is false, returns immediately without calling `prisma`.
 * When an existing summary has non-empty `frozenAt`, skips overwrite.
 */
export async function writeRrmSimReadonlySummaryToMatchResult(params: {
  matchResultId: string;
  existingMatchInsights: unknown;
  incomingSummary: unknown;
  writeEnabled: boolean;
  prisma: MatchResultMatchInsightsUpdateClient;
}): Promise<WriteRrmSimReadonlySummaryResult> {
  if (!params.writeEnabled) {
    return { written: false, reason: "disabled", sourceVersion: null };
  }

  const incomingOk = tryParseRrmSimReadonlySummaryFromMatchInsights(
    mergeRrmSimReadonlySummaryIntoMatchInsights(null, params.incomingSummary as RrmSimReadonlySummaryPayloadV1),
  );
  if (!incomingOk) {
    return { written: false, reason: "invalid_summary", sourceVersion: null };
  }

  if (existingRrmSummaryFrozen(params.existingMatchInsights)) {
    return { written: false, reason: "frozen_existing_summary", sourceVersion: null };
  }

  const nextMatchInsights = mergeRrmSimReadonlySummaryIntoMatchInsights(
    params.existingMatchInsights,
    params.incomingSummary as RrmSimReadonlySummaryPayloadV1,
  );
  const parsedNext = tryParseRrmSimReadonlySummaryFromMatchInsights(nextMatchInsights);
  if (!parsedNext) {
    return { written: false, reason: "invalid_summary", sourceVersion: null };
  }

  await params.prisma.matchResult.update({
    where: { id: params.matchResultId.trim() },
    data: { matchInsights: nextMatchInsights as unknown as Prisma.InputJsonValue },
  });

  return {
    written: true,
    reason: "updated",
    sourceVersion: parsedNext.sourceVersion,
  };
}
