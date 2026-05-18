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
import { applyP76ReadPathDisplayOverlay } from "./p76-read-path-display-resolver";
import type { P76ReadPathDisplayMeta } from "./p76-read-path-display-resolver";

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
  | "rrm_top2_v2_selector_readonly"
  /** P7.6-r8h1: allowlist sidecar read path overlay only (`PEIMA_P76_READ_PATH_ENABLED`). */
  | "p76_allowlist_sidecar_readonly";

/**
 * GET display slice. When `displaySourceType === "rrm_top2_bounded_selector"`, `finalMatchDecisionMeta`
 * is **null** (M5.3-C2.1): do not reuse pairwise-shaped meta; RRM viewer-safe trace is deferred to M5.3-D / M6.1.
 */
export type MatchResultDisplayFields = {
  displayCandidateUserId: string;
  displaySourceType: MatchResultDisplaySourceType;
  finalMatchDecisionMeta: ViewerSafeFinalMatchDecisionMeta | null;
  /** P7.6-r8h1: debug/audit slice when read path env is evaluated (no sidecar internals). */
  p76ReadPathMeta?: P76ReadPathDisplayMeta;
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
  const core = await resolveMatchResultDisplayCore(prisma, matchRow);
  const overlaid = await applyP76ReadPathDisplayOverlay(prisma, {
    viewerUserId: matchRow.userId,
    baselineDisplay: core,
  });
  return {
    ...overlaid,
    displaySourceType: overlaid.displaySourceType as MatchResultDisplaySourceType,
    finalMatchDecisionMeta:
      (overlaid.finalMatchDecisionMeta as ViewerSafeFinalMatchDecisionMeta | null) ??
      null,
  };
}

