import { useMemo, useState } from "react";

const CONTINUE_ZH = {
  explore_more: "可多了解",
  hold: "保持节奏",
  slow_down: "建议放缓",
};

function continueLabel(v) {
  if (v == null || typeof v !== "string") return "—";
  return CONTINUE_ZH[v] ?? v;
}

/** 0–1 → 百分制展示，与 FinalMatchPage formatScoreDisplay 一致语义 */
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
      typeof r.intent_tag === "string" &&
      typeof r.text === "string",
  );
}

const shellStyle = {
  marginBottom: "1.25rem",
  padding: "1rem 1rem 1.1rem",
  borderRadius: 10,
  border: "1px solid #a5b4fc",
  background: "linear-gradient(180deg, #f5f3ff 0%, #ffffff 40%)",
  boxShadow: "0 1px 4px rgba(91,33,182,0.06)",
};

const titleStyle = {
  fontSize: "1.02rem",
  margin: "0 0 0.35rem",
  color: "#4c1d95",
  fontWeight: 700,
};

const subStyle = {
  margin: "0 0 0.85rem",
  fontSize: "0.82rem",
  color: "#6b21a8",
  lineHeight: 1.55,
};

const btnRefresh = {
  padding: "0.45rem 0.85rem",
  fontSize: "0.82rem",
  fontWeight: 500,
  border: "1px solid #c4b5fd",
  borderRadius: 8,
  background: "#fff",
  color: "#5b21b6",
  cursor: "pointer",
};

