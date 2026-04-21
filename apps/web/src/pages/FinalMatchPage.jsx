import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getMatchingResult } from "../api/matching";
import { getMatchExplanationAi } from "../api/match-explanation-ai";
import LoadingState from "../components/common/LoadingState";
import { resolveUserId } from "../utils/resolveUserId";
import { createConversation } from "../api/chat";

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function isStringArray(x) {
  return Array.isArray(x) && x.every((i) => typeof i === "string");
}

/** P1-2: show insights only when shape matches API contract. */
function isValidMatchInsights(mi) {
  if (mi == null || typeof mi !== "object" || Array.isArray(mi)) return false;
  const e = mi.explanation;
  if (e == null || typeof e !== "object" || Array.isArray(e)) return false;
  if (typeof e.whyMatch !== "string") return false;
  if (typeof e.rhythmPrediction !== "string") return false;
  if (!isStringArray(e.strengths)) return false;
  if (!isStringArray(e.cautions)) return false;
  if (!isStringArray(mi.riskFlags)) return false;
  if (!isStringArray(mi.openingTopics)) return false;
  if (typeof mi.chatSimulationSummary !== "string") return false;
  return true;
}

const insightCardStyle = {
  border: "1px solid #e0e0e0",
  borderRadius: 6,
  padding: "0.75rem 1rem",
  marginTop: "0.75rem",
  background: "#fff",
};

const insightCardTitleStyle = {
  fontWeight: 600,
  fontSize: "0.95rem",
  margin: "0 0 0.5rem",
};

