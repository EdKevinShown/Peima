import { useMemo, useState } from "react";

const CONTINUE_ZH = {
  explore_more: "可多了解",
  hold: "保持节奏",
  slow_down: "建议放缓",
};

/** RRM-Sim `suggestedAction` — 用户可见文案（不展示英文枚举本身）。 */
const RRM_ACTION_ZH = {
  continue_lightly: "继续轻松了解",
  maintain: "维持当前节奏",
  soft_progress: "可以轻微推进",
  slow_down: "建议放慢节奏",
  stop_or_step_back: "停止推进或明显后撤",
};

/** RRM-Sim `progressionWindow` — 温和表述，避免「强烈推进」等措辞。 */
const RRM_PROGRESSION_ZH = {
  closed: "当前不适合推进",
  weak_open: "可以继续观察",
  open: "适合自然了解",
  strong_open: "互动窗口较好",
};

/** 与 `suggestedAction` 对齐的温和说明（不含操控/高压用语）。 */
const RRM_GENTLE_BY_ACTION = {
  continue_lightly: "你们的模拟互动整体较自然，适合从轻松了解开始。",
  maintain: "当前节奏比较平稳，可以继续观察对方是否有更稳定的投入。",
  soft_progress: "模拟显示互动质量较好，可以尝试轻度增加分享或低压力邀约。",
  slow_down: "当前存在节奏或风险信号，建议放慢，不要急于推进关系。",
  stop_or_step_back: "当前不适合继续推进。建议尊重边界，降低互动压力。",
};

function rrmSuggestedLabel(action) {
  if (action == null || typeof action !== "string") return null;
  return RRM_ACTION_ZH[action] ?? null;
}

function rrmProgressionLabel(window) {
  if (window == null || typeof window !== "string") return null;
  return RRM_PROGRESSION_ZH[window] ?? null;
}

function rrmGentleCopy(action) {
  if (action == null || typeof action !== "string") return null;
  return RRM_GENTLE_BY_ACTION[action] ?? null;
}

/**
 * 最多 3 条用户可读证据：优先 R（尊重/边界风险）、其次 D（节奏/目标分歧），再 E/S/Q，最后补充 C 侧说明。
 * 不拼接 JSON；不展示 C/A/S…字母分数字段名。
 */
function pickRrmEvidenceLinesPrioritized(rrm) {
  if (!rrm || typeof rrm !== "object" || !rrm.evidence || typeof rrm.evidence !== "object") return [];
  const ev = rrm.evidence;
  const scores = rrm.scores && typeof rrm.scores === "object" ? rrm.scores : {};
  const RPre = typeof scores.R_pre === "number" && !Number.isNaN(scores.R_pre) ? scores.R_pre : null;
  const DPre = typeof scores.D_pre === "number" && !Number.isNaN(scores.D_pre) ? scores.D_pre : null;

  const take = (arr, n) =>
    Array.isArray(arr)
      ? arr.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()).slice(0, n)
      : [];

  const out = [];
  const respectStop = rrm.suggestedAction === "stop_or_step_back";
  const rSignal = RPre != null && RPre >= 0.25;

  if (respectStop || rSignal) {
    out.push(...take(ev.R_pre, 2));
  }
  if (out.length < 3 && DPre != null && DPre >= 0.55) {
    out.push(...take(ev.D_pre, 2));
  }
  if (out.length < 3) {
    for (const k of ["E_sim", "S_sim", "Q_sim"]) {
      if (out.length >= 3) break;
      out.push(...take(ev[k], 1));
    }
  }
  if (out.length < 3) {
    out.push(...take(ev.C_pred, 3 - out.length));
  }

  const seen = new Set();
  const deduped = [];
  for (const line of out) {
    const t = String(line).trim();
    if (!t || seen.has(t)) continue;
    if (/RFI_scenario|RFI_sim|P\s*=\s*1\s*\+\s*\(1\s*-\s*S\)/i.test(t)) continue;
    seen.add(t);
    deduped.push(t);
    if (deduped.length >= 3) break;
  }
  return deduped;
}

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

