/** Fallback copy when API omits `userMessage` (older servers). */

export function matchingStatusUserMessage(status) {
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

export function resolveMatchingStatusLine(statusPayload) {
  if (!statusPayload) return null;
  const fromApi =
    typeof statusPayload.userMessage === "string" ? statusPayload.userMessage.trim() : "";
  if (fromApi) return fromApi;
  return matchingStatusUserMessage(statusPayload.status);
}
