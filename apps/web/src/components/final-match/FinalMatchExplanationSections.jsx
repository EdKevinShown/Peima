import { useMemo } from "react";
import {
  plainWhyBullets,
  buildPlainCoexistence,
  buildPlainChatPredictionBullets,
  reviewStaticScoreBand,
} from "./finalMatchPlainLanguage";

const card = {
  borderRadius: 12,
  padding: "1.1rem 1.15rem",
  border: "1px solid #e2e8f0",
  background: "#ffffff",
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
};

const h2 = { margin: "0 0 0.55rem", fontSize: "1.05rem", fontWeight: 700, color: "#0f172a" };

const subHeading = {
  margin: "0 0 0.4rem",
  fontSize: "0.82rem",
  fontWeight: 600,
  color: "#64748b",
};

/**
 * M5.5-UI-R3: plain-language sections; no raw API copy, no ellipsis truncation, no internal terms on the main path.
 */
export default function FinalMatchExplanationSections({
  displaySourceType,
  insights,
  openingTopics,
  interactionSim,
  interactionSimLoading,
  interactionSimError,
  onFetchInteractionSim,
  matchReview,
  matchReviewLoading,
  matchReviewError,
  onRequestMatchReview,
}) {
  const isRrm = displaySourceType === "rrm_top2_bounded_selector";
  const whyLines = useMemo(() => plainWhyBullets(isRrm), [isRrm]);
  const coexist = useMemo(() => buildPlainCoexistence(insights, matchReview), [insights, matchReview]);

  const topics = Array.isArray(openingTopics) ? openingTopics.filter((t) => typeof t === "string" && t.trim()) : [];
  /** 仅在一次成功的 lite 请求后展示，避免与「可以先问」下的开场话题混淆。 */
  const generatedChatBullets = useMemo(() => {
    if (interactionSim == null || typeof interactionSim !== "object") return [];
    return buildPlainChatPredictionBullets(interactionSim, topics).slice(0, 4);
  }, [interactionSim, topics]);

  const reviewScore = matchReview?.reviewStaticScore;
  const hasReview = matchReview && typeof reviewScore === "number";
  const band = hasReview ? reviewStaticScoreBand(reviewScore) : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <section style={card} aria-labelledby="why-recommend-heading">
        <h2 id="why-recommend-heading" style={h2}>
          为什么推荐
        </h2>
        {isRrm ? (
          <div
            style={{
              marginBottom: "0.65rem",
              padding: "0.5rem 0.7rem",
              borderRadius: 8,
              background: "#f1f5f9",
              fontSize: "0.86rem",
              color: "#334155",
              lineHeight: 1.55,
            }}
          >
            <div style={{ fontWeight: 700, color: "#0f172a" }}>关系节奏推荐已启用</div>
            <div style={{ marginTop: "0.35rem" }}>
              这次推荐不只看基础匹配，也参考了你们可能的聊天节奏和推进安全感。
            </div>
            <div style={{ marginTop: "0.35rem" }}>
              顶部分数仍是资料与问卷的适配参考，请结合下方相处建议一起看。
            </div>
          </div>
        ) : null}
        <ul style={{ margin: 0, paddingLeft: "1.15rem", color: "#334155", lineHeight: 1.55, fontSize: "0.95rem" }}>
          {whyLines.map((line, i) => (
            <li key={i} style={{ marginBottom: "0.35rem" }}>
              {line}
            </li>
          ))}
        </ul>
      </section>

      <section style={card} aria-labelledby="coexist-heading">
        <h2 id="coexist-heading" style={h2}>
          相处建议
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem", fontSize: "0.92rem", color: "#334155", lineHeight: 1.55 }}>
          <div>
            <strong style={{ color: "#0f172a" }}>建议节奏：</strong>
            {coexist.rhythm}
          </div>
          <div>
            <strong style={{ color: "#0f172a" }}>需要留意：</strong>
            {coexist.caution}
          </div>
          <div>
            <strong style={{ color: "#0f172a" }}>聊天方式：</strong>
            {coexist.chat}
          </div>
        </div>
        <div style={{ marginTop: "0.85rem", paddingTop: "0.75rem", borderTop: "1px solid #e2e8f0" }}>
          <button
            type="button"
            onClick={onRequestMatchReview}
            disabled={matchReviewLoading}
            style={{
              borderRadius: 999,
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#0f172a",
              padding: "0.45rem 0.95rem",
              fontSize: "0.88rem",
              cursor: matchReviewLoading ? "wait" : "pointer",
            }}
          >
            {matchReviewLoading ? "正在获取相处参考" : hasReview ? "刷新相处参考" : "获取相处参考"}
          </button>
          {matchReviewError ? (
            <p style={{ margin: "0.55rem 0 0", fontSize: "0.88rem", color: "#b91c1c" }}>暂时无法生成相处参考，请稍后再试。</p>
          ) : null}
          {hasReview ? (
            <div style={{ margin: "0.55rem 0 0", fontSize: "0.84rem", color: "#475569", lineHeight: 1.55 }}>
              <div>
                <span style={{ color: "#334155", fontWeight: 600 }}>相处参考：{band}</span>
                {typeof reviewScore === "number" ? (
                  <span style={{ marginLeft: "0.35rem" }}>
                    （相处参考分：{Math.round(reviewScore)} / 100，仅供参考）
                  </span>
                ) : null}
              </div>
              <p style={{ margin: "0.45rem 0 0", color: "#64748b", fontSize: "0.82rem" }}>
                这只是根据问卷相似度给出的参考，不会改变本轮推荐结果。
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <section style={card} aria-labelledby="first-chat-heading">
        <h2 id="first-chat-heading" style={h2}>
          第一次可以这样聊
        </h2>
        {topics.length ? (
          <>
            <p style={subHeading}>可以先问：</p>
            <ul style={{ margin: "0 0 0.75rem", paddingLeft: "1.15rem", color: "#334155", lineHeight: 1.55, fontSize: "0.95rem" }}>
              {topics.slice(0, 3).map((t, i) => (
                <li key={i}>{t.trim()}</li>
              ))}
            </ul>
          </>
        ) : (
          <p style={{ margin: "0 0 0.75rem", color: "#64748b", fontSize: "0.9rem" }}>可以从周末安排、最近开心的小事、平时的生活节奏这类轻松话题开始。</p>
        )}
        <button
          type="button"
          onClick={onFetchInteractionSim}
          disabled={interactionSimLoading}
          style={{
            marginTop: "0.35rem",
            borderRadius: 8,
            border: "1px solid #cbd5e1",
            background: "#f8fafc",
            color: "#0f172a",
            padding: "0.5rem 1rem",
            fontSize: "0.88rem",
            fontWeight: 500,
            cursor: interactionSimLoading ? "wait" : "pointer",
          }}
        >
          {interactionSimLoading ? "正在生成聊天预判" : "生成初次聊天预判"}
        </button>
        {interactionSimError ? (
          <p style={{ margin: "0.55rem 0 0", fontSize: "0.88rem", color: "#b91c1c", lineHeight: 1.55 }}>
            暂时无法生成聊天预判，请稍后再试。你也可以先从轻松话题开始聊天。
          </p>
        ) : null}
        {generatedChatBullets.length > 0 ? (
          <>
            <p style={{ ...subHeading, marginTop: "0.75rem" }}>生成后的聊天建议：</p>
            <ul style={{ margin: 0, paddingLeft: "1.15rem", color: "#475569", lineHeight: 1.55, fontSize: "0.9rem" }}>
              {generatedChatBullets.map((tip, i) => (
                <li key={i} style={{ marginBottom: "0.3rem" }}>
                  {tip}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
    </div>
  );
}
