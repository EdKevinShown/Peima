import { useMemo, useState } from "react";
import {
  pickWhyRecommendLines,
  buildCoexistenceSegments,
  pickFirstChatFriendlyTips,
} from "./finalMatchNarrative";

const card = {
  borderRadius: 12,
  padding: "1.1rem 1.15rem",
  border: "1px solid #e2e8f0",
  background: "#ffffff",
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
};

const h2 = { margin: "0 0 0.55rem", fontSize: "1.05rem", fontWeight: 700, color: "#0f172a" };

function CollapsedBody({ children, maxChars = 220 }) {
  const [open, setOpen] = useState(false);
  const text = typeof children === "string" ? children : "";
  const long = text.length > maxChars;
  const shown = open || !long ? text : `${text.slice(0, maxChars)}…`;
  return (
    <div>
      <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.55, color: "#334155", fontSize: "0.95rem" }}>{shown}</p>
      {long ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            marginTop: "0.45rem",
            border: "none",
            background: "none",
            color: "#2563eb",
            cursor: "pointer",
            fontSize: "0.85rem",
            padding: 0,
          }}
        >
          {open ? "收起" : "展开"}
        </button>
      ) : null}
    </div>
  );
}

/**
 * M5.5-UI-R1: user-facing sections — why / coexistence / first chat; match review compact.
 */
function friendlyInteractionSimError(err) {
  if (err == null) return "";
  const s = String(err).trim();
  if (!s) return "";
  if (s.length <= 100 && !/403|401|whitelist|Forbidden/i.test(s)) return s;
  return "";
}

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
  const whyLines = useMemo(() => pickWhyRecommendLines(insights, displaySourceType), [insights, displaySourceType]);
  const coexist = useMemo(() => buildCoexistenceSegments(insights, matchReview), [insights, matchReview]);
  const friendlyTips = useMemo(() => pickFirstChatFriendlyTips(interactionSim), [interactionSim]);

  const topics = Array.isArray(openingTopics) ? openingTopics.filter((t) => typeof t === "string" && t.trim()) : [];
  const reviewScore = matchReview?.reviewStaticScore;
  const hasReview = matchReview && typeof reviewScore === "number";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* 2. 推荐理由 */}
      <section style={card} aria-labelledby="why-recommend-heading">
        <h2 id="why-recommend-heading" style={h2}>
          为什么推荐
        </h2>
        {isRrm ? (
          <div
            style={{
              marginBottom: "0.65rem",
              padding: "0.45rem 0.65rem",
              borderRadius: 8,
              background: "#f1f5f9",
              fontSize: "0.82rem",
              color: "#334155",
              lineHeight: 1.45,
            }}
          >
            <strong style={{ color: "#0f172a" }}>关系节奏推荐已启用</strong>
            <div style={{ marginTop: "0.25rem" }}>
              系统在高适配候选中，结合相处节奏与推进安全感推荐当前对象。基础分数仅作为适配参考，不代表单独的关系节奏分。
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

      {/* 3. 相处建议 */}
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
            {matchReviewLoading ? "正在获取相处参考…" : hasReview ? "刷新相处参考" : "获取相处参考"}
          </button>
          {matchReviewError ? (
            <p style={{ margin: "0.55rem 0 0", fontSize: "0.88rem", color: "#b91c1c" }}>
              暂时无法生成相处参考，请稍后再试。
              {typeof matchReviewError === "string" && matchReviewError.trim() && matchReviewError.length < 120 ? (
                <span style={{ display: "block", marginTop: "0.25rem", color: "#64748b", fontSize: "0.8rem" }}>
                  {matchReviewError.trim()}
                </span>
              ) : null}
            </p>
          ) : null}
          {hasReview ? (
            <p style={{ margin: "0.55rem 0 0", fontSize: "0.82rem", color: "#64748b" }}>
              <span style={{ color: "#334155" }}>相处参考分：{Math.round(reviewScore)}</span>，仅供参考。
              <span style={{ display: "block", marginTop: "0.2rem" }}>相处参考不改变最终推荐结果。</span>
            </p>
          ) : null}
          {hasReview && typeof matchReview?.aiReview?.explanation === "string" && matchReview.aiReview.explanation.trim() ? (
            <div style={{ marginTop: "0.5rem" }}>
              <CollapsedBody maxChars={200}>{matchReview.aiReview.explanation.trim()}</CollapsedBody>
            </div>
          ) : null}
        </div>
      </section>

      {/* 4. 第一次可以这样聊 */}
      <section style={card} aria-labelledby="first-chat-heading">
        <h2 id="first-chat-heading" style={h2}>
          第一次可以这样聊
        </h2>
        {topics.length ? (
          <ul style={{ margin: "0 0 0.75rem", paddingLeft: "1.15rem", color: "#334155", lineHeight: 1.55, fontSize: "0.95rem" }}>
            {topics.slice(0, 3).map((t, i) => (
              <li key={i}>{t.trim()}</li>
            ))}
          </ul>
        ) : (
          <p style={{ margin: "0 0 0.75rem", color: "#64748b", fontSize: "0.9rem" }}>暂无开场话题，可直接从轻松日常聊起。</p>
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
          {interactionSimLoading ? "正在生成初次聊天预判…" : "生成初次聊天预判"}
        </button>
        {interactionSimError ? (
          <p style={{ margin: "0.55rem 0 0", fontSize: "0.88rem", color: "#b91c1c" }}>
            暂时无法生成初次聊天预判，请稍后再试。
            {friendlyInteractionSimError(interactionSimError) ? (
              <span style={{ display: "block", marginTop: "0.25rem", color: "#64748b", fontSize: "0.8rem" }}>
                {friendlyInteractionSimError(interactionSimError)}
              </span>
            ) : null}
          </p>
        ) : null}
        {friendlyTips.length ? (
          <ul style={{ margin: "0.65rem 0 0", paddingLeft: "1.15rem", color: "#475569", lineHeight: 1.55, fontSize: "0.9rem" }}>
            {friendlyTips.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
