/** 关系状态 → 用户能看懂的一句话 */
const RELATIONSHIP_LABELS = {
  cold_start: "还没正式聊起来",
  awaiting_peer: "你刚发过言，在等对方回",
  awaiting_self: "对方先开口了，轮到你接一句",
  exchanging: "有来有回，聊得挺顺",
  getting_started: "刚开始互相了解",
};

export function relationshipStateLabel(state) {
  if (!state || typeof state !== "string") return null;
  const key = state.trim().toLowerCase();
  return RELATIONSHIP_LABELS[key] ?? null;
}