async function resolveMatchResultDisplayCore(
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

/** M6.5-C1: viewer-safe resolved candidate projection for `GET /matching/result` (no true bounded; no raw RRM meta reads). */
export type MatchResultConsistencyWarning = {
  code: string;
  severity: "info" | "warning" | "blocking";
  message: string;
};

export type ResolvedMatchProjectionFields = {
  baselineCandidateUserId: string;
  displayCandidateUserId: string;
  decisionCandidateUserId: string | null;
  resolvedCandidateUserId: string;
  resolvedSourceType: string;
  decisionSourceType: string | null;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  scoreOwnerCandidateUserId: string;
  explanationOwnerCandidateUserId: string;
  chatTargetUserId: string;
  timelineTargetUserId: string;
  feedbackTargetUserId: string;
  resolvedFinalScore: number | null;
  resolvedScoreOwnerCandidateUserId: string | null;
  resolvedScoreSourceType: string | null;
  scoreProjectionFallbackUsed: boolean;
  scoreProjectionFallbackReason: string | null;
  consistencyWarnings: MatchResultConsistencyWarning[];
};

/**
 * Pure projection from existing display resolver output + baseline.
 * Does not read `matchInsights.rrmDecisionShadow` / `rrmBoundedDecision` for decision switching.
 */
export function buildResolvedMatchProjection(
  baselineCandidateUserId: string,
  display: MatchResultDisplayFields,
  opts: { displayResolverErrored: boolean },
): ResolvedMatchProjectionFields {
  const baseline = baselineCandidateUserId.trim();
  const displayId = display.displayCandidateUserId?.trim() ?? "";

  let resolvedCandidateUserId: string;
  let resolvedSourceType: string;
  let fallbackUsed = false;
  let fallbackReason: string | null = null;
  const consistencyWarnings: MatchResultConsistencyWarning[] = [];

  if (opts.displayResolverErrored) {
    resolvedCandidateUserId = baseline;
    resolvedSourceType = "match_result_original";
    fallbackUsed = true;
    fallbackReason = "display_resolver_failed";
    consistencyWarnings.push({
      code: "resolved_fallback_to_baseline",
      severity: "warning",
      message: "Display resolver failed; using baseline candidate.",
    });
  } else if (displayId) {
    resolvedCandidateUserId = displayId;
    resolvedSourceType = display.displaySourceType;
  } else {
    resolvedCandidateUserId = baseline;
    resolvedSourceType = "match_result_original";
    fallbackUsed = true;
    fallbackReason = "display_missing";
    consistencyWarnings.push({
      code: "resolved_fallback_to_baseline",
      severity: "warning",
      message: "Display candidate missing; using baseline candidate.",
    });
  }

  if (!opts.displayResolverErrored && displayId && displayId !== baseline) {
    consistencyWarnings.push({
      code: "display_candidate_differs_from_candidate_user_id",
      severity: "info",
      message: "Display candidate differs from persisted match result candidate.",
    });
    consistencyWarnings.push({
      code: "score_owner_mismatch",
      severity: "warning",
      message: "Score owner remains baseline candidate until score contract is extended.",
    });
    consistencyWarnings.push({
      code: "explanation_owner_mismatch",
      severity: "warning",
      message: "Explanation owner remains baseline candidate until explanation contract is extended.",
    });
  }

  return {
    baselineCandidateUserId: baseline,
    displayCandidateUserId: displayId || baseline,
    decisionCandidateUserId: null,
    resolvedCandidateUserId,
    resolvedSourceType,
    decisionSourceType: null,
    fallbackUsed,
    fallbackReason,
    scoreOwnerCandidateUserId: baseline,
    explanationOwnerCandidateUserId: baseline,
    chatTargetUserId: resolvedCandidateUserId,
    timelineTargetUserId: resolvedCandidateUserId,
    feedbackTargetUserId: resolvedCandidateUserId,
    resolvedFinalScore: null,
    resolvedScoreOwnerCandidateUserId: baseline,
    resolvedScoreSourceType: null,
    scoreProjectionFallbackUsed: true,
    scoreProjectionFallbackReason: "top2_score_snapshot_missing",
    consistencyWarnings,
  };
}

export type ResolvedScoreProjectionFallbackReason =
  | "top2_score_snapshot_missing"
  | "resolved_candidate_missing"
  | "resolved_candidate_not_in_top2_snapshot"
  | "resolved_score_missing"
  | "malformed_top2_score_snapshot"
  | "unexpected_exception";

type ResolvedScoreProjectionFields = {
  resolvedFinalScore: number | null;
  resolvedScoreOwnerCandidateUserId: string | null;
  resolvedScoreSourceType: string | null;
  scoreProjectionFallbackUsed: boolean;
  scoreProjectionFallbackReason: ResolvedScoreProjectionFallbackReason | null;
  scoreOwnerCandidateUserId: string;
  consistencyWarnings: MatchResultConsistencyWarning[];
};

function withoutWarning(
  list: MatchResultConsistencyWarning[],
  code: string,
): MatchResultConsistencyWarning[] {
  const next = list.filter((w) => w.code !== code);
  return next.length === list.length ? list : next;
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

export function applyResolvedScoreProjection(params: {
  current: ResolvedMatchProjectionFields;
  matchInsights: unknown;
  baselineFinalScore: number | null;
}): ResolvedScoreProjectionFields {
  const { current, matchInsights, baselineFinalScore } = params;
  const baselineOwner = current.baselineCandidateUserId || null;
  const baselineScore = isFiniteNumber(baselineFinalScore) ? baselineFinalScore : null;
  const resolvedCandidate = current.resolvedCandidateUserId?.trim() ?? "";
  const fallback = (
    reason: ResolvedScoreProjectionFallbackReason,
  ): ResolvedScoreProjectionFields => ({
    resolvedFinalScore: baselineScore,
    resolvedScoreOwnerCandidateUserId: baselineOwner,
    resolvedScoreSourceType: null,
    scoreProjectionFallbackUsed: true,
    scoreProjectionFallbackReason: reason,
    scoreOwnerCandidateUserId: current.baselineCandidateUserId,
    consistencyWarnings:
      current.resolvedCandidateUserId !== current.baselineCandidateUserId
        ? withWarning(current.consistencyWarnings, {
            code: "score_owner_mismatch",
            severity: "warning",
            message: "Score owner remains baseline candidate until score contract is extended.",
          })
        : current.consistencyWarnings,
  });

  if (!resolvedCandidate) {
    return fallback("resolved_candidate_missing");
  }

  try {
    const insights = asRecord(matchInsights);
    if (!insights) return fallback("malformed_top2_score_snapshot");
    const snapshot = asRecord(insights.top2ScoreSnapshot);
    if (!snapshot) return fallback("top2_score_snapshot_missing");
    if (
      snapshot.schemaVersion !== 1 ||
      snapshot.sourceType !== "top2_score_snapshot" ||
      snapshot.sourceVersion !== "m6.10-top2-score-snapshot-v1"
    ) {
      return fallback("malformed_top2_score_snapshot");
    }
    const items = Array.isArray(snapshot.items) ? snapshot.items : null;
    if (!items) return fallback("malformed_top2_score_snapshot");
    const hit = items.find((row) => {
      const r = asRecord(row);
      const id = typeof r?.candidateUserId === "string" ? r.candidateUserId.trim() : "";
      return id === resolvedCandidate;
    });
    if (!hit) return fallback("resolved_candidate_not_in_top2_snapshot");
    const rec = asRecord(hit);
    if (!rec) return fallback("malformed_top2_score_snapshot");
    const score = rec.finalScore;
    if (!isFiniteNumber(score)) return fallback("resolved_score_missing");
    const owner =
      (typeof rec.scoreOwnerCandidateUserId === "string" && rec.scoreOwnerCandidateUserId.trim()) ||
      (typeof rec.candidateUserId === "string" && rec.candidateUserId.trim()) ||
      resolvedCandidate;
    return {
      resolvedFinalScore: score,
      resolvedScoreOwnerCandidateUserId: owner,
      resolvedScoreSourceType: "top2_score_snapshot",
      scoreProjectionFallbackUsed: false,
      scoreProjectionFallbackReason: null,
      scoreOwnerCandidateUserId: owner,
      consistencyWarnings:
        owner === current.resolvedCandidateUserId
          ? withoutWarning(current.consistencyWarnings, "score_owner_mismatch")
          : withWarning(current.consistencyWarnings, {
              code: "score_owner_mismatch",
              severity: "warning",
              message: "Score owner remains baseline candidate until score contract is extended.",
            }),
    };
  } catch {
    return fallback("unexpected_exception");
  }
}

export type RrmBoundedReadLayerFallbackReason =
  | "flag_off"
  | "bounded_decision_missing"
  | "bounded_decision_malformed"
  | "incompatible_mode"
  | "decision_not_switch"
  | "would_switch_false"
  | "bounded_target_missing"
  | "bounded_target_user_missing"
  | "bounded_target_profile_missing"
  | "guardrail_blocked"
  | "bounded_fallback_reason_present"
  | "missing_score_shadow_v2"
  | "missing_rrm_decision_shadow"
  | "missing_rrm_v2_selector"
  | "missing_selected_top2"
  | "target_same_as_baseline"
  | "target_outside_top2"
  | "unexpected_exception";

function readM6RrmBoundedDecisionEnabledEnv(): boolean {
  return process.env.PEIMA_M6_RRM_BOUNDED_DECISION_ENABLED === "1";
}

function hasWarning(list: MatchResultConsistencyWarning[], code: string): boolean {
  return list.some((w) => w.code === code);
}

function withWarning(
  list: MatchResultConsistencyWarning[],
  warning: MatchResultConsistencyWarning,
): MatchResultConsistencyWarning[] {
  if (hasWarning(list, warning.code)) return list;
  return [...list, warning];
}

function asRecord(x: unknown): Record<string, unknown> | null {
  return x != null && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}

type UserProfileChecker = {
  hasUser(userId: string): Promise<boolean>;
  hasUserProfile(userId: string): Promise<boolean>;
};

function ensureOwnerMismatchWarnings(next: ResolvedMatchProjectionFields): ResolvedMatchProjectionFields {
  let warnings = next.consistencyWarnings;
  if (next.resolvedCandidateUserId !== next.scoreOwnerCandidateUserId) {
    warnings = withWarning(warnings, {
      code: "score_owner_mismatch",
      severity: "warning",
      message: "Score owner remains baseline candidate until score contract is extended.",
    });
  }
  if (next.resolvedCandidateUserId !== next.explanationOwnerCandidateUserId) {
    warnings = withWarning(warnings, {
      code: "explanation_owner_mismatch",
      severity: "warning",
      message: "Explanation owner remains baseline candidate until explanation contract is extended.",
    });
  }
  if (warnings === next.consistencyWarnings) return next;
  return { ...next, consistencyWarnings: warnings };
}

export async function tryResolveRrmBoundedDecisionReadLayerOverride(
  matchInsights: unknown,
  current: ResolvedMatchProjectionFields,
  checker: UserProfileChecker,
): Promise<ResolvedMatchProjectionFields> {
  if (!readM6RrmBoundedDecisionEnabledEnv()) {
    return current;
  }

  const applyFallback = (reason: RrmBoundedReadLayerFallbackReason): ResolvedMatchProjectionFields => ({
    ...current,
    fallbackUsed: true,
    fallbackReason: current.fallbackUsed ? current.fallbackReason : reason,
    consistencyWarnings: withWarning(current.consistencyWarnings, {
      code: "rrm_bounded_read_layer_fallback",
      severity: "info",
      message: "RRM bounded read-layer override was not applied; baseline projection remains.",
    }),
  });

  try {
    const insights = asRecord(matchInsights);
    if (!insights) return applyFallback("bounded_decision_malformed");

    const bounded = asRecord(insights.rrmBoundedDecision);
    if (!bounded) return applyFallback("bounded_decision_missing");

    if (bounded.schemaVersion !== 1 || bounded.sourceType !== "rrm_bounded_decision") {
      return applyFallback("bounded_decision_malformed");
    }
    if (bounded.sourceVersion !== "m6.3-rrm-bounded-decision-v1") {
      return applyFallback("bounded_decision_malformed");
    }
    if (bounded.mode !== "dry_run") return applyFallback("incompatible_mode");
    if (bounded.decision !== "would_switch_to_rrm") return applyFallback("decision_not_switch");
    if (bounded.wouldSwitch !== true) return applyFallback("would_switch_false");

    if (bounded.fallbackUsed === true || bounded.fallbackReason != null) {
      return applyFallback("bounded_fallback_reason_present");
    }

    const guardrails = asRecord(bounded.guardrails);
    if (guardrails?.blocked === true) return applyFallback("guardrail_blocked");

    const ip = asRecord(bounded.inputPresence);
    if (!ip || ip.scoreShadowV2 !== true) return applyFallback("missing_score_shadow_v2");
    if (ip.rrmDecisionShadow !== true) return applyFallback("missing_rrm_decision_shadow");
    if (ip.rrmV2Top2Selector !== true) return applyFallback("missing_rrm_v2_selector");
    if (ip.selectedTop2 !== true) return applyFallback("missing_selected_top2");

    const boundedRef = asRecord(bounded.boundedRef);
    const target = typeof boundedRef?.id === "string" ? boundedRef.id.trim() : "";
    if (!target) return applyFallback("bounded_target_missing");
    if (target === current.baselineCandidateUserId) return applyFallback("target_same_as_baseline");

    const selector = asRecord(insights.rrmV2Top2Selector);
    const selectedTop2 = Array.isArray(selector?.selectedTop2) ? selector?.selectedTop2 : [];
    if (!selectedTop2.length) return applyFallback("missing_selected_top2");
    const top2Ids = selectedTop2
      .map((r) => (asRecord(r) && typeof r.candidateUserId === "string" ? r.candidateUserId.trim() : ""))
      .filter((x) => x.length > 0);
    if (!top2Ids.includes(target)) return applyFallback("target_outside_top2");

    const userOk = await checker.hasUser(target);
    if (!userOk) return applyFallback("bounded_target_user_missing");
    const profileOk = await checker.hasUserProfile(target);
    if (!profileOk) return applyFallback("bounded_target_profile_missing");

    const activated = ensureOwnerMismatchWarnings({
      ...current,
      decisionCandidateUserId: target,
      decisionSourceType: "rrm_bounded_decision_read_layer",
      resolvedCandidateUserId: target,
      resolvedSourceType: "rrm_bounded_decision_read_layer",
      chatTargetUserId: target,
      timelineTargetUserId: target,
      feedbackTargetUserId: target,
      resolvedFinalScore: current.resolvedFinalScore,
      resolvedScoreOwnerCandidateUserId: current.resolvedScoreOwnerCandidateUserId,
      resolvedScoreSourceType: current.resolvedScoreSourceType,
      scoreProjectionFallbackUsed: current.scoreProjectionFallbackUsed,
      scoreProjectionFallbackReason: current.scoreProjectionFallbackReason,
      fallbackUsed: false,
      fallbackReason: null,
      consistencyWarnings: withWarning(current.consistencyWarnings, {
        code: "rrm_bounded_read_layer_active",
        severity: "info",
        message: "RRM bounded read-layer override is active.",
      }),
    });
    return activated;
  } catch {
    return applyFallback("unexpected_exception");
  }
}
