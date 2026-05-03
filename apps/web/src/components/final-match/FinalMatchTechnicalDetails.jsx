/**
 * M4.3-M1 + M5.5-UI-R1: technical / debug fields — default collapsed; IDs in nested fold.
 */

function JsonBlock({ value, maxHeight = 220 }) {
  let text = "—";
  try {
    text = value == null ? "—" : typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  return (
    <pre
      style={{
        margin: "0.35rem 0 0",
        padding: "0.45rem 0.55rem",
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 6,
        fontSize: "0.72rem",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        color: "#334155",
        maxHeight,
        overflow: "auto",
      }}
    >
      {text}
    </pre>
  );
}

export default function FinalMatchTechnicalDetails({
  displaySourceType,
  finalMatchDecisionMeta,
  readoutFusion,
  candidateUserId,
  displayCandidateUserId,
  finalScore,
  reasonSummary,
  multiSourceFinalDecision,
  matchReviewDebug,
  aiExplanationMeta,
}) {
  const meta = finalMatchDecisionMeta && typeof finalMatchDecisionMeta === "object" ? finalMatchDecisionMeta : null;

  return (
    <details
      style={{
        marginTop: "1.25rem",
        padding: "0.75rem 0.9rem",
        background: "#f8fafc",
        borderRadius: 8,
        border: "1px solid #e2e8f0",
        fontSize: "0.8rem",
        color: "#475569",
      }}
    >
      <summary style={{ cursor: "pointer", fontWeight: 600, color: "#334155", userSelect: "none" }}>技术来源说明</summary>
      <div style={{ marginTop: "0.55rem", lineHeight: 1.55 }}>
        <p style={{ margin: "0.2rem 0" }}>
          展示来源类型：<code>{displaySourceType || "—"}</code>
        </p>
        <p style={{ margin: "0.2rem 0" }}>
          finalScore（API 原值）：<code>{finalScore == null ? "—" : String(finalScore)}</code>
        </p>

        <details style={{ marginTop: "0.45rem" }}>
          <summary style={{ cursor: "pointer", fontWeight: 500, color: "#475569", userSelect: "none" }}>内部标识符（默认折叠）</summary>
          <p style={{ margin: "0.35rem 0 0.15rem" }}>
            MatchResult.candidateUserId：<code style={{ fontSize: "0.74rem", wordBreak: "break-all" }}>{candidateUserId || "—"}</code>
          </p>
          <p style={{ margin: "0.15rem 0" }}>
            displayCandidateUserId：<code style={{ fontSize: "0.74rem", wordBreak: "break-all" }}>{displayCandidateUserId || "—"}</code>
          </p>
        </details>

        <p style={{ margin: "0.45rem 0 0.15rem", fontWeight: 600, color: "#64748b" }}>reasonSummary</p>
        <JsonBlock value={reasonSummary ?? "（无）"} maxHeight={160} />

        {multiSourceFinalDecision ? (
          <>
            <p style={{ margin: "0.55rem 0 0.15rem", fontWeight: 600, color: "#64748b" }}>multiSourceFinalDecision</p>
            <JsonBlock value={multiSourceFinalDecision} maxHeight={260} />
          </>
        ) : (
          <p style={{ margin: "0.45rem 0 0" }}>multiSourceFinalDecision：暂无</p>
        )}

        {meta ? (
          <>
            <p style={{ margin: "0.55rem 0 0.15rem", fontWeight: 600, color: "#64748b" }}>finalize 侧车（finalMatchDecisionMeta）</p>
            <p style={{ margin: "0.2rem 0" }}>
              sourceType：<code>{meta.sourceType ?? "—"}</code>
            </p>
            <p style={{ margin: "0.2rem 0" }}>
              pairwiseProposalRecommendation：<code>{meta.pairwiseProposalRecommendation ?? "—"}</code>
            </p>
            <p style={{ margin: "0.2rem 0" }}>
              wouldChangeStaticResult：<code>{String(meta.wouldChangeStaticResult)}</code>
            </p>
            <p style={{ margin: "0.2rem 0" }}>
              frozen / frozenAt：<code>{String(meta.frozen)}</code>
              {meta.frozenAt ? (
                <>
                  {" "}
                  / <code>{meta.frozenAt}</code>
                </>
              ) : null}
            </p>
            <p style={{ margin: "0.2rem 0" }}>
              appliedToFinalScore：<code>{String(meta.appliedToFinalScore)}</code>
            </p>
            <p style={{ margin: "0.2rem 0" }}>
              appliedToWorkerRanking：<code>{String(meta.appliedToWorkerRanking)}</code>
            </p>
            {meta.fallbackReason != null && meta.fallbackReason !== "" ? (
              <p style={{ margin: "0.2rem 0" }}>
                fallbackReason：<code>{String(meta.fallbackReason)}</code>
              </p>
            ) : null}
          </>
        ) : (
          <p style={{ margin: "0.45rem 0 0" }}>finalize 侧车元数据：暂无或未启用</p>
        )}

        {matchReviewDebug ? (
          <>
            <p style={{ margin: "0.55rem 0 0.15rem", fontWeight: 600, color: "#64748b" }}>Match Review · debug</p>
            <JsonBlock value={matchReviewDebug} maxHeight={200} />
          </>
        ) : null}

        {aiExplanationMeta ? (
          <>
            <p style={{ margin: "0.55rem 0 0.15rem", fontWeight: 600, color: "#64748b" }}>补充解读 · 元数据</p>
            <JsonBlock value={aiExplanationMeta} maxHeight={140} />
          </>
        ) : null}

        {readoutFusion?.debug ? (
          <details style={{ marginTop: "0.5rem", fontSize: "0.76rem", color: "#64748b" }}>
            <summary style={{ cursor: "pointer" }}>读数融合规则（折叠）</summary>
            <p style={{ margin: "0.35rem 0 0", lineHeight: 1.45 }}>
              {readoutFusion.debug.fusionVersion} · {readoutFusion.debug.ruleTrace}
            </p>
          </details>
        ) : null}
      </div>
    </details>
  );
}
