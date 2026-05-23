import {
  RRM_ADAPTER_LAYER,
  RRM_SIGNAL_SUMMARY_SCHEMA_VERSION,
  RRM_SOURCE_VERSION_TIMELINE,
} from "../rrm-shared";
import type { RrmObservedSuggestedAction } from "../rrm-observed";
import {
  RRM_TIMELINE_MIN_MESSAGE_COUNT,
  RRM_TIMELINE_MIN_MESSAGES_PER_PARTY,
} from "./rrm-timeline.constants";
import { detectRrmTimelineAdvancementWindows } from "./rrm-timeline-window.detector";
import { computeRrmTimelineWindowRfi } from "./rrm-timeline-window-rfi";
import type {
  BuildRrmTimelineSignalSummaryInput,
  RrmTimelineAdvancementWindowV1,
  RrmTimelineConfidence,
  RrmTimelineInitiativeBalance,
  RrmTimelinePaceTrend,
  RrmTimelineQualityTrend,
  RrmTimelineSignalSummaryV1,
  RrmTimelineStage,
} from "./rrm-timeline.types";

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function toTimeMs(createdAt: string | Date): number {
  if (createdAt instanceof Date) return createdAt.getTime();
  const t = Date.parse(createdAt);
  return Number.isFinite(t) ? t : 0;
}

function countParty(messages: BuildRrmTimelineSignalSummaryInput["messages"], userId: string): number {
  return messages.filter((m) => m.senderUserId === userId).length;
}

function computePaceTrend(sorted: BuildRrmTimelineSignalSummaryInput["messages"]): RrmTimelinePaceTrend {
  if (sorted.length < 4) return "unknown";
  const mid = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, mid);
  const secondHalf = sorted.slice(mid);
  const gapMedian = (slice: typeof sorted) => {
    const gaps: number[] = [];
    for (let i = 1; i < slice.length; i += 1) {
      const dt = toTimeMs(slice[i]!.createdAt) - toTimeMs(slice[i - 1]!.createdAt);
      if (dt > 0) gaps.push(dt);
    }
    if (gaps.length === 0) return null;
    return gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)]!;
  };
  const g1 = gapMedian(firstHalf);
  const g2 = gapMedian(secondHalf);
  if (g1 == null || g2 == null) return "unknown";
  if (g2 > g1 * 1.35) return "slowing";
  if (g2 < g1 * 0.7) return "accelerating";
  return "steady";
}

function computeInitiativeBalance(
  viewerCount: number,
  counterCount: number,
): RrmTimelineInitiativeBalance {
  if (viewerCount === 0 || counterCount === 0) return "unknown";
  const ratio = viewerCount / counterCount;
  if (ratio >= 1.35) return "viewer_led";
  if (ratio <= 0.75) return "counterparty_led";
  return "balanced";
}

function inferStage(params: {
  messageCount: number;
  coldRisk: number;
  boundaryRisk: number;
  hasInviteWindow: boolean;
  hasPressureWindow: boolean;
}): RrmTimelineStage {
  if (params.boundaryRisk >= 0.55 || params.hasPressureWindow) return "risk";
  if (params.coldRisk >= 0.6) return "cooling";
  if (params.hasInviteWindow) return "invite_phase";
  if (params.messageCount >= 20) return "stable_chat";
  if (params.messageCount >= 8) return "building";
  return "early";
}

function rhythmTrendFromWindows(windows: RrmTimelineAdvancementWindowV1[]): RrmTimelineQualityTrend {
  if (windows.length < 2) return "unknown";
  const first = windows[0]!.RFI_t;
  const last = windows[windows.length - 1]!.RFI_t;
  const delta = last - first;
  if (delta > 0.08) return "improving";
  if (delta < -0.08) return "declining";
  return "flat";
}

function qualityTrendFromWindows(windows: RrmTimelineAdvancementWindowV1[]): RrmTimelineQualityTrend {
  return rhythmTrendFromWindows(windows);
}

function confidenceLevel(
  messageCount: number,
  windowCount: number,
): RrmTimelineConfidence {
  if (messageCount < RRM_TIMELINE_MIN_MESSAGE_COUNT) return "low";
  if (windowCount >= 2 && messageCount >= 12) return "high";
  if (messageCount >= 10 || windowCount >= 1) return "medium";
  return "low";
}

function suggestAction(params: {
  coldRisk: number;
  boundaryRisk: number;
  stage: RrmTimelineStage;
}): RrmObservedSuggestedAction {
  if (params.boundaryRisk >= 0.5 || params.stage === "risk") return "slow_down";
  if (params.coldRisk >= 0.6 || params.stage === "cooling") return "pause";
  if (params.stage === "invite_phase") return "continue_lightly";
  return "maintain";
}

