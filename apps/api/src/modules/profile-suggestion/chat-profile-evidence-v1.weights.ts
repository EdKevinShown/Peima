/** P6 v1：聊天证据会话完成度 / 新鲜度分档与权重（写库快照用）。 */

export const CHAT_PROFILE_EVIDENCE_OVERLAY_SCHEMA_VERSION = 1 as const;

export type SessionQualityBucket =
  | "very_short_probe"
  | "standard_short"
  | "medium_complete"
  | "long_chat";

export type FreshnessBucket =
  | "m0_10"
  | "m10_30"
  | "m30_60"
  | "h1_6"
  | "h6_24"
  | "h24_plus";

export function sessionQualityFromMessageCount(
  messageCount: number,
): { bucket: SessionQualityBucket; weight: number } {
  if (messageCount <= 2) {
    return { bucket: "very_short_probe", weight: 0.55 };
  }
  if (messageCount <= 8) {
    return { bucket: "standard_short", weight: 0.85 };
  }
  if (messageCount <= 20) {
    return { bucket: "medium_complete", weight: 1.0 };
  }
  return { bucket: "long_chat", weight: 1.1 };
}

/** `minutes` = 从会话最后一条消息（若无消息则用会话创建时间）到 accept 时刻的间隔。 */
export function freshnessFromMinutesSinceLastActivity(
  minutes: number,
): { bucket: FreshnessBucket; weight: number } {
  if (minutes < 0 || Number.isNaN(minutes)) {
    return { bucket: "m0_10", weight: 1.0 };
  }
  if (minutes <= 10) return { bucket: "m0_10", weight: 1.0 };
  if (minutes <= 30) return { bucket: "m10_30", weight: 0.9 };
  if (minutes <= 60) return { bucket: "m30_60", weight: 0.75 };
  if (minutes <= 360) return { bucket: "h1_6", weight: 0.6 };
  if (minutes <= 1440) return { bucket: "h6_24", weight: 0.45 };
  return { bucket: "h24_plus", weight: 0.3 };
}

export function clampEvidenceWeight(
  sessionQualityWeight: number,
  freshnessWeight: number,
): number {
  const raw = sessionQualityWeight * freshnessWeight;
  return Math.min(1.15, Math.max(0, raw));
}