/** RRM-Sim `simulatedRhythmScore`（已为 0–100）。 */
function formatRhythmRefScore100(v) {
  if (v == null || Number.isNaN(Number(v))) return null;
  const n = Math.round(Number(v));
  return `${Math.min(100, Math.max(0, n))}`;
}

/** 场景 evaluator.scenarioScore：0–1 或 0–100 → 整数 /100 展示。 */
function formatScenarioPerfRef(raw) {
  if (raw == null || Number.isNaN(Number(raw))) return null;
  const x = Number(raw);
  if (x >= 0 && x <= 1) return Math.round(x * 100);
  if (x >= 0 && x <= 100) return Math.round(x);
  return null;
}

/** 将 `signals.nextStepSuitability` 映射为中文（兼容含枚举子串的短句）。 */
function nextStepZhFromSignals(raw) {
  if (raw == null || typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  const direct = rrmSuggestedLabel(t);
  if (direct) return direct;
  const keys = ["stop_or_step_back", "slow_down", "maintain", "soft_progress", "continue_lightly"];
  for (const k of keys) {
    if (t.includes(k)) return RRM_ACTION_ZH[k] ?? null;
  }
  return t.length > 40 ? `${t.slice(0, 40)}…` : t;
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

/** M0.6-Full — full RRM-ready payload stored in `transcriptLite`. */
function isAiSimulationV2Payload(tl) {
  if (tl == null || typeof tl !== "object" || Array.isArray(tl)) return false;
  if (tl.schemaVersion !== 2) return false;
  return Array.isArray(tl.scenarioResults) && tl.scenarioResults.length > 0;
}

/** 七场景中文名（与 RRM-ready v2 scenario key 对齐）。 */
const SCENARIO_TITLE_ZH = {
  low_pressure_first_chat: "低压力首次聊天",
  topic_expansion: "轻松话题延展",
  personal_sharing: "轻度个人分享",
  emotional_support_light: "轻度情绪支持",
  pace_negotiation: "关系节奏协商",
  low_pressure_invitation: "低压力邀约",
  minor_misunderstanding_repair: "轻微误解修复",
};

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

  const rrmEvidenceLines = useMemo(() => {
    if (!matched?.rrmSimResult || typeof matched.rrmSimResult !== "object" || matched.rrmSimResult.fallbackUsed) {
      return [];
    }
    return pickRrmEvidenceLinesPrioritized(matched.rrmSimResult);
  }, [matched]);

  const isForbidden = Boolean(jobError && (jobError.includes("403") || jobError.includes("没有权限")));

  if (!aiSimJobId || !candidateUserId) {
    return null;
  }

  if (jobLoading) {
    return (
      <p style={{ ...moduleSub, marginBottom: "0.75rem" }} role="status">
        正在加载关系节奏参考…
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

  const jobLevelRhythmPending =
    (job.jobStatus === "queued" || job.jobStatus === "running") &&
    candidateUserId &&
    Array.isArray(job.results) &&
    job.results.some((r) => r.candidateUserId === candidateUserId);

  if (!matched) {
    if (jobLevelRhythmPending) {
      return (
        <div style={compactWrap} aria-live="polite">
          <p style={{ margin: "0 0 0.55rem", fontSize: "0.86rem", color: "#475569", lineHeight: 1.55 }}>
            关系节奏预测正在生成中，这不会影响你的最终匹配结果。
          </p>
          <button type="button" style={btnRefresh} onClick={onRefresh} disabled={jobLoading}>
            刷新进度
          </button>
        </div>
      );
    }
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
          关系节奏预测正在生成中，这不会影响你的最终匹配结果。
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
        当前暂未生成完整关系节奏预测，不影响最终匹配结论。
      </p>
    );
  }

  const v2Payload = isAiSimulationV2Payload(matched.transcriptLite) ? matched.transcriptLite : null;

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
        {v2Payload
          ? "（多段真实模拟场景，按顺序展示）"
          : isTranscriptLiteShape(matched.transcriptLite)
            ? "（旧版短对话模拟，仅供参考）"
            : ""}
      </p>

      {matched.rrmSimResult && typeof matched.rrmSimResult === "object" ? (
        <div
          style={{
            marginBottom: "0.85rem",
            padding: "0.75rem 0.85rem",
            borderRadius: 10,
            border: "1px solid #bfdbfe",
            background: "linear-gradient(180deg, #eff6ff 0%, #f8fafc 100%)",
            boxShadow: "0 1px 3px rgba(30,58,138,0.06)",
          }}
          aria-label="关系节奏预测"
        >
          <h4 style={{ margin: "0 0 0.35rem", fontSize: "1rem", fontWeight: 700, color: "#1e3a8a" }}>关系节奏预测</h4>
          <p
            style={{
              margin: "0 0 0.65rem",
              fontSize: "0.8rem",
              color: "#64748b",
              lineHeight: 1.55,
            }}
          >
            基于七个低压力模拟场景生成，仅作为相处参考，不影响最终匹配分。
          </p>

          {matched.rrmSimResult.fallbackUsed ? (
            <p style={{ margin: "0 0 0.55rem", fontSize: "0.84rem", color: "#475569", lineHeight: 1.6 }}>
              当前暂未生成完整关系节奏预测，不影响最终匹配结论。
            </p>
          ) : (
            <>
              <p style={{ margin: "0 0 0.35rem", fontSize: "0.84rem", color: "#334155", lineHeight: 1.55 }}>
                <strong>关系节奏参考分：</strong>
                {typeof matched.rrmSimResult.scores?.simulatedRhythmScore === "number"
                  ? `${formatRhythmRefScore100(matched.rrmSimResult.scores.simulatedRhythmScore)} / 100`
                  : "—"}
                <span style={{ fontSize: "0.72rem", color: "#94a3b8", marginLeft: "0.35rem" }}>
                  与最终匹配结论独立，不改变匹配指数
                </span>
              </p>
              <p style={{ margin: "0 0 0.3rem", fontSize: "0.84rem", color: "#334155", lineHeight: 1.55 }}>
                <strong>当前建议：</strong>
                {rrmSuggestedLabel(matched.rrmSimResult.suggestedAction) ?? "详见下方摘要"}
              </p>
              <p style={{ margin: "0 0 0.45rem", fontSize: "0.84rem", color: "#334155", lineHeight: 1.55 }}>
                <strong>推进窗口：</strong>
                {rrmProgressionLabel(matched.rrmSimResult.progressionWindow) ?? "—"}
              </p>
              {rrmGentleCopy(matched.rrmSimResult.suggestedAction) ? (
                <p style={{ margin: "0 0 0.5rem", fontSize: "0.84rem", color: "#475569", lineHeight: 1.6 }}>
                  {rrmGentleCopy(matched.rrmSimResult.suggestedAction)}
                </p>
              ) : null}
              {typeof matched.rrmSimResult.summary === "string" && matched.rrmSimResult.summary.trim() ? (
                <p
                  style={{
                    margin: "0 0 0.5rem",
                    padding: "0.5rem 0.55rem",
                    fontSize: "0.82rem",
                    color: "#334155",
                    lineHeight: 1.6,
                    background: "rgba(255,255,255,0.75)",
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                  }}
                >
                  {matched.rrmSimResult.summary.trim()}
                </p>
              ) : null}
              {rrmEvidenceLines.length > 0 ? (
                <ul style={{ margin: "0 0 0.35rem", paddingLeft: "1.1rem", fontSize: "0.8rem", color: "#475569", lineHeight: 1.55 }}>
                  {rrmEvidenceLines.map((line, i) => (
                    <li key={`rrm-ev-${i}`} style={{ marginBottom: "0.25rem" }}>
                      {line}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}

          {!matched.rrmSimResult.fallbackUsed &&
          v2Payload &&
          Array.isArray(v2Payload.scenarioResults) &&
          v2Payload.scenarioResults.length > 0 ? (
            <details
              style={{
                marginTop: "0.55rem",
                padding: "0.45rem 0",
                borderTop: "1px solid #dbeafe",
                fontSize: "0.82rem",
                color: "#475569",
              }}
            >
              <summary style={{ cursor: "pointer", fontWeight: 600, color: "#1e40af", userSelect: "none" }}>
                七个模拟场景概览
              </summary>
              <div style={{ marginTop: "0.45rem" }}>
                {v2Payload.scenarioResults.map((sc, sci) => {
                  const key = typeof sc.scenario === "string" ? sc.scenario : "";
                  const title = SCENARIO_TITLE_ZH[key] || key || `场景 ${sci + 1}`;
                  const nsRaw = sc.signals && typeof sc.signals === "object" ? sc.signals.nextStepSuitability : null;
                  const nextZh = nextStepZhFromSignals(nsRaw) ?? "—";
                  const perfN = formatScenarioPerfRef(sc.evaluator?.scenarioScore);
                  const sum =
                    typeof sc.simulationSummary === "string" && sc.simulationSummary.trim()
                      ? sc.simulationSummary.trim()
                      : null;
                  return (
                    <div
                      key={key || `rrm-ov-${sci}`}
                      style={{
                        marginTop: sci === 0 ? 0 : "0.75rem",
                        paddingBottom: sci === v2Payload.scenarioResults.length - 1 ? 0 : "0.65rem",
                        borderBottom:
                          sci === v2Payload.scenarioResults.length - 1 ? "none" : "1px solid #e2e8f0",
                      }}
                    >
                      <p style={{ margin: "0 0 0.25rem", fontWeight: 700, color: "#0f172a", fontSize: "0.86rem" }}>{title}</p>
                      {sum ? (
                        <p style={{ margin: "0 0 0.35rem", fontSize: "0.8rem", color: "#64748b", lineHeight: 1.55 }}>{sum}</p>
                      ) : null}
                      <p style={{ margin: "0 0 0.2rem", fontSize: "0.8rem", color: "#334155", lineHeight: 1.55 }}>
                        <strong>下一步适合度：</strong>
                        {nextZh}
                      </p>
                      {perfN != null ? (
                        <p style={{ margin: 0, fontSize: "0.78rem", color: "#64748b", lineHeight: 1.5 }}>
                          <strong>模拟表现参考：</strong>约 {perfN} / 100
                          <span style={{ color: "#94a3b8", marginLeft: "0.25rem" }}>（仅供对照）</span>
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </details>
          ) : null}

          <details style={{ marginTop: "0.55rem", fontSize: "0.72rem", color: "#64748b" }}>
            <summary style={{ cursor: "pointer", color: "#64748b", userSelect: "none" }}>技术信息（可选）</summary>
            <p style={{ margin: "0.35rem 0 0", wordBreak: "break-all" }}>
              rrmSimResult.sourceVersion: <code>{String(matched.rrmSimResult.sourceVersion ?? "—")}</code>
            </p>
            <p style={{ margin: "0.25rem 0 0", wordBreak: "break-all" }}>
              sourceSimulationVersion: <code>{String(matched.rrmSimResult.sourceSimulationVersion ?? "—")}</code>
            </p>
            <p style={{ margin: "0.25rem 0 0" }}>
              fallbackUsed: <code>{String(matched.rrmSimResult.fallbackUsed)}</code>
            </p>
            {matched.rrmSimResult.rrmUnavailableReason != null ? (
              <p style={{ margin: "0.25rem 0 0", wordBreak: "break-all" }}>
                rrmUnavailableReason: <code>{String(matched.rrmSimResult.rrmUnavailableReason)}</code>
              </p>
            ) : null}
            {matched.transcriptLite && typeof matched.transcriptLite === "object" && !Array.isArray(matched.transcriptLite) ? (
              <>
                <p style={{ margin: "0.45rem 0 0", fontSize: "0.7rem", color: "#94a3b8" }}>
                  transcriptLite.schemaVersion:{" "}
                  <code>{String(matched.transcriptLite.schemaVersion ?? "—")}</code>
                </p>
                <p style={{ margin: "0.2rem 0 0", fontSize: "0.7rem", color: "#94a3b8", wordBreak: "break-all" }}>
                  transcriptLite.sourceVersion:{" "}
                  <code>{String(matched.transcriptLite.sourceVersion ?? "—")}</code>
                </p>
              </>
            ) : null}
          </details>
        </div>
      ) : null}

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
        真实模拟场景与相处参考
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
        {v2Payload ? (
          <div style={{ margin: "0.55rem 0 0" }}>
            {v2Payload.scenarioResults.map((sc, sci) => {
              const key = typeof sc.scenario === "string" ? sc.scenario : "";
              const title = SCENARIO_TITLE_ZH[key] || key;
              const msgs = Array.isArray(sc.simulationTranscript) ? sc.simulationTranscript : [];
              const sig = sc.signals && typeof sc.signals === "object" && !Array.isArray(sc.signals) ? sc.signals : null;
              const signalLine =
                sig &&
                typeof sig.topicContinuity === "string" &&
                typeof sig.emotionalSafety === "string" &&
                typeof sig.pressureOrBoundaryRisk === "string"
                  ? [sig.topicContinuity, sig.emotionalSafety, sig.pressureOrBoundaryRisk].filter(Boolean).join(" · ")
                  : null;
              return (
                <div key={key || `sc-${sci}`} style={{ marginBottom: "1rem" }}>
                  <p style={{ margin: "0 0 0.35rem", fontWeight: 600, color: "#334155", fontSize: "0.86rem" }}>{title}</p>
                  {typeof sc.simulationSummary === "string" && sc.simulationSummary.trim() ? (
                    <p style={{ margin: "0 0 0.45rem", fontSize: "0.8rem", color: "#64748b", lineHeight: 1.5 }}>{sc.simulationSummary.trim()}</p>
                  ) : null}
                  {signalLine ? (
                    <p style={{ margin: "0 0 0.45rem", fontSize: "0.76rem", color: "#64748b", lineHeight: 1.45 }}>
                      <span style={{ fontWeight: 600, color: "#475569" }}>互动感受摘要：</span>
                      {signalLine}
                    </p>
                  ) : null}
                  <p style={{ margin: "0 0 0.35rem", fontSize: "0.72rem", color: "#94a3b8" }}>简短对话</p>
                  <ol style={{ margin: 0, paddingLeft: "1.25rem", lineHeight: 1.55, color: "#334155", fontSize: "0.84rem" }}>
                    {msgs.map((row, i) => (
                      <li key={`scn-${sci}-m-${i}`} style={{ marginBottom: "0.4rem" }}>
                        <strong style={{ color: "#334155" }}>{row.speaker}</strong>
                        <div style={{ marginTop: "0.15rem", whiteSpace: "pre-wrap" }}>{row.message}</div>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>
        ) : isTranscriptLiteShape(matched.transcriptLite) ? (
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
        {v2Payload && typeof v2Payload.sourceVersion === "string" ? (
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.72rem", color: "#94a3b8" }}>
            schemaVersion: <code>{String(v2Payload.schemaVersion ?? "—")}</code>
            {" · "}
            sourceVersion: <code>{v2Payload.sourceVersion}</code>
            {typeof v2Payload.fallbackUsed === "boolean" ? (
              <>
                {" "}
                · fallbackUsed: <code>{String(v2Payload.fallbackUsed)}</code>
              </>
            ) : null}
          </p>
        ) : null}
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
