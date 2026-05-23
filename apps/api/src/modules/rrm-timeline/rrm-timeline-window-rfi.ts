import { computeRfiScenario } from "../ai-simulation-v1/rrm-sim-formula";
import type { RrmCoreFormulaBranch } from "../rrm-shared";
import type { RrmTimelineDetectedWindow } from "./rrm-timeline-window.detector";
import type { RrmTimelineMessageInput } from "./rrm-timeline.types";

const RISK_PATTERNS: RegExp[] = [
  /必须|一定要|威胁|举报|拉黑/i,
  /逼你|给我发|马上回/i,
];

const AGGRESSIVE_PATTERNS: RegExp[] = [/快点|赶紧|烦死了/i];

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function toTimeMs(createdAt: string | Date): number {
  if (createdAt instanceof Date) return createdAt.getTime();
  const t = Date.parse(createdAt);
  return Number.isFinite(t) ? t : 0;
}

function deriveCBeforeWindow(
  preWindow: RrmTimelineMessageInput[],
  viewerUserId: string,
  counterpartyUserId: string,
): number {
  if (preWindow.length < 4) return 0.35;
  const viewer = preWindow.filter((m) => m.senderUserId === viewerUserId).length;
  const counter = preWindow.filter((m) => m.senderUserId === counterpartyUserId).length;
  const balance =
    Math.min(viewer, counter) / Math.max(viewer, counter, 1);
  let alternations = 0;
  for (let i = 1; i < preWindow.length; i += 1) {
    if (preWindow[i]!.senderUserId !== preWindow[i - 1]!.senderUserId) alternations += 1;
  }
  const S = clamp01(alternations / Math.max(1, preWindow.length - 1));
  return clamp01(0.4 * S + 0.35 * balance + 0.25 * Math.min(1, preWindow.length / 12));
}

function windowScalars(
  windowMessages: RrmTimelineMessageInput[],
  A_t: number,
): { S: number; E: number; F: number; Q: number; D: number; R: number } {
  const corpus = windowMessages.map((m) => m.content).join("\n");
  let alternations = 0;
  for (let i = 1; i < windowMessages.length; i += 1) {
    if (windowMessages[i]!.senderUserId !== windowMessages[i - 1]!.senderUserId) {
      alternations += 1;
    }
  }
  const S = clamp01(alternations / Math.max(1, windowMessages.length - 1));
  const aggressiveHits = AGGRESSIVE_PATTERNS.filter((re) => re.test(corpus)).length;
  const E = clamp01(1 - aggressiveHits * 0.35);
  const spanMs =
    windowMessages.length >= 2
      ? toTimeMs(windowMessages[windowMessages.length - 1]!.createdAt) -
        toTimeMs(windowMessages[0]!.createdAt)
      : 0;
  const spanDays = spanMs > 0 ? spanMs / (24 * 3600_000) : 0;
  const F = clamp01(
    Math.min(1, windowMessages.length / 6) * 0.55 + Math.min(0.25, spanDays / 3),
  );
  const avgLen =
    windowMessages.reduce((acc, m) => acc + m.content.trim().length, 0) /
    Math.max(1, windowMessages.length);
  const questionRatio =
    windowMessages.filter((m) => /[?？]/.test(m.content)).length /
    Math.max(1, windowMessages.length);
  const Q = clamp01(Math.min(1, avgLen / 80) * 0.65 + questionRatio * 0.35);
  const oneWordRatio =
    windowMessages.filter((m) => m.content.trim().length <= 4).length /
    Math.max(1, windowMessages.length);
  const D = clamp01(oneWordRatio * 0.5 + (windowMessages.length < 2 ? 0.2 : 0.08));
  const riskHits = RISK_PATTERNS.filter((re) => re.test(corpus)).length;
  const R = clamp01(riskHits * 0.5 + (A_t >= 0.5 ? 0.12 : 0));
  return { S, E, F, Q, D, R };
}

export function computeRrmTimelineWindowRfi(params: {
  sortedMessages: RrmTimelineMessageInput[];
  detected: RrmTimelineDetectedWindow;
  viewerUserId: string;
  counterpartyUserId: string;
}): { RFI_t: number; branch: RrmCoreFormulaBranch } {
  const { sortedMessages, detected, viewerUserId, counterpartyUserId } = params;
  const windowMessages = detected.messageIndices.map((i) => sortedMessages[i]!);
  const preWindow = sortedMessages.filter(
    (m) => toTimeMs(m.createdAt) < detected.windowStartMs,
  );
  const C_t = deriveCBeforeWindow(preWindow, viewerUserId, counterpartyUserId);
  const A_t = clamp01(detected.A_t);
  const { S, E, F, Q, D, R } = windowScalars(
    windowMessages.length > 0 ? windowMessages : [sortedMessages[detected.messageIndices[0] ?? 0]!].filter(Boolean),
    A_t,
  );

  const RFI_t = computeRfiScenario({
    A: A_t,
    C_pred: C_t,
    S,
    E,
    F,
    Q,
    D_pre: D,
    R_pre: R,
  });
  const branch: RrmCoreFormulaBranch = A_t > C_t ? "over_capacity" : "within_capacity";
  return { RFI_t, branch };
}
