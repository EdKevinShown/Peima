import { useMemo, useState } from "react";

const CONTINUE_ZH = {
  explore_more: "可多了解",
  hold: "保持节奏",
  slow_down: "建议放缓",
};

/** 主视图不展示英文枚举：仅映射已知值，其余返回 null（由一句泛化文案承接）。 */
function continueLabelSafe(v) {
  if (v == null || typeof v !== "string") return null;
  return CONTINUE_ZH[v] ?? null;
}

/** 0–1 → 百分制展示（与 FinalMatch 主指数区分：仅作弱参考）。 */
function formatSimRankScore(v) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  const x = Number(v);
  if (x >= 0 && x <= 1) {
    const pct = x * 100;
    const r = Math.round(pct * 10) / 10;
    return Number.isInteger(r) ? `${Math.round(pct)}` : r.toFixed(1);
  }
  return String(x);
}

function isEvaluatorShape(ev) {
  if (ev == null || typeof ev !== "object" || Array.isArray(ev)) return false;
  const o = ev;
  return (
    typeof o.simulationRankScore === "number" &&
    typeof o.continue_recommendation === "string" &&
    Array.isArray(o.risk_tags) &&
    Array.isArray(o.mitigation_hints)
  );
}

function isTranscriptLiteShape(tl) {
  if (tl == null || typeof tl !== "object" || Array.isArray(tl)) return false;
  const rounds = tl.rounds;
  if (!Array.isArray(rounds)) return false;
  return rounds.every(
    (r) =>
      r &&
      typeof r === "object" &&
      typeof r.round === "number" &&
      typeof r.speaker === "string" &&
      typeof r.text === "string",
  );
}

/** 成功态：正式模块外壳（弱于主结果 Hero）。 */
const moduleShell = {
  marginBottom: "1.25rem",
  padding: "1rem 1rem 1.05rem",
  borderRadius: 10,
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
};

const moduleTitle = {
  fontSize: "1.02rem",
  margin: "0 0 0.35rem",
  color: "#0f172a",
  fontWeight: 700,
};

const moduleSub = {
  margin: "0 0 0.65rem",
  fontSize: "0.82rem",
  color: "#64748b",
  lineHeight: 1.55,
};

const btnRefresh = {
  padding: "0.45rem 0.85rem",
  fontSize: "0.82rem",
  fontWeight: 500,
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  background: "#fff",
  color: "#475569",
  cursor: "pointer",
};

const compactWrap = {
  marginBottom: "0.85rem",
  padding: "0.65rem 0.75rem",
  borderRadius: 8,
  border: "1px solid #e2e8f0",
  background: "#fff",
  maxWidth: 520,
};

/**
 * Phase E v1.1：Final Match「互动与相处参考」（仅呈现层；数据仍来自 GET job）。
 * 门闩不满足时不展示半成品模块；技术字段仅出现在折叠内。
 */
