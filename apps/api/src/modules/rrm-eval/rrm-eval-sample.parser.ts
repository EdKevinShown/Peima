import { buildRrmObservedSignalSummary } from "../rrm-observed";
import { tryParseRrmSimReadonlySummaryFromMatchInsights } from "../matching/matching-multi-source-final-decision-m51m0";
import {
  RRM_EVAL_COLD_DROPOFF_HOURS,
  RRM_EVAL_COLD_RISK_THRESHOLD,
  RRM_EVAL_MIN_MESSAGES_FOR_COLD_PROXY,
} from "./rrm-eval.constants";
import type { RrmEvalSampleRecord } from "./rrm-eval.types";

const COLD_DROPOFF_MS = RRM_EVAL_COLD_DROPOFF_HOURS * 3600_000;

function isRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

function toTimeMs(d: Date | string): number {
  if (d instanceof Date) return d.getTime();
  const t = Date.parse(d);
  return Number.isFinite(t) ? t : 0;
}

function parseCautionFromMatchInsights(matchInsights: unknown): boolean {
  if (!isRecord(matchInsights)) return false;
  const sim = tryParseRrmSimReadonlySummaryFromMatchInsights(matchInsights);
  if (sim?.fallbackUsed) return true;
  if (sim && sim.cautionFlags.length > 0) return true;

  const bd = matchInsights.rrmBoundedDecision;
  if (isRecord(bd) && bd.decision === "fallback_baseline") return true;

  const ds = matchInsights.rrmDecisionShadow;
  if (isRecord(ds) && isRecord(ds.guardrails)) {
    const status = typeof ds.guardrails.status === "string" ? ds.guardrails.status : "";
    if (status === "caution" || ds.guardrails.blocked === true) return true;
  }

  const ms = matchInsights.multiSourceFinalDecisionM51M0;
  if (isRecord(ms) && isRecord(ms.guardrails)) {
    const status = typeof ms.guardrails.status === "string" ? ms.guardrails.status : "";
    if (status === "caution" || status === "block") return true;
  }

  return false;
}

function parseRrmSupported(matchInsights: unknown, candidateUserId: string): boolean {
  if (!isRecord(matchInsights)) return false;
  const bd = matchInsights.rrmBoundedDecision;
  if (isRecord(bd) && bd.decision === "would_switch_to_rrm") return true;

  const sim = tryParseRrmSimReadonlySummaryFromMatchInsights(matchInsights);
  if (!sim) return false;
  const winner = sim.candidateUserId?.trim();
  if (!winner || winner !== candidateUserId) return false;
  return !sim.fallbackUsed;
}

function feedbackNegative(feedback: {
  rating: number | null;
  structuredPayload: unknown;
}): boolean {
  if (feedback.rating != null && feedback.rating <= 2) return true;
  if (!isRecord(feedback.structuredPayload)) return false;
  const overall = feedback.structuredPayload.overallRating;
  if (typeof overall === "number" && overall <= 2) return true;
  const comfort = feedback.structuredPayload.comfortLevel;
  if (typeof comfort === "number" && comfort <= 2) return true;
  return false;
}

function feedbackPositive(feedback: {
  rating: number | null;
  structuredPayload: unknown;
}): boolean {
  if (feedback.rating != null && feedback.rating >= 4) return true;
  if (!isRecord(feedback.structuredPayload)) return false;
  const overall = feedback.structuredPayload.overallRating;
  if (typeof overall === "number" && overall >= 4) return true;
  const intent = feedback.structuredPayload.continueIntent;
  if (typeof intent === "number" && intent >= 4) return true;
  return false;
}

function feedbackHelpful(feedback: {
  rating: number | null;
  tags: string[];
  structuredPayload: unknown;
}): boolean {
  if (feedback.tags.some((t) => /helpful|有用/i.test(t))) return true;
  return feedbackPositive(feedback);
}

export type RrmEvalCollectorRow = {
  matchInsights: unknown;
  candidateUserId: string;
  conversation: {
    viewerUserId: string;
    counterpartyUserId: string;
    messages: Array<{ senderUserId: string; content: string; createdAt: Date }>;
  } | null;
  feedbacks: Array<{
    rating: number | null;
    tags: string[];
    structuredPayload: unknown;
  }>;
};

export function parseRrmEvalSampleFromRow(row: RrmEvalCollectorRow): RrmEvalSampleRecord {
  const hasRrmSimSummary =
    tryParseRrmSimReadonlySummaryFromMatchInsights(row.matchInsights) != null;
  const sim = tryParseRrmSimReadonlySummaryFromMatchInsights(row.matchInsights);
  const simulatedRhythmScore = sim?.simulatedRhythmScore ?? null;

  const rrmSupported = parseRrmSupported(row.matchInsights, row.candidateUserId);
  const cautionBucket = parseCautionFromMatchInsights(row.matchInsights);

  let observedRhythmProxy: number | null = null;
  let predictedColdRisk = false;
  let actualColdDropoff = false;
  let positiveOutcome = false;
  let negativeOutcome = false;

  const conv = row.conversation;
  if (conv && conv.messages.length > 0) {
    const observed = buildRrmObservedSignalSummary({
      conversationId: "eval",
      viewerUserId: conv.viewerUserId,
      counterpartyUserId: conv.counterpartyUserId,
      messages: conv.messages.map((m) => ({
        senderUserId: m.senderUserId,
        content: m.content,
        createdAt: m.createdAt,
      })),
    });
    if (!observed.insufficientData) {
      observedRhythmProxy = Math.round((1 - observed.coldRisk) * 100);
      predictedColdRisk = observed.coldRisk >= RRM_EVAL_COLD_RISK_THRESHOLD;
    }

    const sorted = [...conv.messages].sort(
      (a, b) => toTimeMs(a.createdAt) - toTimeMs(b.createdAt),
    );
    const lastAt = toTimeMs(sorted[sorted.length - 1]!.createdAt);
    const hoursSinceLast = (Date.now() - lastAt) / 3600_000;
    if (
      sorted.length >= RRM_EVAL_MIN_MESSAGES_FOR_COLD_PROXY &&
      hoursSinceLast >= RRM_EVAL_COLD_DROPOFF_HOURS
    ) {
      actualColdDropoff = true;
    }
    if (sorted.length >= 10) positiveOutcome = true;
  }

  for (const fb of row.feedbacks) {
    if (feedbackNegative(fb)) negativeOutcome = true;
    if (feedbackPositive(fb)) positiveOutcome = true;
  }

  const hasConversationFeedback = row.feedbacks.length > 0;
  const assistantHelpful =
    hasConversationFeedback && row.feedbacks.some((fb) => feedbackHelpful(fb));

  return {
    hasConversation: conv != null && conv.messages.length > 0,
    hasRrmSimSummary,
    rrmSupported,
    cautionBucket,
    negativeOutcome,
    positiveOutcome,
    simulatedRhythmScore,
    observedRhythmProxy,
    predictedColdRisk,
    actualColdDropoff,
    hasConversationFeedback,
    assistantHelpful,
  };
}
