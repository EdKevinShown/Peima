import { RRM_ADAPTER_LAYER, RRM_SIGNAL_SUMMARY_SCHEMA_VERSION, RRM_SOURCE_VERSION_OBSERVED } from "../rrm-shared";
import {
  RRM_OBSERVED_MAX_CONTENT_CHARS_FOR_ANALYSIS,
  RRM_OBSERVED_MIN_MESSAGE_COUNT,
  RRM_OBSERVED_MIN_MESSAGES_PER_PARTY,
} from "./rrm-observed.constants";
import type {
  BuildRrmObservedSignalSummaryInput,
  RrmObservedMessageInput,
  RrmObservedSignalSummaryV1,
  RrmObservedSuggestedAction,
} from "./rrm-observed.types";

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function normalizeContent(content: string): string {
  return content.trim().slice(0, RRM_OBSERVED_MAX_CONTENT_CHARS_FOR_ANALYSIS);
}

function toTimeMs(createdAt: string | Date): number {
  if (createdAt instanceof Date) return createdAt.getTime();
  const t = Date.parse(createdAt);
  return Number.isFinite(t) ? t : 0;
}

const ADVANCEMENT_PATTERNS: RegExp[] = [
  /见面|线下|出来|咖啡|吃饭|约会|invite|meet\s+up/i,
  /喜欢你喜欢我|在一起|交往|表白/i,
  /今晚|明天|周末|什么时候有空/i,
  /怎么不回|为什么不回|回我|别晾/i,
];

const RISK_PATTERNS: RegExp[] = [
  /必须|一定要|不然就|威胁|举报|拉黑/i,
  /逼你|给我发|马上回/i,
];

const AGGRESSIVE_PATTERNS: RegExp[] = [
  /快点|赶紧|别磨叽|烦死了/i,
];

function countPartyMessages(
  messages: RrmObservedMessageInput[],
  userId: string,
): number {
  return messages.filter((m) => m.senderUserId === userId).length;
}

function detectAdvancement(text: string): boolean {
  return ADVANCEMENT_PATTERNS.some((re) => re.test(text));
}

function computePace(sorted: RrmObservedMessageInput[]): "slow" | "steady" | "fast" | "unknown" {
  if (sorted.length < 2) return "unknown";
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const dt = toTimeMs(sorted[i]!.createdAt) - toTimeMs(sorted[i - 1]!.createdAt);
    if (dt > 0) gaps.push(dt);
  }
  if (gaps.length === 0) return "unknown";
  const median = gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)]!;
  const hour = 3600_000;
  if (median > 24 * hour) return "slow";
  if (median < 2 * hour) return "fast";
  return "steady";
}

function suggestAction(params: {
  coldRisk: number;
  R_obs: number;
  advancementDetected: boolean;
}): RrmObservedSuggestedAction {
  if (params.R_obs >= 0.55 || params.coldRisk >= 0.65) return "slow_down";
  if (params.advancementDetected) return "continue_lightly";
  if (params.coldRisk >= 0.4) return "pause";
  return "maintain";
}

/**
 * Pure Observed signal adapter (M5.1-r5). No DB, no LLM, no RFI_obs.
 */