export default function AiSimulationSidecarV0({
  aiSimJobId,
  candidateUserId,
  job,
  jobLoading,
  jobError,
  onRefresh,
}) {
  const [mitigationExpanded, setMitigationExpanded] = useState(false);

  const matched = useMemo(() => {
    if (!job?.results || !candidateUserId) return null;
    return job.results.find((r) => r.candidateUserId === candidateUserId) ?? null;
  }, [job, candidateUserId]);

  const isForbidden = Boolean(jobError && (jobError.includes("403") || jobError.includes("没有权限")));

  if (!aiSimJobId || !candidateUserId) {
    return null;
  }

  if (jobLoading) {
    return (
      <p style={{ ...moduleSub, marginBottom: "0.75rem" }} role="status">
        正在加载相处参考…
      </p>
    );
  }

  if (jobError) {
    return (
      <div style={compactWrap} aria-live="polite">
        {isForbidden ? (
          <p style={{ margin: 0, fontSize: "0.86rem", color: "#64748b", lineHeight: 1.55 }}>
            暂时无法加载相处参考（权限不足）。不影响上方匹配结果与匹配指数。
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: "0.86rem", color: "#64748b", lineHeight: 1.55 }}>
            暂时无法加载相处参考。不影响上方匹配结果。
          </p>
        )}
        <details style={{ marginTop: "0.55rem", fontSize: "0.76rem", color: "#94a3b8" }}>
          <summary style={{ cursor: "pointer", color: "#64748b" }}>查看错误详情（可选）</summary>
          <p style={{ margin: "0.4rem 0 0", wordBreak: "break-word" }}>{jobError}</p>
        </details>
        <button type="button" style={{ ...btnRefresh, marginTop: "0.55rem" }} onClick={onRefresh} disabled={jobLoading}>
          重试加载
        </button>
      </div>
    );
  }

  if (!job) {
    return null;
  }

  if (!matched) {
    return (
      <p style={{ ...moduleSub, marginBottom: "0.75rem" }} role="status">
        当前参考说明与本轮对象未对齐，暂不展示。不影响上方匹配结果。
      </p>
    );
  }

  const st = matched.status;
  if (st === "queued" || st === "running") {
    return (
      <div style={compactWrap} aria-live="polite">
        <p style={{ margin: "0 0 0.55rem", fontSize: "0.86rem", color: "#475569", lineHeight: 1.55 }}>
          {st === "queued" ? "相处参考尚在排队生成。" : "相处参考正在生成中。"}
        </p>
        <button type="button" style={btnRefresh} onClick={onRefresh} disabled={jobLoading}>
          刷新进度
        </button>
        <details style={{ marginTop: "0.55rem", fontSize: "0.74rem", color: "#94a3b8" }}>
          <summary style={{ cursor: "pointer", color: "#64748b" }}>技术状态（可选）</summary>
          <p style={{ margin: "0.35rem 0 0", wordBreak: "break-all" }}>
            <code>{String(job.simulationJobId || "")}</code>
          </p>
          <p style={{ margin: "0.25rem 0 0" }}>
            <code>{String(job.jobStatus || "")}</code>
          </p>
        </details>
      </div>
    );
  }

  if (st === "failed") {
    const fd = matched.failureDetail;
    const hasDetail =
      fd != null && typeof fd === "object" && !Array.isArray(fd) && typeof fd.path === "string";
    return (
      <div style={compactWrap} aria-live="polite">
        <p style={{ margin: "0 0 0.5rem", fontSize: "0.86rem", color: "#64748b", lineHeight: 1.55 }}>
          本次未能生成可用的相处参考，不影响上方匹配结论。
        </p>
        <details style={{ fontSize: "0.78rem", color: "#64748b" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, color: "#475569" }}>查看排障信息（可选）</summary>
          <p style={{ margin: "0.45rem 0 0.2rem" }}>以下为内部排障字段。</p>
          <p style={{ margin: "0.2rem 0" }}>
            <code>{String(matched.errorCode ?? "—")}</code>
          </p>
          {matched.errorCode === "schema_validation" && hasDetail ? (
            <>
              <pre
                style={{
                  margin: "0.35rem 0",
                  padding: "0.45rem 0.55rem",
                  background: "#f1f5f9",
                  borderRadius: 6,
                  fontSize: "0.74rem",
                  overflowX: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {typeof fd.path === "string" ? fd.path : ""}
              </pre>
              <pre
                style={{
                  margin: 0,
                  padding: "0.45rem 0.55rem",
                  background: "#f1f5f9",
                  borderRadius: 6,
                  fontSize: "0.74rem",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {typeof fd.reason === "string" ? fd.reason : "—"}
              </pre>
            </>
          ) : null}
        </details>
        <button type="button" style={{ ...btnRefresh, marginTop: "0.55rem" }} onClick={onRefresh} disabled={jobLoading}>
          刷新
        </button>
      </div>
    );
  }

  if (st !== "succeeded" || !isEvaluatorShape(matched.evaluator)) {
    return (
      <p style={{ ...moduleSub, marginBottom: "0.75rem" }} role="status">
        相处参考暂不可用。不影响上方匹配结果。
      </p>
    );
  }

  const ev = matched.evaluator;
  const hints = ev.mitigation_hints;
  const firstHint = hints[0];
  const restHints = hints.slice(1);
  const continueZh = continueLabelSafe(ev.continue_recommendation);
  const riskTags = Array.isArray(ev.risk_tags) ? ev.risk_tags.filter((t) => typeof t === "string" && t.trim()) : [];

  return (
    <div style={moduleShell} aria-label="互动与相处参考">
      <h3 style={moduleTitle}>互动与相处参考</h3>
      <p style={moduleSub}>
        结合多场景模拟生成的<strong>辅助理解</strong>，便于聊天时心里有个数；<strong>不替代</strong>上方匹配指数与系统结论。
      </p>
      <p style={{ ...moduleSub, marginTop: "-0.35rem", marginBottom: "0.75rem", fontSize: "0.78rem", color: "#94a3b8" }}>
        请以上方主结果为准；本区仅为参考。
      </p>

      <div
        style={{
          marginBottom: "0.75rem",
          padding: "0.5rem 0",
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        <p style={{ margin: "0 0 0.15rem", fontSize: "0.72rem", color: "#94a3b8", fontWeight: 500 }}>参考分（辅助）</p>
        <p style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600, color: "#64748b", letterSpacing: "0.02em" }}>
          {formatSimRankScore(ev.simulationRankScore)}
          <span style={{ fontSize: "0.72rem", fontWeight: 400, color: "#94a3b8", marginLeft: "0.35rem" }}>百分制便于阅读</span>
        </p>
      </div>

      <p style={{ margin: "0 0 0.45rem", fontSize: "0.88rem", color: "#334155", lineHeight: 1.6 }}>
        {continueZh ? (
          <>
            <strong>整体节奏建议：</strong>
            {continueZh}。
          </>
        ) : (
          <>
            <strong>整体节奏：</strong>
            详见下方「聊天与相处参考」具体说明。
          </>
        )}
      </p>

      {riskTags.length > 0 ? (
        <details style={{ margin: "0.55rem 0 0.65rem", fontSize: "0.82rem", color: "#475569" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, color: "#475569" }}>
            查看互动中可能需要留意的维度（可选）
          </summary>
          <p style={{ margin: "0.45rem 0 0.35rem", fontSize: "0.76rem", color: "#64748b" }}>
            以下为系统生成的内部标签，默认不展开即可使用本页主结果。
          </p>
          <ul style={{ margin: 0, paddingLeft: "1.15rem", lineHeight: 1.55, fontSize: "0.78rem", color: "#475569" }}>
            {riskTags.map((t, i) => (
              <li key={`rt-${i}`} style={{ marginBottom: "0.2rem" }}>
                <code style={{ fontSize: "0.74rem", wordBreak: "break-all" }}>{t}</code>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <h4 style={{ margin: "0.85rem 0 0.35rem", fontSize: "0.88rem", fontWeight: 600, color: "#334155" }}>
        聊天与相处参考
      </h4>
      {hints.length === 0 ? (
        <p style={{ margin: "0 0 0.65rem", fontSize: "0.86rem", color: "#64748b" }}>暂无额外提示。</p>
      ) : (
        <div style={{ margin: "0 0 0.65rem" }}>
          <ul style={{ margin: 0, paddingLeft: "1.15rem", lineHeight: 1.6, color: "#334155", fontSize: "0.88rem" }}>
            <li style={{ marginBottom: "0.35rem" }}>{firstHint}</li>
            {mitigationExpanded && restHints.length > 0
              ? restHints.map((t, i) => (
                  <li key={`mh-${i}`} style={{ marginBottom: "0.35rem" }}>
                    {t}
                  </li>
                ))
              : null}
          </ul>
          {restHints.length > 0 && !mitigationExpanded ? (
            <button
              type="button"
              style={{
                ...btnRefresh,
                marginTop: "0.35rem",
                padding: "0.3rem 0.55rem",
                fontSize: "0.78rem",
              }}
              onClick={() => setMitigationExpanded(true)}
            >
              还有 {restHints.length} 条…
            </button>
          ) : null}
          {mitigationExpanded && restHints.length > 0 ? (
            <button
              type="button"
              style={{ ...btnRefresh, marginTop: "0.35rem", padding: "0.3rem 0.55rem", fontSize: "0.78rem" }}
              onClick={() => setMitigationExpanded(false)}
            >
              收起
            </button>
          ) : null}
        </div>
      )}

      <details style={{ marginTop: "0.35rem", fontSize: "0.84rem", color: "#475569" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600, color: "#475569", userSelect: "none" }}>
          查看示例对话（可选）
        </summary>
        {isTranscriptLiteShape(matched.transcriptLite) ? (
          <ol style={{ margin: "0.55rem 0 0", paddingLeft: "1.25rem", lineHeight: 1.55, color: "#334155", fontSize: "0.84rem" }}>
            {matched.transcriptLite.rounds.map((r, i) => (
              <li key={`tr-${i}`} style={{ marginBottom: "0.45rem" }}>
                <strong style={{ color: "#334155" }}>{r.speaker}</strong>
                <span style={{ color: "#94a3b8" }}> · 第 {r.round} 轮</span>
                <div style={{ marginTop: "0.2rem", whiteSpace: "pre-wrap" }}>{r.text}</div>
              </li>
            ))}
          </ol>
        ) : (
          <p style={{ margin: "0.55rem 0 0", fontSize: "0.82rem", color: "#64748b" }}>暂无示例对话内容。</p>
        )}
      </details>

      <details style={{ marginTop: "0.55rem", fontSize: "0.74rem", color: "#94a3b8" }}>
        <summary style={{ cursor: "pointer", color: "#64748b" }}>技术细节（可选）</summary>
        <p style={{ margin: "0.4rem 0 0", wordBreak: "break-all" }}>
          <code>{String(job.simulationJobId || "")}</code>
        </p>
        {typeof ev.continue_recommendation === "string" && ev.continue_recommendation && !continueZh ? (
          <p style={{ margin: "0.25rem 0 0", wordBreak: "break-all" }}>
            <code>{ev.continue_recommendation}</code>
          </p>
        ) : null}
      </details>

      <button type="button" style={{ ...btnRefresh, marginTop: "0.55rem" }} onClick={onRefresh} disabled={jobLoading}>
        刷新参考
      </button>

      <p style={{ margin: "0.65rem 0 0", fontSize: "0.78rem", color: "#94a3b8", lineHeight: 1.45 }}>
        准备好后，请使用页面底部<strong>进入聊天</strong>开始真实对话。
      </p>
    </div>
  );
}
