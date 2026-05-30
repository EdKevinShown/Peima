/**
 * M5.5-UI-R1 / R3: technical fields — default collapsed; full text in scroll areas (no half-sentence truncation).
 * M6.0-H3: optional v1 shadow audit line (folded; not a user-facing score card).
 */

/** 0–1 → 百分数一位小数；缺失显示「暂无」。 */
function formatV1ShadowAuditPercent(score) {
  if (score == null || typeof score !== "number" || Number.isNaN(score) || !Number.isFinite(score)) {
    return "暂无";
  }
  return `${(score * 100).toFixed(1)}%`;
}

function JsonBlock({ value, maxHeight = 320 }) {
  let text = "—";
  try {
    text = value == null ? "—" : typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  return (
    <pre className="final-match-json-block" style={{ maxHeight }}>
      {text}
    </pre>
  );
}

function TechLabel({ children }) {
  return <p className="mt-2 mb-0.5 font-semibold text-white/50 text-xs">{children}</p>;
}

/**
 * Inner technical body (embed inside a parent `<details>` from FinalMatchPage).
 */
export function FinalMatchTechnicalDetailsContent({
  displaySourceType,
  /** M6.0-r8: optional echo when API adds `fallbackUsed` on GET payload. */
  displayResolverFallbackUsed,
  /** M6.5-C2: GET resolved projection（折叠；与主流程一致，不解析 raw RRM meta）。 */
  resolvedCandidateUserId,
  resolvedSourceType,
  chatTargetUserId,
  timelineTargetUserId,
  feedbackTargetUserId,
  scoreOwnerCandidateUserId,
  resolvedFinalScore,
  resolvedScoreOwnerCandidateUserId,
  resolvedScoreSourceType,
  scoreProjectionFallbackUsed,
  scoreProjectionFallbackReason,
  explanationOwnerCandidateUserId,
  /** M6.6-C5：与 resolved 展示对象比较；仅技术区展示。 */
  scoreOwnerMismatch = false,
  explanationOwnerMismatch = false,
  apiConsistencyHasScoreOwnerMismatch = false,
  apiConsistencyHasExplanationOwnerMismatch = false,
  resolvedFallbackReason,
  consistencyWarnings,
  finalMatchDecisionMeta,
  readoutFusion,
  candidateUserId,
  displayCandidateUserId,
  /** M6.0-H3: API `relationshipProfileScore`（v1 shadow）；主流程不再展示，仅技术审计。 */
  relationshipProfileScoreV1,
  finalScore,
  reasonSummary,
  multiSourceFinalDecision,
  matchReviewDebug,
  aiExplanationMeta,
  matchInsights,
  matchReviewFull,
  interactionSimFull,
  footerPanels,
}) {
  const meta = finalMatchDecisionMeta && typeof finalMatchDecisionMeta === "object" ? finalMatchDecisionMeta : null;
  const bullets = Array.isArray(readoutFusion?.bulletsZh) ? readoutFusion.bulletsZh : [];

  return (
    <div className="final-match-tech mt-2">
      <p className="my-0.5">
        展示来源类型：<code>{displaySourceType || "—"}</code>
      </p>
      {typeof displayResolverFallbackUsed === "boolean" ? (
        <p style={{ margin: "0.2rem 0" }}>
          displayResolver fallbackUsed：<code>{String(displayResolverFallbackUsed)}</code>
        </p>
      ) : null}
      {displaySourceType === "rrm_top2_v2_selector_readonly" ? (
        <p style={{ margin: "0.35rem 0 0", fontSize: "0.74rem", color: "#64748b", lineHeight: 1.5 }}>
          M6 readonly display：服务端在 <code>resolveMatchResultDisplay</code> 中解析；本页对<strong>该路径</strong>仅消费已返回的{" "}
          <code>displaySourceType</code>，不解析 <code>matchInsights.rrmV2Top2Selector</code>，不从{" "}
          <code>matchInsights</code> 读取原始 <code>scoreShadowV2</code> / <code>scoreShadow</code> 来推断展示来源。
        </p>
      ) : null}
      <p style={{ margin: "0.2rem 0" }}>
        finalScore（API 原值）：<code>{finalScore == null ? "—" : String(finalScore)}</code>
      </p>

      {relationshipProfileScoreV1 != null &&
      typeof relationshipProfileScoreV1 === "object" &&
      !Array.isArray(relationshipProfileScoreV1) ? (
        <details style={{ marginTop: "0.45rem", fontSize: "0.76rem", color: "#64748b" }}>
          <summary style={{ cursor: "pointer", fontWeight: 500, userSelect: "none" }}>
            旧版 relationshipProfileScore v1（仅技术审计）
          </summary>
          <p style={{ margin: "0.35rem 0 0", lineHeight: 1.5 }}>
            读数（0–1 → %）：<strong style={{ color: "#334155" }}>{formatV1ShadowAuditPercent(relationshipProfileScoreV1.score)}</strong>
            {relationshipProfileScoreV1.source ? (
              <>
                {" "}
                · source：<code>{String(relationshipProfileScoreV1.source)}</code>
              </>
            ) : null}
          </p>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.72rem", color: "#94a3b8", lineHeight: 1.45 }}>
            与主视觉 V2 刻度与定义不同；不作为用户可见关系画像主分。
          </p>
        </details>
      ) : null}

      <details style={{ marginTop: "0.45rem" }}>
        <summary style={{ cursor: "pointer", fontWeight: 500, color: "#475569", userSelect: "none" }}>内部标识符（默认折叠）</summary>
        <p style={{ margin: "0.35rem 0 0.15rem" }}>
          MatchResult.candidateUserId：<code style={{ fontSize: "0.74rem", wordBreak: "break-all" }}>{candidateUserId || "—"}</code>
        </p>
        <p style={{ margin: "0.15rem 0" }}>
          displayCandidateUserId：<code style={{ fontSize: "0.74rem", wordBreak: "break-all" }}>{displayCandidateUserId || "—"}</code>
        </p>
        {resolvedCandidateUserId ||
        resolvedSourceType ||
        chatTargetUserId ||
        timelineTargetUserId ||
        feedbackTargetUserId ||
        scoreOwnerCandidateUserId ||
        explanationOwnerCandidateUserId ? (
          <>
            <p style={{ margin: "0.55rem 0 0.15rem", fontWeight: 600, color: "#64748b" }}>M6.5-C2 · resolved 投影（与主路径 fallback 一致）</p>
            <p style={{ margin: "0.15rem 0" }}>
              resolvedCandidateUserId：
              <code style={{ fontSize: "0.74rem", wordBreak: "break-all" }}>{resolvedCandidateUserId || "—"}</code>
            </p>
            <p style={{ margin: "0.15rem 0" }}>
              resolvedSourceType：<code>{resolvedSourceType || "—"}</code>
            </p>
            <p style={{ margin: "0.15rem 0" }}>
              chatTargetUserId：
              <code style={{ fontSize: "0.74rem", wordBreak: "break-all" }}>{chatTargetUserId || "—"}</code>
            </p>
            <p style={{ margin: "0.15rem 0" }}>
              timelineTargetUserId：
              <code style={{ fontSize: "0.74rem", wordBreak: "break-all" }}>{timelineTargetUserId || "—"}</code>
            </p>
            <p style={{ margin: "0.15rem 0" }}>
              feedbackTargetUserId：
              <code style={{ fontSize: "0.74rem", wordBreak: "break-all" }}>{feedbackTargetUserId || "—"}</code>
            </p>
            <p style={{ margin: "0.15rem 0" }}>
              scoreOwnerCandidateUserId：
              <code style={{ fontSize: "0.74rem", wordBreak: "break-all" }}>{scoreOwnerCandidateUserId || "—"}</code>
            </p>
            <p style={{ margin: "0.15rem 0" }}>
              baseline finalScore：
              <code style={{ fontSize: "0.74rem" }}>{finalScore == null ? "—" : String(finalScore)}</code>
            </p>
            <p style={{ margin: "0.15rem 0" }}>
              resolvedFinalScore：
              <code style={{ fontSize: "0.74rem" }}>
                {resolvedFinalScore == null ? "—" : String(resolvedFinalScore)}
              </code>
            </p>
            <p style={{ margin: "0.15rem 0" }}>
              resolvedScoreOwnerCandidateUserId：
              <code style={{ fontSize: "0.74rem", wordBreak: "break-all" }}>
                {resolvedScoreOwnerCandidateUserId || "—"}
              </code>
            </p>
            <p style={{ margin: "0.15rem 0" }}>
              resolvedScoreSourceType：<code>{resolvedScoreSourceType || "—"}</code>
            </p>
            <p style={{ margin: "0.15rem 0" }}>
              scoreProjectionFallbackUsed：
              <code>{scoreProjectionFallbackUsed == null ? "—" : String(scoreProjectionFallbackUsed)}</code>
            </p>
            <p style={{ margin: "0.15rem 0" }}>
              scoreProjectionFallbackReason：<code>{scoreProjectionFallbackReason || "—"}</code>
            </p>
            <p style={{ margin: "0.15rem 0" }}>
              explanationOwnerCandidateUserId：
              <code style={{ fontSize: "0.74rem", wordBreak: "break-all" }}>{explanationOwnerCandidateUserId || "—"}</code>
            </p>
            <p style={{ margin: "0.45rem 0 0.15rem", fontWeight: 600, color: "#64748b" }}>M6.6-C5 · owner 对齐（只读）</p>
            <p style={{ margin: "0.15rem 0", fontSize: "0.74rem", lineHeight: 1.5 }}>
              scoreOwnerMismatch：<code>{String(scoreOwnerMismatch)}</code>
              {apiConsistencyHasScoreOwnerMismatch ? (
                <span style={{ color: "#94a3b8" }}>
                  {" "}
                  · API 已含 <code>score_owner_mismatch</code>（主路径分数区不重复短提示）
                </span>
              ) : null}
            </p>
            <p style={{ margin: "0.15rem 0", fontSize: "0.74rem", lineHeight: 1.5 }}>
              explanationOwnerMismatch：<code>{String(explanationOwnerMismatch)}</code>
              {apiConsistencyHasExplanationOwnerMismatch ? (
                <span style={{ color: "#94a3b8" }}>
                  {" "}
                  · API 已含 <code>explanation_owner_mismatch</code>（主路径说明区不重复短提示）
                </span>
              ) : null}
            </p>
            {resolvedFallbackReason != null && resolvedFallbackReason !== "" ? (
              <p style={{ margin: "0.15rem 0" }}>
                projection fallbackReason：<code>{String(resolvedFallbackReason)}</code>
              </p>
            ) : null}
            {Array.isArray(consistencyWarnings) && consistencyWarnings.length > 0 ? (
              <>
                <p style={{ margin: "0.35rem 0 0.15rem", fontWeight: 600, color: "#64748b" }}>consistencyWarnings</p>
                <JsonBlock value={consistencyWarnings} maxHeight={220} />
              </>
            ) : null}
          </>
        ) : null}
      </details>

      <p style={{ margin: "0.45rem 0 0.15rem", fontWeight: 600, color: "#64748b" }}>reasonSummary（原文）</p>
      <JsonBlock value={reasonSummary ?? "（无）"} maxHeight={220} />

      {multiSourceFinalDecision ? (
        <>
          <p style={{ margin: "0.55rem 0 0.15rem", fontWeight: 600, color: "#64748b" }}>multiSourceFinalDecision（完整 JSON）</p>
          <JsonBlock value={multiSourceFinalDecision} maxHeight={360} />
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

      {matchInsights != null ? (
        <>
          <p style={{ margin: "0.55rem 0 0.15rem", fontWeight: 600, color: "#64748b" }}>matchInsights（原文 JSON）</p>
          <JsonBlock value={matchInsights} maxHeight={360} />
        </>
      ) : null}

      {matchReviewFull != null ? (
        <>
          <p style={{ margin: "0.55rem 0 0.15rem", fontWeight: 600, color: "#64748b" }}>Match Review（完整响应 JSON）</p>
          <JsonBlock value={matchReviewFull} maxHeight={360} />
        </>
      ) : null}

      {interactionSimFull != null ? (
        <>
          <p style={{ margin: "0.55rem 0 0.15rem", fontWeight: 600, color: "#64748b" }}>初次聊天预判（interaction lite 完整 JSON）</p>
          <JsonBlock value={interactionSimFull} maxHeight={320} />
        </>
      ) : null}

      {readoutFusion?.headlineZh?.trim() || bullets.length > 0 ? (
        <>
          <p style={{ margin: "0.55rem 0 0.15rem", fontWeight: 600, color: "#64748b" }}>读数摘要（完整）</p>
          {readoutFusion?.headlineZh?.trim() ? (
            <p style={{ margin: "0.35rem 0 0", fontSize: "0.82rem", color: "#334155", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
              {readoutFusion.headlineZh.trim()}
            </p>
          ) : null}
          {bullets.length > 0 ? (
            <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.1rem", color: "#475569", fontSize: "0.82rem", lineHeight: 1.55 }}>
              {bullets.map((line, i) => (
                <li key={`readout-b-${i}`} style={{ marginBottom: "0.25rem" }}>
                  {typeof line === "string" ? line : String(line)}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}

      {matchReviewDebug ? (
        <>
          <p style={{ margin: "0.55rem 0 0.15rem", fontWeight: 600, color: "#64748b" }}>Match Review · debug</p>
          <JsonBlock value={matchReviewDebug} maxHeight={220} />
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
          <p style={{ margin: "0.35rem 0 0", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
            {readoutFusion.debug.fusionVersion} · {readoutFusion.debug.ruleTrace}
          </p>
        </details>
      ) : null}

      {footerPanels ? (
        <div className="mt-4 pt-4 border-t border-white/[0.08] final-match-tech">{footerPanels}</div>
      ) : null}
    </div>
  );
}

/** Standalone collapsible (used when not embedding in a larger technical bundle). */
export default function FinalMatchTechnicalDetails(props) {
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
      <FinalMatchTechnicalDetailsContent {...props} />
    </details>
  );
}
