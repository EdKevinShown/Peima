import { pickHeroMainIntro } from "./finalMatchNarrative";

const heroStyle = {
  borderRadius: 12,
  padding: "1.35rem 1.25rem 1.25rem",
  background: "linear-gradient(165deg, #f0f7ff 0%, #ffffff 55%, #fafbff 100%)",
  border: "1px solid #dbeafe",
  boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
};

/**
 * M5.5-UI-R4: top hero — RRM 时区分「展示对象」与「基础适配分数」语义，不暗示分数含关系节奏。
 */
export default function FinalMatchHero({
  isRrmDisplay,
  finalScore,
  createdAt,
  formatScoreDisplay,
  formatDateShort,
}) {
  const intro = pickHeroMainIntro(isRrmDisplay);
  const scoreLabel = isRrmDisplay ? "基础适配指数" : "匹配指数";
  const scoreHintInline = "这个分数表示资料与问卷的综合适配程度，可以帮助你理解本轮排序的参考。";

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
        {isRrmDisplay ? (
          <>
            <p style={{ margin: "0 0 0.2rem", fontSize: "0.8rem", color: "#64748b", letterSpacing: "0.02em" }}>{scoreLabel}</p>
            <p style={{ margin: 0, fontSize: "2.35rem", fontWeight: 800, color: "#1d4ed8", lineHeight: 1.1 }}>{formatScoreDisplay(finalScore)}</p>
            <p
              style={{
                margin: "0.55rem 0 0",
                fontSize: "0.82rem",
                color: "#475569",
                lineHeight: 1.55,
              }}
            >
              这个分数来自基础资料和问卷适配度，用来帮助你理解基础匹配情况；当前展示对象还结合了相处节奏判断。
            </p>
          </>
        ) : (
          <>
            <p style={{ margin: "0 0 0.2rem", fontSize: "0.8rem", color: "#64748b", letterSpacing: "0.02em" }}>
              {scoreLabel}（{scoreHintInline}）
            </p>
            <p style={{ margin: 0, fontSize: "2.35rem", fontWeight: 800, color: "#1d4ed8", lineHeight: 1.1 }}>{formatScoreDisplay(finalScore)}</p>
          </>
        )}
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.82rem", color: "#94a3b8" }}>结果更新于 {formatDateShort(createdAt)}</p>
      </div>
    </header>
  );
}
