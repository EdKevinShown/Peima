/** 将内部/API 报错转成用户可读文案（不暴露参数名与调试信息）。 */
export function toFriendlyUserMessage(message) {
  if (message == null) return "出了点问题，请稍后再试。";
  const text = typeof message === "string" ? message : String(message);
  const lower = text.toLowerCase();

  if (lower.includes("conversationid") || text.includes("conversationId")) {
    return "请先从聊天页选择一位好友进入对话，再使用本功能。";
  }
  if (lower.includes("userid") && (lower.includes("missing") || text.includes("缺少"))) {
    return "请先登录或从首页进入，再打开本页。";
  }
  if (text.includes("与当前登录用户不一致")) {
    return "当前账号与链接不一致，请从首页重新进入。";
  }
  if (text.includes("无法创建会话")) {
    return "暂时无法开始对话。请确认已完成匹配，或从「最终结果」进入聊天。";
  }
  if (lower.includes("409") || text.includes("不允许此操作")) {
    return "还在准备中，请稍候片刻；也可以先查看已有结果。";
  }
  if (text.includes("AI 关系模拟") || lower.includes("pairwise")) {
    return "匹配说明仍在准备，不影响你查看结果。";
  }

  return text;
}

/** 匹配等待页：后台步骤说明（不暴露 AI / 409 等术语） */
export function matchingWaitProgressLine(pairwiseStatus) {
  switch (pairwiseStatus) {
    case "creating":
      return "正在整理你的匹配说明…";
    case "queued":
    case "running":
      return "说明快好了，通常不到一分钟。";
    case "succeeded":
      return "说明已就绪，正在带你查看结果。";
    case "failed":
    case "timeout":
      return null;
    default:
      return null;
  }
}
