import {
  RRM_TIMELINE_MAX_CONTENT_CHARS,
  RRM_TIMELINE_WINDOW_MERGE_MS,
  RRM_TIMELINE_WINDOW_PADDING_MS,
} from "./rrm-timeline.constants";
import type { RrmTimelineMessageInput } from "./rrm-timeline.types";

export type RrmTimelineAdvancementType =
  | "light_invite"
  | "meetup"
  | "romantic"
  | "pressure"
  | "offline_shift"
  | "general_advance";

const ADVANCEMENT_RULES: Array<{ type: RrmTimelineAdvancementType; re: RegExp; A_t: number }> = [
  { type: "pressure", re: /怎么不回|必须|逼|威胁|举报/i, A_t: 0.58 },
  { type: "romantic", re: /喜欢你喜欢我|在一起|交往|表白/i, A_t: 0.52 },
  { type: "meetup", re: /见面|线下|出来|咖啡|吃饭|约会/i, A_t: 0.48 },
  { type: "offline_shift", re: /今晚|明天|周末|什么时候有空/i, A_t: 0.4 },
  { type: "light_invite", re: /有空|聊聊|一起/i, A_t: 0.35 },
  { type: "general_advance", re: /invite|meet\s+up/i, A_t: 0.32 },
];

export type RrmTimelineDetectedWindow = {
  windowId: string;
  windowStartMs: number;
  windowEndMs: number;
  advancementType: RrmTimelineAdvancementType;
  A_t: number;
  messageIndices: number[];
};

function toTimeMs(createdAt: string | Date): number {
  if (createdAt instanceof Date) return createdAt.getTime();
  const t = Date.parse(createdAt);
  return Number.isFinite(t) ? t : 0;
}

function normalizeContent(content: string): string {
  return content.trim().slice(0, RRM_TIMELINE_MAX_CONTENT_CHARS);
}

export function classifyTimelineAdvancement(content: string): {
  type: RrmTimelineAdvancementType;
  A_t: number;
} | null {
  const text = normalizeContent(content);
  for (const rule of ADVANCEMENT_RULES) {
    if (rule.re.test(text)) {
      return { type: rule.type, A_t: rule.A_t };
    }
  }
  return null;
}

export function detectRrmTimelineAdvancementWindows(
  messages: RrmTimelineMessageInput[],
): RrmTimelineDetectedWindow[] {
  if (messages.length === 0) return [];

  const sorted = [...messages].sort(
    (a, b) => toTimeMs(a.createdAt) - toTimeMs(b.createdAt),
  );

  const anchors: Array<{
    index: number;
    atMs: number;
    advancementType: RrmTimelineAdvancementType;
    A_t: number;
  }> = [];

  sorted.forEach((m, index) => {
    const hit = classifyTimelineAdvancement(m.content);
    if (hit) {
      anchors.push({
        index,
        atMs: toTimeMs(m.createdAt),
        advancementType: hit.type,
        A_t: hit.A_t,
      });
    }
  });

  if (anchors.length === 0) return [];

  const merged: typeof anchors = [];
  for (const anchor of anchors) {
    const last = merged[merged.length - 1];
    if (last && anchor.atMs - last.atMs <= RRM_TIMELINE_WINDOW_MERGE_MS) {
      if (anchor.A_t > last.A_t) {
        last.advancementType = anchor.advancementType;
        last.A_t = anchor.A_t;
        last.index = anchor.index;
        last.atMs = anchor.atMs;
      }
    } else {
      merged.push({ ...anchor });
    }
  }

  return merged.map((anchor, wi) => {
    const padStart = anchor.atMs - RRM_TIMELINE_WINDOW_PADDING_MS;
    const padEnd = anchor.atMs + RRM_TIMELINE_WINDOW_PADDING_MS;
    const messageIndices: number[] = [];
    sorted.forEach((m, index) => {
      const t = toTimeMs(m.createdAt);
      if (t >= padStart && t <= padEnd) messageIndices.push(index);
    });
    const startMs = messageIndices.length
      ? Math.min(...messageIndices.map((i) => toTimeMs(sorted[i]!.createdAt)))
      : anchor.atMs;
    const endMs = messageIndices.length
      ? Math.max(...messageIndices.map((i) => toTimeMs(sorted[i]!.createdAt)))
      : anchor.atMs;

    return {
      windowId: `adv-win-${wi + 1}`,
      windowStartMs: startMs,
      windowEndMs: endMs,
      advancementType: anchor.advancementType,
      A_t: anchor.A_t,
      messageIndices,
    };
  });
}