/**
 * AI 模拟 v1 侧车（内部）：依赖父组件拉取 GET job 后传入。
 * @param {object} props
 * @param {string} props.aiSimJobId
 * @param {string | null} props.candidateUserId
 * @param {import("../../api/ai-simulation-v1").AiSimulationV1JobResponse | null} props.job
 * @param {boolean} props.jobLoading
 * @param {string | null} props.jobError
 * @param {() => void} props.onRefresh
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

  if (!aiSimJobId) {
    return (
      <div style={shellStyle} aria-label="AI 模拟侧车">
        <h3 style={titleStyle}>AI 模拟（内部参考）</h3>
        <p style={{ ...subStyle, marginBottom: 0 }}>
          未关联模拟 job。内部验收请在 URL 增加 <code style={{ fontSize: "0.78rem" }}>aiSimJobId</code>
          （由 Admin enqueue 返回的 <code style={{ fontSize: "0.78rem" }}>simulationJobId</code>）。
        </p>
      </div>
    );
  }

  if (!candidateUserId) {
    return (
      <div style={shellStyle} aria-label="AI 模拟侧车">
        <h3 style={titleStyle}>AI 模拟（内部参考）</h3>
        <p style={{ ...subStyle, marginBottom: 0 }}>等待当前匹配结果中的对方 ID…</p>
      </div>
    );
  }

  if (jobLoading) {
    return (
      <div style={shellStyle} aria-label="AI 模拟侧车">
        <h3 style={titleStyle}>AI 模拟（内部参考）</h3>
        <p style={{ margin: 0, fontSize: "0.88rem", color: "#64748b" }}>加载模拟 job…</p>
      </div>
    );
  }

  if (jobError) {
    return (
      <div style={shellStyle} aria-label="AI 模拟侧车">
        <h3 style={titleStyle}>AI 模拟（内部参考）</h3>
        {isForbidden ? (
          <p style={{ margin: 0, fontSize: "0.88rem", color: "#92400e", lineHeight: 1.55 }}>
            无权限加载 AI 模拟结果：需要 Admin 白名单账号与有效登录。侧车不影响上方匹配结论。
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: "0.88rem", color: "#b00020" }} role="alert">
            {jobError}
          </p>
        )}
      </div>
    );
  }

  if (!job) {
    return null;
  }

  if (!matched) {
    return (
      <div style={shellStyle} aria-label="AI 模拟侧车">
        <h3 style={titleStyle}>AI 模拟（内部参考）</h3>
        <p style={{ margin: "0 0 0.5rem", fontSize: "0.88rem", color: "#92400e", lineHeight: 1.55 }}>
          当前页面的对方（<code style={{ fontSize: "0.76rem" }}>{candidateUserId}</code>）不在该模拟 job 的{" "}
          <code style={{ fontSize: "0.76rem" }}>results</code> 队列中。请核对 enqueue 时的 hint 与 Top-8 是否包含此人。
        </p>
        <p style={{ margin: 0, fontSize: "0.78rem", color: "#64748b" }}>
          jobId：<code style={{ fontSize: "0.74rem", wordBreak: "break-all" }}>{aiSimJobId}</code>
        </p>
      </div>
    );
  }

  const st = matched.status;
  if (st === "queued" || st === "running") {
    return (
      <div style={shellStyle} aria-label="AI 模拟侧车">
        <h3 style={titleStyle}>AI 模拟（内部参考）</h3>
        <p style={{ margin: "0 0 0.65rem", fontSize: "0.88rem", color: "#5b21b6", lineHeight: 1.55 }}>
          {st === "queued" ? "该候选在模拟队列中排队，尚未执行。" : "该候选的模拟正在执行中…"}
        </p>
        <button type="button" style={btnRefresh} onClick={onRefresh} disabled={jobLoading}>
          刷新状态
        </button>
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.74rem", color: "#64748b" }}>
          job：<code style={{ fontSize: "0.72rem", wordBreak: "break-all" }}>{job.simulationJobId}</code> · jobStatus：
          <code style={{ fontSize: "0.72rem" }}>{job.jobStatus}</code>
        </p>
      </div>
    );
  }

  if (st === "failed") {
    const fd = matched.failureDetail;
    const hasDetail =
      fd != null && typeof fd === "object" && !Array.isArray(fd) && typeof fd.path === "string";
    return (
      <div style={shellStyle} aria-label="AI 模拟侧车">
        <h3 style={titleStyle}>AI 模拟（内部参考）</h3>
        <p style={{ margin: "0 0 0.5rem", fontSize: "0.86rem", color: "#64748b", lineHeight: 1.55 }}>
          模拟未产出可用结构化结果；<strong>不</strong>作为人工审核结论，仅用于排障与迭代。
        </p>
        <p style={{ margin: "0 0 0.25rem", fontSize: "0.82rem", color: "#334155" }}>
          <strong>errorCode</strong>：<code style={{ fontSize: "0.8rem" }}>{matched.errorCode ?? "—"}</code>
        </p>
        {matched.errorCode === "schema_validation" && hasDetail ? (
          <>
            <p style={{ margin: "0.35rem 0 0.15rem", fontSize: "0.82rem", color: "#334155" }}>
              <strong>failureDetail.path</strong>
            </p>
            <pre
              style={{
                margin: "0 0 0.35rem",
                padding: "0.45rem 0.55rem",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                fontSize: "0.76rem",
                overflowX: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {fd.path}
            </pre>
            <p style={{ margin: "0.25rem 0 0.15rem", fontSize: "0.82rem", color: "#334155" }}>
              <strong>failureDetail.reason</strong>
            </p>
            <pre
              style={{
                margin: 0,
                padding: "0.45rem 0.55rem",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                fontSize: "0.76rem",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {typeof fd.reason === "string" ? fd.reason : "—"}
            </pre>
          </>
        ) : matched.errorCode === "schema_validation" ? (
          <p style={{ margin: "0.35rem 0 0", fontSize: "0.8rem", color: "#64748b" }}>
            无字段级 failureDetail（请查实现或日志）。
          </p>
        ) : null}
        <div style={{ marginTop: "0.65rem" }}>
          <button type="button" style={btnRefresh} onClick={onRefresh} disabled={jobLoading}>
            刷新
          </button>
        </div>
      </div>
    );
  }

  if (st !== "succeeded" || !isEvaluatorShape(matched.evaluator)) {
    return (
      <div style={shellStyle} aria-label="AI 模拟侧车">
        <h3 style={titleStyle}>AI 模拟（内部参考）</h3>
        <p style={{ margin: 0, fontSize: "0.88rem", color: "#64748b" }}>
          状态为 <code>{st}</code>，且无可用 evaluator 数据。
        </p>
      </div>
    );
  }

  const ev = matched.evaluator;
  const hints = ev.mitigation_hints;
  const firstHint = hints[0];
  const restHints = hints.slice(1);

  return (
    <div style={shellStyle} aria-label="AI 模拟侧车">
      <h3 style={titleStyle}>AI 模拟（内部参考）</h3>
      <p style={subStyle}>
        以下为 Admin 路径下「真正 AI 模拟 v1」的结构化输出，仅供内部审核/复核参考；<strong>非</strong>用户前台功能，<strong>不</strong>写入匹配主链与最终分。
      </p>

      <div
        style={{
          padding: "0.75rem 0.85rem",
          borderRadius: 8,
          background: "#fff",
          border: "1px solid #e9d5ff",
          marginBottom: "0.65rem",
        }}
      >
        <p style={{ margin: "0 0 0.2rem", fontSize: "0.75rem", color: "#64748b" }}>模拟参考分（闭区间 [0,1]；下为百分制便于扫读）</p>
        <p style={{ margin: 0, fontSize: "1.65rem", fontWeight: 800, color: "#6d28d9" }}>
          {formatSimRankScore(ev.simulationRankScore)}
          <span style={{ fontSize: "0.8rem", fontWeight: 500, color: "#7c3aed", marginLeft: "0.35rem" }}>· 原值 {ev.simulationRankScore}</span>
        </p>
      </div>

      <p style={{ margin: "0 0 0.35rem", fontSize: "0.82rem", color: "#64748b" }}>继续了解建议</p>
      <p style={{ margin: "0 0 0.75rem", fontWeight: 600, color: "#1e1b4b", fontSize: "0.95rem" }}>
        {continueLabel(ev.continue_recommendation)}
        <span style={{ fontWeight: 400, color: "#64748b", fontSize: "0.8rem", marginLeft: "0.35rem" }}>
          ({ev.continue_recommendation})
        </span>
      </p>

      <p style={{ margin: "0 0 0.35rem", fontSize: "0.82rem", color: "#64748b" }}>风险标签</p>
      {ev.risk_tags.length === 0 ? (
        <p style={{ margin: "0 0 0.75rem", fontSize: "0.88rem", color: "#475569" }}>无</p>
      ) : (
        <ul style={{ margin: "0 0 0.75rem", paddingLeft: "1.15rem", lineHeight: 1.55, color: "#334155", fontSize: "0.88rem" }}>
          {ev.risk_tags.map((t, i) => (
            <li key={`rt-${i}`} style={{ marginBottom: "0.25rem" }}>
              <code style={{ fontSize: "0.82rem" }}>{t}</code>
            </li>
          ))}
        </ul>
      )}

      <p style={{ margin: "0 0 0.35rem", fontSize: "0.82rem", color: "#64748b" }}>缓解提示</p>
      {hints.length === 0 ? (
        <p style={{ margin: "0 0 0.65rem", fontSize: "0.88rem", color: "#475569" }}>无</p>
      ) : (
        <div style={{ margin: "0 0 0.65rem" }}>
          <p style={{ margin: 0, lineHeight: 1.6, color: "#334155", fontSize: "0.88rem" }}>{firstHint}</p>
          {restHints.length > 0 ? (
            mitigationExpanded ? (
              <ul style={{ margin: "0.45rem 0 0", paddingLeft: "1.15rem", lineHeight: 1.55, color: "#334155", fontSize: "0.88rem" }}>
                {restHints.map((t, i) => (
                  <li key={`mh-${i}`} style={{ marginBottom: "0.25rem" }}>
                    {t}
                  </li>
                ))}
              </ul>
            ) : (
              <button
                type="button"
                style={{
                  ...btnRefresh,
                  marginTop: "0.45rem",
                  padding: "0.3rem 0.55rem",
                  fontSize: "0.78rem",
                }}
                onClick={() => setMitigationExpanded(true)}
              >
                还有 {restHints.length} 条提示…
              </button>
            )
          ) : null}
          {mitigationExpanded && restHints.length > 0 ? (
            <button
              type="button"
              style={{ ...btnRefresh, marginTop: "0.35rem", padding: "0.3rem 0.55rem", fontSize: "0.78rem" }}
              onClick={() => setMitigationExpanded(false)}
            >
              收起额外提示
            </button>
          ) : null}
        </div>
      )}

      <details style={{ marginTop: "0.35rem", fontSize: "0.86rem", color: "#4c1d95" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600, userSelect: "none" }}>查看模拟对话（4 轮）</summary>
        {isTranscriptLiteShape(matched.transcriptLite) ? (
          <ol style={{ margin: "0.55rem 0 0", paddingLeft: "1.25rem", lineHeight: 1.55, color: "#334155", fontSize: "0.86rem" }}>
            {matched.transcriptLite.rounds.map((r, i) => (
              <li key={`tr-${i}`} style={{ marginBottom: "0.45rem" }}>
                <strong style={{ color: "#5b21b6" }}>{r.speaker}</strong> · 轮 {r.round}{" "}
                <code style={{ fontSize: "0.74rem", color: "#64748b" }}>{r.intent_tag}</code>
                <div style={{ marginTop: "0.2rem", whiteSpace: "pre-wrap" }}>{r.text}</div>
              </li>
            ))}
          </ol>
        ) : (
          <p style={{ margin: "0.55rem 0 0", fontSize: "0.82rem", color: "#64748b" }}>无 transcript 数据或格式异常。</p>
        )}
      </details>

      <p style={{ margin: "0.65rem 0 0", fontSize: "0.72rem", color: "#94a3b8" }}>
        job：<code style={{ fontSize: "0.7rem", wordBreak: "break-all" }}>{job.simulationJobId}</code>
      </p>
      <button type="button" style={{ ...btnRefresh, marginTop: "0.45rem" }} onClick={onRefresh} disabled={jobLoading}>
        刷新模拟数据
      </button>
    </div>
  );
}