export function buildRrmObservedSignalSummary(
  input: BuildRrmObservedSignalSummaryInput,
): RrmObservedSignalSummaryV1 {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const sorted = [...input.messages].sort(
    (a, b) => toTimeMs(a.createdAt) - toTimeMs(b.createdAt),
  );
  const messageCount = sorted.length;
  const viewerMessageCount = countPartyMessages(sorted, input.viewerUserId);
  const counterpartyMessageCount = countPartyMessages(sorted, input.counterpartyUserId);

  const insufficient =
    messageCount < RRM_OBSERVED_MIN_MESSAGE_COUNT ||
    viewerMessageCount < RRM_OBSERVED_MIN_MESSAGES_PER_PARTY ||
    counterpartyMessageCount < RRM_OBSERVED_MIN_MESSAGES_PER_PARTY;

  if (insufficient) {
    return {
      schemaVersion: RRM_SIGNAL_SUMMARY_SCHEMA_VERSION,
      sourceVersion: RRM_SOURCE_VERSION_OBSERVED,
      layer: RRM_ADAPTER_LAYER.ADAPTER,
      mode: "signal_summary_only",
      fallbackUsed: true,
      insufficientData: true,
      unavailableReason: "insufficient_data",
      generatedAt,
      conversationId: input.conversationId,
      messageCount,
      viewerMessageCount,
      counterpartyMessageCount,
      advancementDetected: false,
      S_obs: 0,
      E_obs: 0,
      F_obs: 0,
      Q_obs: 0,
      D_obs: 0,
      R_obs: 0,
      coldRisk: 0,
      pace: "unknown",
      suggestedAction: "maintain",
    };
  }

  const corpus = sorted.map((m) => normalizeContent(m.content)).join("\n");
  const advancementDetected = detectAdvancement(corpus);

  let alternations = 0;
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i]!.senderUserId !== sorted[i - 1]!.senderUserId) alternations += 1;
  }
  const S_obs = clamp01(alternations / Math.max(1, sorted.length - 1));

  const aggressiveHits = AGGRESSIVE_PATTERNS.filter((re) => re.test(corpus)).length;
  const E_obs = clamp01(1 - aggressiveHits * 0.35);

  const spanMs =
    sorted.length >= 2
      ? toTimeMs(sorted[sorted.length - 1]!.createdAt) - toTimeMs(sorted[0]!.createdAt)
      : 0;
  const spanDays = spanMs > 0 ? spanMs / (24 * 3600_000) : 0;
  const F_obs = clamp01(
    Math.min(1, messageCount / 12) * 0.5 +
      (viewerMessageCount > 0 && counterpartyMessageCount > 0 ? 0.35 : 0) +
      Math.min(0.15, spanDays / 7),
  );

  const avgLen =
    sorted.reduce((acc, m) => acc + normalizeContent(m.content).length, 0) / messageCount;
  const questionRatio =
    sorted.filter((m) => /[?？]/.test(m.content)).length / messageCount;
  const Q_obs = clamp01(Math.min(1, avgLen / 80) * 0.7 + questionRatio * 0.3);

  const oneWordRatio =
    sorted.filter((m) => normalizeContent(m.content).length <= 4).length / messageCount;
  const D_obs = clamp01(oneWordRatio * 0.6 + (paceToFriction(computePace(sorted)) as number));

  const riskHits = RISK_PATTERNS.filter((re) => re.test(corpus)).length;
  const R_obs = clamp01(riskHits * 0.45 + (advancementDetected ? 0.1 : 0));

  const replyBalance =
    Math.min(viewerMessageCount, counterpartyMessageCount) /
    Math.max(viewerMessageCount, counterpartyMessageCount);
  const coldRisk = clamp01(
    (1 - replyBalance) * 0.45 + D_obs * 0.35 + (paceToFriction(computePace(sorted)) as number) * 0.2,
  );

  const pace = computePace(sorted);
  const suggestedAction = suggestAction({ coldRisk, R_obs, advancementDetected });

  return {
    schemaVersion: RRM_SIGNAL_SUMMARY_SCHEMA_VERSION,
    sourceVersion: RRM_SOURCE_VERSION_OBSERVED,
    layer: RRM_ADAPTER_LAYER.ADAPTER,
    mode: "signal_summary_only",
    fallbackUsed: false,
    insufficientData: false,
    unavailableReason: null,
    generatedAt,
    conversationId: input.conversationId,
    messageCount,
    viewerMessageCount,
    counterpartyMessageCount,
    advancementDetected,
    S_obs,
    E_obs,
    F_obs,
    Q_obs,
    D_obs,
    R_obs,
    coldRisk,
    pace,
    suggestedAction,
  };
}

function paceToFriction(pace: ReturnType<typeof computePace>): number {
  if (pace === "slow") return 0.35;
  if (pace === "fast") return 0.15;
  if (pace === "steady") return 0.05;
  return 0.2;
}
