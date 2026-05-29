/**
 * M5.5-M2 — controlled writer for `MatchResultRrmTop2DisplayMeta` (+ optional `rrmSimReadonlySummary`).
 * Not wired to GET, worker, or matching HTTP. Gate: `readM5RrmTop2MetaWriteEnabled()`.
 */

import type { Prisma } from "@peima/database";
import type { MatchResult } from "@peima/database";
import { readM5RrmSimReadonlySummaryWriteEnabled } from "./matching-m5-rrm-sim-readonly-summary-write-env";
import { mergeRrmSimReadonlySummaryIntoMatchInsights, tryParseRrmSimReadonlySummaryPayloadV1FromMatchInsights } from "./matching-rrm-sim-readonly-summary";
import { writeRrmSimReadonlySummaryToMatchResult } from "./matching-rrm-sim-readonly-summary-writer";
import { readM5RrmTop2MetaWriteEnabled } from "./matching-rrm-top2-display-meta-write-env";
import { parseMatchResultRrmTop2DisplayMetaV1Loose } from "./rrm-top2-display-meta.parser";
import { validateRrmTop2DisplayEligibility } from "./rrm-top2-display-eligibility";
import {
  MATCH_RESULT_RRM_TOP2_DISPLAY_META_SCHEMA_VERSION,
  MATCH_RESULT_RRM_TOP2_DISPLAY_META_SOURCE_TYPE,
  type RrmTop2DisplayMetaGuardrailsV1,
} from "./rrm-top2-display-meta.types";
import type { RrmTop2DisplayNoOpReasonCode } from "./rrm-top2-display-eligibility";
import type { RrmSimReadonlySummaryPayloadV1 } from "./matching-rrm-sim-readonly-summary";

/** Default `meta.sourceVersion` / table `sourceVersion` when caller omits custom string. */
export const RRM_TOP2_DISPLAY_META_WRITER_DEFAULT_SOURCE_VERSION = "m5.5-m2-rrm-top2-meta-writer-v1" as const;

export type RrmTop2MetaWriterNoOpReason =
  | RrmTop2DisplayNoOpReasonCode
  | "match_result_missing"
  | "writer_disabled"
  | "existing_meta_frozen"
  | "static_top2_missing"
  | "top2_fingerprint_missing"
  | "rrm_summary_missing"
  | "rrm_summary_invalid"
  | "summary_write_disabled"
  | "summary_write_failed"
  | "guardrails_invalid"
  | "meta_schema_invalid"
  | "proposed_user_not_found";

export type WriteRrmTop2DisplayMetaForMatchResultPrisma = {
  matchResult: {
    findUnique: (args: { where: { id: string } }) => Promise<MatchResult | null>;
    update: (args: {
      where: { id: string };
      data: { matchInsights?: Prisma.InputJsonValue };
    }) => Promise<unknown>;
  };
  matchResultRrmTop2DisplayMeta: {
    findUnique: (args: {
      where: { matchResultId: string };
    }) => Promise<{ frozen: boolean; meta: unknown } | null>;
    upsert: (args: {
      where: { matchResultId: string };
      create: {
        matchResultId: string;
        viewerUserId: string;
        schemaVersion: number;
        sourceVersion: string;
        top2Fingerprint: string;
        frozen: boolean;
        frozenAt: Date;
        meta: Prisma.InputJsonValue;
      };
      update: {
        viewerUserId: string;
        schemaVersion: number;
        sourceVersion: string;
        top2Fingerprint: string;
        frozen: boolean;
        frozenAt: Date;
        meta: Prisma.InputJsonValue;
      };
    }) => Promise<unknown>;
  };
  user: {
    findUnique: (args: {
      where: { id: string };
      select: { id: true };
    }) => Promise<{ id: string } | null>;
  };
};

export type WriteRrmTop2DisplayMetaForMatchResultInput = {
  prisma: WriteRrmTop2DisplayMetaForMatchResultPrisma;
  matchResultId: string;
  /** Two distinct user ids including `MatchResult.candidateUserId` (static Top2). */
  staticTop2CandidateUserIds: readonly [string, string];
  top2Fingerprint: string;
  guardrails: RrmTop2DisplayMetaGuardrailsV1;
  /** Table + JSON `meta.sourceVersion`; default `RRM_TOP2_DISPLAY_META_WRITER_DEFAULT_SOURCE_VERSION`. */
  sourceVersion?: string;
  /** Override env (tests). */
  metaWriteEnabled?: boolean;
  /** Override env for summary persistence (tests). */
  summaryWriteEnabled?: boolean;
  /** When true, no DB writes (summary + meta). */
  dryRun?: boolean;
  /**
   * Mode 2: persist summary before meta (`writeRrmSimReadonlySummaryToMatchResult`).
   * Apply path: requires `summaryWriteEnabled` (or env); dry-run uses merged insights for validation only.
   */
  rrmSimReadonlySummaryPayload?: RrmSimReadonlySummaryPayloadV1;
  clock?: { nowIso: () => string };
};