function emptySummary(
  input: BuildRrmTimelineSignalSummaryInput,
  generatedAt: string,
  messageCount: number,
  viewerMessageCount: number,
  counterpartyMessageCount: number,
  reason: "insufficient_data",
): RrmTimelineSignalSummaryV1 {
  return {
    schemaVersion: RRM_SIGNAL_SUMMARY_SCHEMA_VERSION,
    sourceVersion: RRM_SOURCE_VERSION_TIMELINE,
    layer: RRM_ADAPTER_LAYER.ADAPTER,
    mode: "signal_summary_only",
    fallbackUsed: true,
    insufficientData: true,
    unavailableReason: reason,
    generatedAt,
    conversationId: input.conversationId,
    messageCount,
    viewerMessageCount,
    counterpartyMessageCount,
    stage: "early",
    paceTrend: "unknown",
    initiativeBalance: "unknown",
    coldRisk: 0,
    boundaryRisk: 0,
    qualityTrend: "unknown",
    confidence: "low",
    suggestedAction: "maintain",
    advancementWindowCount: 0,
    windows: [],
    rhythmTrend: "unknown",
  };
}

/**
 * Pure Timeline adapter (M5.1-r9). Default trend signals; RFI_t only on advancement windows.
 */
export function buildRrmTimelineSignalSummary(
  input: BuildRrmTimelineSignalSummaryInput,
): RrmTimelineSignalSummaryV1 {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const sorted = [...input.messages].sort(
    (a, b) => toTimeMs(a.createdAt) - toTimeMs(b.createdAt),
  );
  const messageCount = sorted.length;
  const viewerMessageCount = countParty(sorted, input.viewerUserId);
  const counterpartyMessageCount = countParty(sorted, input.counterpartyUserId);

  const insufficient =
    messageCount < RRM_TIMELINE_MIN_MESSAGE_COUNT ||
    viewerMessageCount < RRM_TIMELINE_MIN_MESSAGES_PER_PARTY ||
    counterpartyMessageCount < RRM_TIMELINE_MIN_MESSAGES_PER_PARTY;

  if (insufficient) {
    return emptySummary(
      input,
      generatedAt,
      messageCount,
      viewerMessageCount,
      counterpartyMessageCount,
      "insufficient_data",
    );
  }

  const replyBalance =
    Math.min(viewerMessageCount, counterpartyMessageCount) /
    Math.max(viewerMessageCount, counterpartyMessageCount);
  const paceTrend = computePaceTrend(sorted);
  const paceFriction =
    paceTrend === "slowing" ? 0.35 : paceTrend === "accelerating" ? 0.1 : 0.18;
  const coldRisk = clamp01((1 - replyBalance) * 0.5 + paceFriction * 0.5);

  const corpus = sorted.map((m) => m.content).join("\n");
  const boundaryRisk = clamp01(
    (/必须|威胁|举报|逼你/i.test(corpus) ? 0.55 : 0) +
      (/怎么不回|别晾/i.test(corpus) ? 0.25 : 0),
  );

  const detected = detectRrmTimelineAdvancementWindows(sorted);
  const windows: RrmTimelineAdvancementWindowV1[] = detected.map((d) => {
    const { RFI_t, branch } = computeRrmTimelineWindowRfi({
      sortedMessages: sorted,
      detected: d,
      viewerUserId: input.viewerUserId,
      counterpartyUserId: input.counterpartyUserId,
    });
    return {
      windowId: d.windowId,
      windowStart: new Date(d.windowStartMs).toISOString(),
      windowEnd: new Date(d.windowEndMs).toISOString(),
      advancementType: d.advancementType,
      messageCount: d.messageIndices.length,
      RFI_t,
      branch,
    };
  });

  const hasInviteWindow = windows.some(
    (w) => w.advancementType === "meetup" || w.advancementType === "light_invite",
  );
  const hasPressureWindow = windows.some((w) => w.advancementType === "pressure");

  const stage = inferStage({
    messageCount,
    coldRisk,
    boundaryRisk,
    hasInviteWindow,
    hasPressureWindow,
  });
  const qualityTrend = qualityTrendFromWindows(windows);
  const rhythmTrend = rhythmTrendFromWindows(windows);
  const confidence = confidenceLevel(messageCount, windows.length);
  const suggestedAction = suggestAction({ coldRisk, boundaryRisk, stage });

  return {
    schemaVersion: RRM_SIGNAL_SUMMARY_SCHEMA_VERSION,
    sourceVersion: RRM_SOURCE_VERSION_TIMELINE,
    layer: RRM_ADAPTER_LAYER.ADAPTER,
    mode: windows.length > 0 ? "core_formula_output" : "signal_summary_only",
    fallbackUsed: false,
    insufficientData: false,
    unavailableReason: null,
    generatedAt,
    conversationId: input.conversationId,
    messageCount,
    viewerMessageCount,
    counterpartyMessageCount,
    stage,
    paceTrend,
    initiativeBalance: computeInitiativeBalance(viewerMessageCount, counterpartyMessageCount),
    coldRisk,
    boundaryRisk,
    qualityTrend,
    confidence,
    suggestedAction,
    advancementWindowCount: windows.length,
    windows,
    rhythmTrend,
  };
}
