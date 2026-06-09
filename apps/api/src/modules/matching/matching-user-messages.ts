/**
 * Viewer-safe Chinese copy for matching enqueue / status / no-result flows.
 * Internal reason codes must not be exposed; map to friendly text here only.
 */

import type { MatchQueueStatus } from "./matching-result-state";

export type MatchNoResultReason =
  | "no_match_result"
  | "not_queued"
  | "candidate_pool_empty"
  | "onboarding_incomplete"
  | "legacy_writer_disabled"
  | "unknown";

export function userMessageForEnqueue(input: { alreadyQueued: boolean }): string {
  if (input.alreadyQueued) {
    return "你已在匹配队列中，请稍候…";
  }
  return "已加入匹配队列，系统会尽快为你安排匹配。";
}

export function userMessageForQueueStatus(
  status: MatchQueueStatus | "failed",
): string {
  switch (status) {
    case "not_queued":
      return "还没有开始匹配，点下面按钮即可加入。";
    case "waiting":
      return "已收到你的匹配请求，正在排队中…";
    case "processing":
      return "正在为你筛选合适的人选…";
    case "ready":
      return "匹配已完成，正在为你打开结果…";
    case "failed":
      return "本轮匹配未能完成。请先到预览页确认人选已生成，再重新点击「开始匹配」；若仍失败请联系客服。";
    default:
      return "正在处理，请稍候…";
  }
}

export function userMessageForNoResultReason(reason: MatchNoResultReason): string {
  switch (reason) {
    case "not_queued":
      return "还没有开始匹配，请先点击「开始匹配」。";
    case "no_match_result":
      return "匹配结果尚未生成，请稍候或刷新页面。";
    case "candidate_pool_empty":
      return "预览人选尚未准备好，请先到预览页生成人选后再匹配。";
    case "onboarding_incomplete":
      return "请先完成关系问卷与个人资料，再开始匹配。";
    case "legacy_writer_disabled":
      return "匹配服务正在维护中，请稍后再试；若长时间无结果请联系客服。";
    case "unknown":
    default:
      return "暂时无法获取匹配结果，请稍后再试。";
  }
}