export default function FinalMatchPage() {
  const [searchParams] = useSearchParams();
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);

  const navigate = useNavigate();

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [aiExplanation, setAiExplanation] = useState(null);
  const [aiExplanationLoading, setAiExplanationLoading] = useState(false);
  const [aiExplanationError, setAiExplanationError] = useState(null);

  const load = useCallback(async () => {
    if (!userId) {
      setError(new Error("缺少 userId：请在 URL 加 ?userId=xxx 或设置 localStorage.peimaUserId"));
      setResult(null);
      return;
    }
    setLoading(true);
    setError(null);
    setAiExplanation(null);
    setAiExplanationError(null);
    try {
      const data = await getMatchingResult(userId);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const onFetchAiExplanation = useCallback(async () => {
    if (!result?.id) return;
    setAiExplanationError(null);
    setAiExplanationLoading(true);
    try {
      const data = await getMatchExplanationAi(result.id);
      setAiExplanation(data);
    } catch (e) {
      setAiExplanation(null);
      setAiExplanationError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiExplanationLoading(false);
    }
  }, [result?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const onEnterChat = useCallback(async () => {
    if (!userId) return;
    try {
      localStorage.setItem("peimaUserId", userId);
      const conv = await createConversation(userId);
      navigate(
        `/chat?conversationId=${encodeURIComponent(conv.id)}&userId=${encodeURIComponent(userId)}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, [userId, navigate]);

  const onViewTimeline = useCallback(async () => {
    if (!userId) return;
    try {
      localStorage.setItem("peimaUserId", userId);
      const conv = await createConversation(userId);
      navigate(
        `/chat/timeline?conversationId=${encodeURIComponent(conv.id)}&userId=${encodeURIComponent(userId)}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, [userId, navigate]);

  return (
    <main style={{ maxWidth: 560, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.35rem" }}>你的当前最终匹配结果</h1>
      <p style={{ color: "#666", fontSize: "0.9rem" }}>
        viewer userId: <code>{userId || "（未设置）"}</code>
      </p>
      <p style={{ marginBottom: "1rem" }}>
        <Link to={`/matching-waiting?userId=${encodeURIComponent(userId || "")}`}>
          返回等待页
        </Link>
      </p>

      {loading && <LoadingState label="加载匹配结果…" />}
      {error && (
        <p style={{ color: "#b00020" }} role="alert">
          {error.message}
        </p>
      )}

      {!loading && !error && result && (
        <article
          style={{
            border: "1px solid #ddd",
            borderRadius: 8,
            padding: "1rem 1.25rem",
            background: "#fafafa",
          }}
        >
          <dl style={{ margin: 0, display: "grid", gap: "0.75rem" }}>
            <div>
              <dt style={{ fontWeight: 600, margin: 0 }}>candidateUserId</dt>
              <dd style={{ margin: "0.25rem 0 0", fontFamily: "monospace" }}>
                {result.candidateUserId}
              </dd>
            </div>
            <div>
              <dt style={{ fontWeight: 600, margin: 0 }}>finalScore</dt>
              <dd style={{ margin: "0.25rem 0 0" }}>{result.finalScore ?? "—"}</dd>
            </div>
            <div>
              <dt style={{ fontWeight: 600, margin: 0 }}>reasonSummary</dt>
              <dd style={{ margin: "0.25rem 0 0" }}>{result.reasonSummary ?? "—"}</dd>
            </div>
            <div>
              <dt style={{ fontWeight: 600, margin: 0 }}>createdAt</dt>
              <dd style={{ margin: "0.25rem 0 0" }}>{formatDate(result.createdAt)}</dd>
            </div>
          </dl>

          {isValidMatchInsights(result.matchInsights) && (
            <section style={{ marginTop: "1.25rem" }} aria-label="匹配洞察">
              <h2 style={{ fontSize: "1.05rem", margin: "0 0 0.25rem" }}>匹配洞察</h2>
              <p style={{ margin: "0 0 0.5rem", color: "#666", fontSize: "0.85rem" }}>
                基于当前批次的规则占位说明（P1-1）
              </p>

              <div style={insightCardStyle}>
                <h3 style={insightCardTitleStyle}>匹配说明</h3>
                <p style={{ margin: "0 0 0.5rem", lineHeight: 1.5 }}>
                  {result.matchInsights.explanation.whyMatch}
                </p>
                <ul style={{ margin: 0, paddingLeft: "1.25rem", lineHeight: 1.5 }}>
                  {result.matchInsights.explanation.strengths.map((t, i) => (
                    <li key={`strength-${i}`}>{t}</li>
                  ))}
                </ul>
              </div>

              <div style={insightCardStyle}>
                <h3 style={insightCardTitleStyle}>节奏与注意</h3>
                <p style={{ margin: "0 0 0.5rem", lineHeight: 1.5 }}>
                  {result.matchInsights.explanation.rhythmPrediction}
                </p>
                <ul style={{ margin: 0, paddingLeft: "1.25rem", lineHeight: 1.5 }}>
                  {result.matchInsights.explanation.cautions.map((t, i) => (
                    <li key={`caution-${i}`}>{t}</li>
                  ))}
                </ul>
              </div>

              <div style={insightCardStyle}>
                <h3 style={insightCardTitleStyle}>风险标记</h3>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: "1.25rem",
                    lineHeight: 1.5,
                    fontFamily: "monospace",
                    fontSize: "0.9rem",
                  }}
                >
                  {result.matchInsights.riskFlags.map((t, i) => (
                    <li key={`risk-${i}`}>{t}</li>
                  ))}
                </ul>
              </div>

              <div style={insightCardStyle}>
                <h3 style={insightCardTitleStyle}>破冰话题</h3>
                <ul style={{ margin: 0, paddingLeft: "1.25rem", lineHeight: 1.5 }}>
                  {result.matchInsights.openingTopics.map((t, i) => (
                    <li key={`topic-${i}`}>{t}</li>
                  ))}
                </ul>
              </div>

              <div style={insightCardStyle}>
                <h3 style={insightCardTitleStyle}>对话提示</h3>
                <p style={{ margin: 0, lineHeight: 1.5 }}>
                  {result.matchInsights.chatSimulationSummary}
                </p>
              </div>
            </section>
          )}

          <section
            style={{
              marginTop: "1.25rem",
              paddingTop: "1rem",
              borderTop: "1px dashed #e5e7eb",
            }}
            aria-label="AI 匹配说明试点"
          >
            <h2 style={{ fontSize: "1.02rem", margin: "0 0 0.35rem" }}>
              AI 匹配说明（试点）
            </h2>
            <p style={{ margin: "0 0 0.5rem", color: "#64748b", fontSize: "0.8rem" }}>
              独立接口，不修改匹配分数与队列；点击后加载，失败不影响下方进入聊天与时间线。
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <button
                type="button"
                onClick={onFetchAiExplanation}
                disabled={aiExplanationLoading || !result.id}
              >
                {aiExplanationLoading ? "生成中…" : "生成 AI 匹配说明（试点）"}
              </button>
            </div>
            {aiExplanationError ? (
              <p style={{ color: "#b00020", fontSize: "0.85rem", margin: "0 0 0.5rem" }} role="alert">
                AI 匹配说明请求失败：{aiExplanationError}
              </p>
            ) : null}
            {aiExplanation ? (
              <div style={insightCardStyle}>
                <h3 style={insightCardTitleStyle}>说明正文</h3>
                <p style={{ margin: "0 0 0.5rem", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                  {aiExplanation.explanationText}
                </p>
                <p style={{ margin: 0, fontSize: "0.78rem", color: "#64748b" }}>
                  来源 {aiExplanation.sourceType} · {aiExplanation.sourceVersion}
                </p>
                <p style={{ fontSize: "0.75rem", color: "#777", margin: "0.5rem 0 0" }}>
                  P6.6 试点：成功时为模型输出；失败时为规则占位。不参与匹配决策、不落库。
                </p>
              </div>
            ) : null}
          </section>

          <div
            style={{
              marginTop: "1rem",
              display: "flex",
              flexWrap: "wrap",
              gap: "0.5rem",
              alignItems: "center",
            }}
          >
            <button type="button" onClick={onEnterChat} disabled={!userId}>
              进入聊天
            </button>
            <button type="button" onClick={onViewTimeline} disabled={!userId}>
              查看关系时间线（只读）
            </button>
          </div>
        </article>
      )}

      <div style={{ marginTop: "1.25rem" }}>
        <button type="button" onClick={load} disabled={loading || !userId}>
          重新加载
        </button>
      </div>
    </main>
  );
}