export type WriteRrmTop2DisplayMetaForMatchResultResult = {
  ok: boolean;
  dryRun: boolean;
  wroteSummary: boolean;
  wroteMeta: boolean;
  noOpReasonCode: RrmTop2MetaWriterNoOpReason | null;
  matchResultId: string;
  sourceVersion: string;
  displayCandidateUserId: string | null;
  candidateUserIdUnchanged: boolean;
  finalScoreUnchanged: boolean;
};

function norm(s: string): string {
  return s.trim();
}

function isExplicitPassGuardrails(g: RrmTop2DisplayMetaGuardrailsV1 | undefined): boolean {
  if (!g || g.status !== "pass") return false;
  if (!Array.isArray(g.blockReasons) || g.blockReasons.length > 0) return false;
  if (!Array.isArray(g.cautionReasons) || g.cautionReasons.length > 0) return false;
  return true;
}

function normalizeStaticTop2(
  matchBaseline: string,
  a: string,
  b: string,
): { ok: true; baseline: string; peer: string } | { ok: false; reason: RrmTop2MetaWriterNoOpReason } {
  const x = norm(a);
  const y = norm(b);
  const base = norm(matchBaseline);
  if (!x || !y) {
    return { ok: false, reason: "static_top2_missing" };
  }
  if (x === y) {
    return { ok: false, reason: "top2_duplicate" };
  }
  const set = new Set([x, y]);
  if (!set.has(base)) {
    return { ok: false, reason: "baseline_mismatch" };
  }
  const peer = x === base ? y : x;
  return { ok: true, baseline: base, peer };
}

function insightsForWriterEligibility(
  row: MatchResult,
  payload: RrmSimReadonlySummaryPayloadV1 | undefined,
  dryRun: boolean,
  summaryEnabled: boolean,
): unknown {
  if (payload === undefined) {
    return row.matchInsights;
  }
  if (dryRun || summaryEnabled) {
    return mergeRrmSimReadonlySummaryIntoMatchInsights(row.matchInsights, payload);
  }
  return row.matchInsights;
}

type EligPass = {
  summaryParsed: NonNullable<ReturnType<typeof tryParseRrmSimReadonlySummaryPayloadV1FromMatchInsights>>;
  metaJson: Record<string, unknown>;
  parsedMeta: NonNullable<ReturnType<typeof parseMatchResultRrmTop2DisplayMetaV1Loose>>;
  top2: { baseline: string; peer: string };
};

function tryEligibilityPass(args: {
  row: MatchResult;
  insights: unknown;
  top2: { baseline: string; peer: string };
  fp: string;
  guardrails: RrmTop2DisplayMetaGuardrailsV1;
  sourceVersion: string;
  nowIso: string;
  /** When true and parse fails, use `rrm_summary_invalid` instead of `rrm_summary_missing`. */
  summaryPayloadProvided: boolean;
}): { ok: true; data: EligPass } | { ok: false; reason: RrmTop2MetaWriterNoOpReason } {
  const summaryParsed = tryParseRrmSimReadonlySummaryPayloadV1FromMatchInsights(args.insights);
  if (!summaryParsed) {
    return {
      ok: false,
      reason: args.summaryPayloadProvided ? "rrm_summary_invalid" : "rrm_summary_missing",
    };
  }

  const metaJson: Record<string, unknown> = {
    schemaVersion: MATCH_RESULT_RRM_TOP2_DISPLAY_META_SCHEMA_VERSION,
    sourceType: MATCH_RESULT_RRM_TOP2_DISPLAY_META_SOURCE_TYPE,
    sourceVersion: args.sourceVersion,
    baselineCandidateUserId: args.top2.baseline,
    previousDisplayCandidateUserId: args.top2.baseline,
    newDisplayCandidateUserId: norm(summaryParsed.winnerUserId),
    decisionRule: "rrm_top2_bounded_selector",
    top2Fingerprint: args.fp,
    appliedToFinalScore: false,
    appliedToWorkerRanking: false,
    rollbackAvailable: true,
    frozenAt: args.nowIso,
    guardrails: args.guardrails,
  };

  const parsedMeta = parseMatchResultRrmTop2DisplayMetaV1Loose(metaJson);
  if (!parsedMeta) {
    return { ok: false, reason: "meta_schema_invalid" };
  }

  const elig = validateRrmTop2DisplayEligibility({
    m5RrmTop2Enabled: true,
    matchResultCandidateUserId: args.row.candidateUserId,
    top2CandidateUserIds: [args.top2.baseline, args.top2.peer] as const,
    top2Fingerprint: args.fp,
    rrmDisplayMeta: parsedMeta,
    rowTop2Fingerprint: args.fp,
    rrmSimReadonlySummary: summaryParsed,
  });

  if (!elig.ok) {
    return { ok: false, reason: elig.noOpReasonCode };
  }

  return { ok: true, data: { summaryParsed, metaJson, parsedMeta, top2: args.top2 } };
}

