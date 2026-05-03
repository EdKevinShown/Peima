import { pickHeroMainIntro } from "./finalMatchNarrative";

const heroStyle = {
  borderRadius: 12,
  padding: "1.35rem 1.25rem 1.25rem",
  background: "linear-gradient(165deg, #f0f7ff 0%, #ffffff 55%, #fafbff 100%)",
  border: "1px solid #dbeafe",
  boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
};

/**
 * M4.3-M1 + M5.5-UI-R1: top hero — single intro + one primary score (finalScore semantics unchanged).
 */
export default function FinalMatchHero({
  displaySourceType,
  finalScore,
  createdAt,
  formatScoreDisplay,
  formatDateShort,
}) {
  const isRrm = displaySourceType === "rrm_top2_bounded_selector";
  const intro = pickHeroMainIntro(displaySourceType);
  const scoreLabel = isRrm ? "基础适配指数" : "匹配指数";
  const scoreHint = isRrm
    ? "该分数表示基础资料与问卷适配参考；当前展示对象已结合关系节奏判断推荐。"
    : "越高表示本轮综合匹配度越好。";

  return (
    <header style={heroStyle}>
      <h1 style={{ fontSize: "1.45rem", margin: "0 0 0.65rem", color: "#0f172a", fontWeight: 700 }}>本轮匹配说明</h1>
      <p
        style={{
          margin: "0 0 1rem",
          color: "#1e293b",
          fontSize: "1.02rem",
          lineHeight: 1.6,
          fontWeight: 500,
        }}
      >
        {intro}
      </p>
      <div style={{ marginTop: "0.85rem", paddingTop: "1rem", borderTop: "1px solid rgba(148,163,184,0.35)" }}>
        <p style={{ margin: "0 0 0.2rem", fontSize: "0.8rem", color: "#64748b", letterSpacing: "0.02em" }}>
          {scoreLabel}（{scoreHint}）
        </p>
        <p style={{ margin: 0, fontSize: "2.35rem", fontWeight: 800, color: "#1d4ed8", lineHeight: 1.1 }}>{formatScoreDisplay(finalScore)}</p>
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.82rem", color: "#94a3b8" }}>结果更新于 {formatDateShort(createdAt)}</p>
      </div>
    </header>
  );
}