export async function writeRrmTop2DisplayMetaForMatchResult(
  input: WriteRrmTop2DisplayMetaForMatchResultInput,
): Promise<WriteRrmTop2DisplayMetaForMatchResultResult> {
  const mid = norm(input.matchResultId);
  const sourceVersion = norm(input.sourceVersion ?? "") || RRM_TOP2_DISPLAY_META_WRITER_DEFAULT_SOURCE_VERSION;
  const dryRun = input.dryRun === true;
  const metaEnabled = input.metaWriteEnabled ?? readM5RrmTop2MetaWriteEnabled();
  const summaryEnabled = input.summaryWriteEnabled ?? readM5RrmSimReadonlySummaryWriteEnabled();
  const nowIso = input.clock?.nowIso?.() ?? new Date().toISOString();

  const baseResult = (
    partial: Omit<Partial<WriteRrmTop2DisplayMetaForMatchResultResult>, "matchResultId" | "sourceVersion"> & {
      matchResultId?: string;
    },
  ): WriteRrmTop2DisplayMetaForMatchResultResult => ({
    ok: partial.ok ?? false,
    dryRun,
    wroteSummary: partial.wroteSummary ?? false,
    wroteMeta: partial.wroteMeta ?? false,
    noOpReasonCode: partial.noOpReasonCode ?? null,
    matchResultId: partial.matchResultId ?? mid,
    sourceVersion,
    displayCandidateUserId: partial.displayCandidateUserId ?? null,
    candidateUserIdUnchanged: partial.candidateUserIdUnchanged ?? true,
    finalScoreUnchanged: partial.finalScoreUnchanged ?? true,
  });

  if (!mid) {
    return baseResult({ ok: false, noOpReasonCode: "match_result_missing", matchResultId: "" });
  }

  const row = await input.prisma.matchResult.findUnique({ where: { id: mid } });
  if (!row) {
    return baseResult({ ok: false, noOpReasonCode: "match_result_missing" });
  }

  const snapCandidate = row.candidateUserId;
  const snapFinal = row.finalScore;

  if (!metaEnabled) {
    return baseResult({
      ok: false,
      noOpReasonCode: "writer_disabled",
      candidateUserIdUnchanged: true,
      finalScoreUnchanged: true,
    });
  }

  const existingSidecar = await input.prisma.matchResultRrmTop2DisplayMeta.findUnique({
    where: { matchResultId: mid },
  });
  if (existingSidecar?.frozen === true) {
    return baseResult({
      ok: false,
      noOpReasonCode: "existing_meta_frozen",
      candidateUserIdUnchanged: true,
      finalScoreUnchanged: true,
    });
  }

  if (!isExplicitPassGuardrails(input.guardrails)) {
    return baseResult({
      ok: false,
      noOpReasonCode: "guardrails_invalid",
      candidateUserIdUnchanged: true,
      finalScoreUnchanged: true,
    });
  }

  const fp = norm(input.top2Fingerprint);
  if (!fp) {
    return baseResult({
      ok: false,
      noOpReasonCode: "top2_fingerprint_missing",
      candidateUserIdUnchanged: true,
      finalScoreUnchanged: true,
    });
  }

  const top2 = normalizeStaticTop2(
    row.candidateUserId,
    input.staticTop2CandidateUserIds[0],
    input.staticTop2CandidateUserIds[1],
  );
  if (!top2.ok) {
    return baseResult({
      ok: false,
      noOpReasonCode: top2.reason,
      candidateUserIdUnchanged: true,
      finalScoreUnchanged: true,
    });
  }

  if (input.rrmSimReadonlySummaryPayload !== undefined && !dryRun && !summaryEnabled) {
    const onDisk = tryParseRrmSimReadonlySummaryPayloadV1FromMatchInsights(row.matchInsights);
    if (!onDisk) {
      return baseResult({
        ok: false,
        noOpReasonCode: "summary_write_disabled",
        candidateUserIdUnchanged: true,
        finalScoreUnchanged: true,
      });
    }
  }

  const insightsPass1 = insightsForWriterEligibility(
    row,
    input.rrmSimReadonlySummaryPayload,
    dryRun,
    summaryEnabled,
  );
  const pass1 = tryEligibilityPass({
    row,
    insights: insightsPass1,
    top2,
    fp,
    guardrails: input.guardrails,
    sourceVersion,
    nowIso,
    summaryPayloadProvided: input.rrmSimReadonlySummaryPayload !== undefined,
  });
  if (!pass1.ok) {
    return baseResult({
      ok: false,
      noOpReasonCode: pass1.reason,
      candidateUserIdUnchanged: true,
      finalScoreUnchanged: true,
    });
  }

  const displayId = norm(pass1.data.parsedMeta.newDisplayCandidateUserId);
  const userOk = await input.prisma.user.findUnique({
    where: { id: displayId },
    select: { id: true },
  });
  if (!userOk) {
    return baseResult({
      ok: false,
      noOpReasonCode: "proposed_user_not_found",
      candidateUserIdUnchanged: true,
      finalScoreUnchanged: true,
    });
  }

  if (dryRun) {
    return baseResult({
      ok: true,
      wroteSummary: false,
      wroteMeta: false,
      noOpReasonCode: null,
      displayCandidateUserId: displayId,
      candidateUserIdUnchanged: true,
      finalScoreUnchanged: true,
    });
  }

  let wroteSummary = false;
  let rowCurrent: MatchResult = row;
  let metaPayload = pass1.data;

  if (input.rrmSimReadonlySummaryPayload !== undefined && summaryEnabled) {
    const wr = await writeRrmSimReadonlySummaryToMatchResult({
      matchResultId: mid,
      existingMatchInsights: row.matchInsights,
      incomingSummary: input.rrmSimReadonlySummaryPayload,
      writeEnabled: true,
      prisma: { matchResult: { update: input.prisma.matchResult.update } },
    });
    if (!wr.written) {
      const code: RrmTop2MetaWriterNoOpReason =
        wr.reason === "disabled"
          ? "summary_write_disabled"
          : wr.reason === "invalid_summary"
            ? "rrm_summary_invalid"
            : "summary_write_failed";
      return baseResult({
        ok: false,
        noOpReasonCode: code,
        candidateUserIdUnchanged: true,
        finalScoreUnchanged: true,
      });
    }
    wroteSummary = true;
    const reloaded = await input.prisma.matchResult.findUnique({ where: { id: mid } });
    if (!reloaded) {
      return baseResult({
        ok: false,
        noOpReasonCode: "match_result_missing",
        wroteSummary: true,
      });
    }
    rowCurrent = reloaded;

    const pass2 = tryEligibilityPass({
      row: rowCurrent,
      insights: rowCurrent.matchInsights,
      top2,
      fp,
      guardrails: input.guardrails,
      sourceVersion,
      nowIso,
      summaryPayloadProvided: true,
    });
    if (!pass2.ok) {
      return baseResult({
        ok: false,
        noOpReasonCode: pass2.reason,
        wroteSummary: true,
        candidateUserIdUnchanged: rowCurrent.candidateUserId === snapCandidate,
        finalScoreUnchanged: rowCurrent.finalScore === snapFinal,
      });
    }
    metaPayload = pass2.data;
  }

  await input.prisma.matchResultRrmTop2DisplayMeta.upsert({
    where: { matchResultId: mid },
    create: {
      matchResultId: mid,
      viewerUserId: rowCurrent.userId,
      schemaVersion: MATCH_RESULT_RRM_TOP2_DISPLAY_META_SCHEMA_VERSION,
      sourceVersion,
      top2Fingerprint: fp,
      frozen: true,
      frozenAt: new Date(),
      meta: metaPayload.metaJson as Prisma.InputJsonValue,
    },
    update: {
      viewerUserId: rowCurrent.userId,
      schemaVersion: MATCH_RESULT_RRM_TOP2_DISPLAY_META_SCHEMA_VERSION,
      sourceVersion,
      top2Fingerprint: fp,
      frozen: true,
      frozenAt: new Date(),
      meta: metaPayload.metaJson as Prisma.InputJsonValue,
    },
  });

  const rowAfter = await input.prisma.matchResult.findUnique({ where: { id: mid } });
  const candOk = rowAfter?.candidateUserId === snapCandidate;
  const scoreOk = rowAfter?.finalScore === snapFinal;

  return baseResult({
    ok: true,
    wroteSummary,
    wroteMeta: true,
    noOpReasonCode: null,
    displayCandidateUserId: displayId,
    candidateUserIdUnchanged: candOk,
    finalScoreUnchanged: scoreOk,
  });
}
