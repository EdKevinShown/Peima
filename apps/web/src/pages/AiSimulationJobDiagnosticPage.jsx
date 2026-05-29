import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getAdminAiSimulationV1Job } from "../api/ai-simulation-v1";
import LoadingState from "../components/common/LoadingState";
import UserIdWithName from "../components/common/UserIdWithName";

function readJobId(searchParams) {
  return (searchParams.get("jobId") || searchParams.get("aiSimJobId") || "").trim();
}

function parseBindingSummary(binding) {
  if (!binding || typeof binding !== "object" || Array.isArray(binding)) {
    return { state: "unavailable" };
  }
  const b = binding;
  const previewPoolId = typeof b.previewPoolId === "string" ? b.previewPoolId : "";
  const shortlistSchemaVersion = typeof b.shortlistSchemaVersion === "string" ? b.shortlistSchemaVersion : "";
  const shortlistFingerprint = typeof b.shortlistFingerprint === "string" ? b.shortlistFingerprint : "";
  const shortlistCandidateUserIds = Array.isArray(b.shortlistCandidateUserIds)
    ? b.shortlistCandidateUserIds.filter((x) => typeof x === "string")
    : [];
  if (!previewPoolId || !shortlistSchemaVersion || !shortlistFingerprint || shortlistCandidateUserIds.length === 0) {
    return { state: "invalid" };
  }
  return {
    state: "ok",
    previewPoolId,
    shortlistSchemaVersion,
    shortlistFingerprint,
    shortlistCandidateUserIds,
  };
}

function parseJobAudit(job) {
  if (!job || typeof job !== "object" || Array.isArray(job)) return { state: "unavailable" };
  const raw = job.jobAuditV0;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { state: "unavailable" };
  }
  const a = raw;
  const itemCountsRaw = a.itemCounts;
  const itemCounts =
    itemCountsRaw &&
    typeof itemCountsRaw === "object" &&
    !Array.isArray(itemCountsRaw) &&
    Number.isFinite(Number(itemCountsRaw.total)) &&
    Number.isFinite(Number(itemCountsRaw.queued)) &&
    Number.isFinite(Number(itemCountsRaw.running)) &&
    Number.isFinite(Number(itemCountsRaw.succeeded)) &&
    Number.isFinite(Number(itemCountsRaw.failed))
      ? {
          total: Number(itemCountsRaw.total),
          queued: Number(itemCountsRaw.queued),
          running: Number(itemCountsRaw.running),
          succeeded: Number(itemCountsRaw.succeeded),
          failed: Number(itemCountsRaw.failed),
        }
      : null;
  const schemaVersion = typeof a.schemaVersion === "string" ? a.schemaVersion : "";
  const jobStatus = typeof a.jobStatus === "string" ? a.jobStatus : "";
  const sidecarSuppressedReason = typeof a.sidecarSuppressedReason === "string" ? a.sidecarSuppressedReason : "";
  const specClassification = typeof a.specClassification === "string" ? a.specClassification : "";
  const diagnosticBucket = typeof a.diagnosticBucket === "string" ? a.diagnosticBucket : "";
  const buildabilityDetail = typeof a.buildabilityDetail === "string" ? a.buildabilityDetail : "";
  const shortlistBindingPresent = typeof a.shortlistBindingPresent === "boolean" ? a.shortlistBindingPresent : null;
  const sidecarTrioPresent = typeof a.sidecarTrioPresent === "boolean" ? a.sidecarTrioPresent : null;
  const rankConsistent = a.rankConsistent === true || a.rankConsistent === false ? a.rankConsistent : null;
  if (
    !schemaVersion ||
    !jobStatus ||
    !sidecarSuppressedReason ||
    !specClassification ||
    !diagnosticBucket ||
    !buildabilityDetail ||
    shortlistBindingPresent == null ||
    sidecarTrioPresent == null ||
    itemCounts == null
  ) {
    return { state: "invalid" };
  }
  return {
    state: "ok",
    schemaVersion,
    jobStatus,
    itemCounts,
    shortlistBindingPresent,
    sidecarTrioPresent,
    rankConsistent,
    sidecarSuppressedReason,
    specClassification,
    diagnosticBucket,
    buildabilityDetail,
  };
}

function sidecarPresence(job) {
  if (!job || typeof job !== "object" || Array.isArray(job)) return null;
  return {
    shortlistFourDimV0: job.shortlistFourDimV0 != null,
    shortlistDecisionV0: job.shortlistDecisionV0 != null,
  };
}

export default function AiSimulationJobDiagnosticPage() {
  const [searchParams] = useSearchParams();
  const jobId = useMemo(() => readJobId(searchParams), [searchParams]);
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (opts = {}) => {
    const silent = Boolean(opts?.silent);
    if (!jobId) return;
    if (!silent) {
      setLoading(true);
      setError("");
    }
    try {
      const data = await getAdminAiSimulationV1Job(jobId);
      setJob(data);
      if (!silent) {
        setError("");
      }
    } catch (e) {
      if (!silent) {
        setJob(null);
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    load();
  }, [jobId, load]);

  useEffect(() => {
    if (!jobId) return;
    const st = (job?.jobStatus || "").trim();
    if (st !== "queued" && st !== "running") return;
    const id = window.setInterval(() => void load({ silent: true }), 3000);
    return () => window.clearInterval(id);
  }, [jobId, job?.jobStatus, load]);

  const audit = useMemo(() => parseJobAudit(job), [job]);
  const binding = useMemo(() => parseBindingSummary(job?.shortlistBinding), [job]);
  const presence = useMemo(() => sidecarPresence(job), [job]);
  const items = Array.isArray(job?.results) ? job.results : [];
  const rrmDiag = job && typeof job === "object" && job.rrmSimMultiCandidateDiagnostic ? job.rrmSimMultiCandidateDiagnostic : null;
  const rrmProposal = job && typeof job === "object" && job.rrmRankingProposal ? job.rrmRankingProposal : null;

  return (
    <main style={{ maxWidth: 980, margin: "1.2rem auto", padding: "0 1rem", color: "#334155" }}>
      <div
        style={{
          background: "#fffbeb",
          border: "1px solid #fbbf24",
          borderRadius: 8,
          padding: "0.5rem 0.75rem",
          marginBottom: "0.85rem",
          fontSize: "0.82rem",
          color: "#92400e",
        }}
      >
        <strong>内部 / Admin</strong> — 不在 Phase G v0.1 用户主路径；需管理员权限与有效登录。
      </div>
      <h1 style={{ margin: "0 0 0.6rem", fontSize: "1.25rem", color: "#0f172a" }}>
        AI 模拟 job 诊断详情（内部只读）
      </h1>
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.82rem", color: "#64748b" }}>
        仅用于诊断状态与排障信息；不参与主链匹配结论，不影响 finalScore。
      </p>
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.78rem" }}>
        <Link to="/final-match">返回 Final Match</Link>
      </p>
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.78rem" }}>
        <Link to="/admin/ai-sim-job-triage">去 AI 模拟 job 分诊列表（内部只读）</Link>
      </p>

      {!jobId ? (
        <p style={{ margin: 0 }}>缺少 jobId（请使用 ?jobId=... 或 ?aiSimJobId=...）。</p>
      ) : null}
      {loading ? <LoadingState label="加载 AI 模拟 job 诊断..." /> : null}
      {error ? (
        <p style={{ marginTop: "0.5rem", color: "#b91c1c" }} role="alert">
          {error}
        </p>
      ) : null}

      {!loading && !error && job ? (
        <>
          {(job.jobStatus === "queued" || job.jobStatus === "running") && (
            <div
              style={{
                border: "1px solid #93c5fd",
                borderRadius: 8,
                background: "#eff6ff",
                padding: "0.55rem 0.75rem",
                marginBottom: "0.75rem",
                fontSize: "0.82rem",
                color: "#1e3a8a",
              }}
              role="status"
            >
              后台生成中：本页可继续浏览当前快照；数据会随轮询自动刷新，无需阻塞等待整轮 LLM 完成。
            </div>
          )}
          <section
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              background: "#f8fafc",
              padding: "0.7rem 0.85rem",
              marginBottom: "0.75rem",
              fontSize: "0.82rem",
              lineHeight: 1.55,
            }}
          >
            <h2 style={{ margin: "0 0 0.45rem", fontSize: "0.9rem", color: "#334155" }}>诊断摘要</h2>
            <p style={{ margin: "0 0 0.2rem" }}>
              aiSimJobId：<code style={{ fontSize: "0.74rem" }}>{job.simulationJobId || jobId}</code>
            </p>
            <p style={{ margin: "0 0 0.2rem" }}>
              jobStatus：<code style={{ fontSize: "0.74rem" }}>{job.jobStatus || "—"}</code>
            </p>
            {audit.state === "ok" ? (
              <>
                <p style={{ margin: "0 0 0.2rem" }}>
                  itemCounts：
                  <code style={{ fontSize: "0.74rem", marginLeft: "0.25rem" }}>
                    total {audit.itemCounts.total} / queued {audit.itemCounts.queued} / running {audit.itemCounts.running} /
                    succeeded {audit.itemCounts.succeeded} / failed {audit.itemCounts.failed}
                  </code>
                </p>
                <p style={{ margin: "0 0 0.2rem" }}>
                  shortlistBindingPresent：<strong>{String(audit.shortlistBindingPresent)}</strong>
                </p>
                <p style={{ margin: "0 0 0.2rem" }}>
                  sidecarTrioPresent：<strong>{String(audit.sidecarTrioPresent)}</strong>
                </p>
                <p style={{ margin: "0 0 0.2rem" }}>
                  rankConsistent：
                  <code style={{ fontSize: "0.74rem", marginLeft: "0.25rem" }}>
                    {audit.rankConsistent == null ? "null (in progress)" : String(audit.rankConsistent)}
                  </code>
                </p>
                <p style={{ margin: 0 }}>
                  sidecarSuppressedReason：
                  <code style={{ fontSize: "0.74rem", marginLeft: "0.25rem" }}>{audit.sidecarSuppressedReason}</code>
                </p>
                <p style={{ margin: "0.2rem 0 0" }}>
                  specClassification：
                  <code style={{ fontSize: "0.74rem", marginLeft: "0.25rem" }}>{audit.specClassification}</code>
                </p>
                <p style={{ margin: "0.2rem 0 0" }}>
                  diagnosticBucket：
                  <code style={{ fontSize: "0.74rem", marginLeft: "0.25rem" }}>{audit.diagnosticBucket}</code>
                </p>
                <p style={{ margin: "0.2rem 0 0" }}>
                  buildabilityDetail：
                  <code style={{ fontSize: "0.74rem", marginLeft: "0.25rem" }}>{audit.buildabilityDetail}</code>
                </p>
              </>
            ) : (
              <p style={{ margin: 0, color: "#92400e" }}>
                jobAuditV0 {audit.state === "unavailable" ? "缺失（已平滑降级）" : "结构异常（仅供排障）"}。
              </p>
            )}
          </section>

          <section
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              background: "#f8fafc",
              padding: "0.7rem 0.85rem",
              marginBottom: "0.75rem",
              fontSize: "0.82rem",
              lineHeight: 1.55,
            }}
          >
            <h2 style={{ margin: "0 0 0.45rem", fontSize: "0.9rem", color: "#334155" }}>shortlistBinding 摘要</h2>
            {binding.state !== "ok" ? (
              <p style={{ margin: 0 }}>shortlistBinding 不可读。</p>
            ) : (
              <>
                <p style={{ margin: "0 0 0.2rem" }}>
                  previewPoolId：<code style={{ fontSize: "0.74rem" }}>{binding.previewPoolId}</code>
                </p>
                <p style={{ margin: "0 0 0.2rem" }}>
                  shortlistSchemaVersion：<code style={{ fontSize: "0.74rem" }}>{binding.shortlistSchemaVersion}</code>
                </p>
                <p style={{ margin: "0 0 0.2rem" }}>
                  shortlistFingerprint：
                  <code style={{ fontSize: "0.74rem", marginLeft: "0.25rem", wordBreak: "break-all" }}>
                    {binding.shortlistFingerprint}
                  </code>
                </p>
                <p style={{ margin: 0 }}>
                  shortlistCandidateUserIds：
                  <code style={{ fontSize: "0.74rem", marginLeft: "0.25rem", wordBreak: "break-all" }}>
                    {binding.shortlistCandidateUserIds.join(" > ")}
                  </code>
                </p>
              </>
            )}
          </section>

          <section
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              background: "#f8fafc",
              padding: "0.7rem 0.85rem",
              marginBottom: "0.75rem",
              fontSize: "0.82rem",
              lineHeight: 1.55,
            }}
          >
            <h2 style={{ margin: "0 0 0.45rem", fontSize: "0.9rem", color: "#334155" }}>sidecar 存在性</h2>
            {!presence ? (
              <p style={{ margin: 0 }}>sidecar 信息不可读。</p>
            ) : (
              <>
                <p style={{ margin: "0 0 0.2rem" }}>
                  shortlistFourDimV0：<strong>{String(presence.shortlistFourDimV0)}</strong>
                </p>
                <p style={{ margin: 0 }}>
                  shortlistDecisionV0：<strong>{String(presence.shortlistDecisionV0)}</strong>
                </p>
              </>
            )}
          </section>

          <section
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              background: "#f8fafc",
              padding: "0.7rem 0.85rem",
              fontSize: "0.82rem",
              lineHeight: 1.55,
            }}
          >
            <h2 style={{ margin: "0 0 0.45rem", fontSize: "0.9rem", color: "#334155" }}>candidate item 最小状态摘要</h2>
            {items.length === 0 ? (
              <p style={{ margin: 0 }}>当前 job 无 results。</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: "0.2rem" }}>
                        candidateUserId
                      </th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: "0.2rem" }}>status</th>
                      <th style={{ textAlign: "right", borderBottom: "1px solid #e2e8f0", padding: "0.2rem" }}>
                        attemptCount
                      </th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: "0.2rem" }}>errorCode</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: "0.2rem" }}>
                        hasTranscriptLite
                      </th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: "0.2rem" }}>
                        hasEvaluator
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => (
                      <tr key={`${it.candidateUserId}-${idx}`}>
                        <td style={{ padding: "0.2rem", borderBottom: "1px solid #f1f5f9" }}>
                          <code style={{ fontSize: "0.72rem" }}>
                            <UserIdWithName userId={it.candidateUserId} />
                          </code>
                        </td>
                        <td style={{ padding: "0.2rem", borderBottom: "1px solid #f1f5f9" }}>{it.status || "—"}</td>
                        <td style={{ textAlign: "right", padding: "0.2rem", borderBottom: "1px solid #f1f5f9" }}>
                          {Number.isFinite(Number(it.attemptCount)) ? Number(it.attemptCount) : "—"}
                        </td>
                        <td style={{ padding: "0.2rem", borderBottom: "1px solid #f1f5f9" }}>
                          <code style={{ fontSize: "0.72rem" }}>{it.errorCode || "—"}</code>
                        </td>
                        <td style={{ padding: "0.2rem", borderBottom: "1px solid #f1f5f9" }}>
                          {String(it.transcriptLite != null)}
                        </td>
                        <td style={{ padding: "0.2rem", borderBottom: "1px solid #f1f5f9" }}>
                          {String(it.evaluator != null)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {rrmDiag ? (
            <>
            {rrmProposal ? (
              <details
                style={{
                  border: "1px solid #0ea5e9",
                  borderRadius: 8,
                  background: "#ecfeff",
                  padding: "0.65rem 0.85rem",
                  marginBottom: "0.75rem",
                  fontSize: "0.82rem",
                  lineHeight: 1.55,
                }}
              >
                <summary style={{ cursor: "pointer", fontWeight: 700, color: "#0c4a6e", userSelect: "none" }}>
                  M4.0 — RRM 排序建议（只读 · 不入主链）
                </summary>
                <p style={{ margin: "0.45rem 0 0.5rem", fontSize: "0.78rem", color: "#155e75" }}>
                  <strong>Admin / 诊断专用</strong>：展示「若仅按 RRM-Sim 节奏分重排」的假设结果；<strong>不</strong>写入 MatchResult、<strong>不</strong>影响 worker
                  主排序与 finalScore。
                </p>
                <p style={{ margin: "0 0 0.35rem", fontSize: "0.74rem", color: "#164e63" }}>
                  <code>{rrmProposal.sourceVersion}</code> · schemaVersion {rrmProposal.schemaVersion} · mode{" "}
                  <code>{rrmProposal.mode}</code>
                </p>
                <p style={{ margin: "0 0 0.35rem", fontSize: "0.74rem", color: "#164e63" }}>
                  appliedToFinalScore：<strong>{String(rrmProposal.appliedToFinalScore)}</strong> · appliedToWorkerRanking：
                  <strong>{String(rrmProposal.appliedToWorkerRanking)}</strong>
                </p>
                <p style={{ margin: "0 0 0.35rem", fontSize: "0.74rem", color: "#164e63" }}>
                  recommendation：<code style={{ fontSize: "0.78rem" }}>{rrmProposal.recommendation}</code> · confidenceLevel：
                  <code>{rrmProposal.confidenceLevel}</code> · scoreDistributionFlag：
                  <code>{rrmProposal.scoreDistributionFlag}</code>
                </p>
                <p style={{ margin: "0 0 0.35rem", fontSize: "0.74rem", color: "#164e63" }}>
                  existingTop：<code>{rrmProposal.existingTopCandidateUserId || "—"}</code> · rrmTop：
                  <code>{rrmProposal.rrmTopCandidateUserId || "—"}</code> · topCandidateChanged：
                  <strong>{String(rrmProposal.topCandidateChanged)}</strong>
                </p>
                {Array.isArray(rrmProposal.warnings) && rrmProposal.warnings.length > 0 ? (
                  <ul style={{ margin: "0.35rem 0 0.5rem", paddingLeft: "1.1rem", fontSize: "0.74rem", color: "#9a3412" }}>
                    {rrmProposal.warnings.map((w, i) => (
                      <li key={`rrm-prop-w-${i}`}>{w}</li>
                    ))}
                  </ul>
                ) : null}
                <div style={{ overflowX: "auto", marginTop: "0.45rem" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.72rem" }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", borderBottom: "1px solid #bae6fd", padding: "0.25rem" }}>existingRank</th>
                        <th style={{ textAlign: "left", borderBottom: "1px solid #bae6fd", padding: "0.25rem" }}>rrmRank</th>
                        <th style={{ textAlign: "left", borderBottom: "1px solid #bae6fd", padding: "0.25rem" }}>candidateUserId</th>
                        <th style={{ textAlign: "right", borderBottom: "1px solid #bae6fd", padding: "0.25rem" }}>simulatedRhythmScore</th>
                        <th style={{ textAlign: "left", borderBottom: "1px solid #bae6fd", padding: "0.25rem" }}>reasonSummary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rrmProposal.items.map((row, idx) => (
                        <tr key={`rrm-prop-${row.candidateUserId}-${idx}`}>
                          <td style={{ padding: "0.25rem", borderBottom: "1px solid #e0f2fe" }}>
                            {row.existingRank == null ? "—" : row.existingRank}
                          </td>
                          <td style={{ padding: "0.25rem", borderBottom: "1px solid #e0f2fe" }}>
                            {row.rrmRank == null ? "—" : row.rrmRank}
                          </td>
                          <td style={{ padding: "0.25rem", borderBottom: "1px solid #e0f2fe" }}>
                            <code style={{ fontSize: "0.68rem" }}>
                              <UserIdWithName userId={row.candidateUserId} />
                            </code>
                          </td>
                          <td style={{ textAlign: "right", padding: "0.25rem", borderBottom: "1px solid #e0f2fe" }}>
                            {row.simulatedRhythmScore == null ? "—" : row.simulatedRhythmScore}
                          </td>
                          <td style={{ padding: "0.25rem", borderBottom: "1px solid #e0f2fe", wordBreak: "break-word" }}>
                            {row.reasonSummary}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ) : null}
            <details
              style={{
                border: "1px solid #c7d2fe",
                borderRadius: 8,
                background: "#eef2ff",
                padding: "0.65rem 0.85rem",
                marginBottom: "0.75rem",
                fontSize: "0.82rem",
                lineHeight: 1.55,
              }}
            >
              <summary style={{ cursor: "pointer", fontWeight: 700, color: "#312e81", userSelect: "none" }}>
                RRM-Sim 多候选人对比（只读诊断）
              </summary>
              <p style={{ margin: "0.45rem 0 0.5rem", fontSize: "0.78rem", color: "#4c1d95" }}>
                以下排序为<strong>假设仅按 RRM 节奏分</strong>的对比，不参与真实匹配排序，不改变 finalScore / MatchResult。
              </p>
              <p style={{ margin: "0 0 0.35rem", fontSize: "0.76rem", color: "#5b21b6" }}>
                jobId：<code>{rrmDiag.jobId}</code> · viewerUserId：<code><UserIdWithName userId={rrmDiag.viewerUserId} /></code> · transcript 侧 sourceVersion
                摘要：<code>{rrmDiag.sourceVersion}</code>
              </p>
              <div
                style={{
                  marginBottom: "0.55rem",
                  padding: "0.45rem 0.55rem",
                  background: "#faf5ff",
                  borderRadius: 6,
                  border: "1px solid #e9d5ff",
                  fontSize: "0.76rem",
                  color: "#5b21b6",
                }}
              >
                <p style={{ margin: "0 0 0.2rem" }}>
                  RRM 可用条数：<strong>{rrmDiag.diagnostics.rrmAvailableCount}</strong> · fallback 条数：
                  <strong>{rrmDiag.diagnostics.fallbackCount}</strong>
                </p>
                <p style={{ margin: "0 0 0.2rem" }}>
                  节奏分 spread（仅非 fallback）：<strong>{rrmDiag.diagnostics.scoreRange.spread}</strong>（min{" "}
                  {rrmDiag.diagnostics.scoreRange.min} / max {rrmDiag.diagnostics.scoreRange.max}）
                </p>
                <p style={{ margin: "0 0 0.2rem" }}>
                  scoreDistributionFlag：<code>{rrmDiag.diagnostics.scoreDistributionFlag}</code>
                </p>
                <p style={{ margin: 0 }}>
                  若仅按 RRM 节奏排，Top 是否变化：
                  <strong>{String(rrmDiag.diagnostics.topCandidateChangedIfRrmOnly)}</strong>
                </p>
                <p style={{ margin: "0.35rem 0 0", fontSize: "0.72rem", color: "#6b21a8" }}>
                  existingSimulationRank：<code>{rrmDiag.rankings.existingSimulationRank.join(" > ")}</code>
                </p>
                <p style={{ margin: "0.2rem 0 0", fontSize: "0.72rem", color: "#6b21a8" }}>
                  rrmRhythmRank（降序）：<code>{rrmDiag.rankings.rrmRhythmRank.join(" > ")}</code>
                </p>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.74rem" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #ddd6fe", padding: "0.25rem" }}>existingRank</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #ddd6fe", padding: "0.25rem" }}>candidateUserId</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #ddd6fe", padding: "0.25rem" }}>v2 full</th>
                      <th style={{ textAlign: "right", borderBottom: "1px solid #ddd6fe", padding: "0.25rem" }}>simulationRankScore</th>
                      <th style={{ textAlign: "right", borderBottom: "1px solid #ddd6fe", padding: "0.25rem" }}>simulatedRhythmScore</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #ddd6fe", padding: "0.25rem" }}>suggestedAction</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #ddd6fe", padding: "0.25rem" }}>progressionWindow</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #ddd6fe", padding: "0.25rem" }}>fallbackUsed</th>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #ddd6fe", padding: "0.25rem" }}>
                        rrmUnavailableReason
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rrmDiag.items.map((row, idx) => (
                      <tr key={`rrm-diag-${row.candidateUserId}-${idx}`}>
                        <td style={{ padding: "0.25rem", borderBottom: "1px solid #ede9fe" }}>
                          {row.existingRank == null ? "—" : row.existingRank}
                        </td>
                        <td style={{ padding: "0.25rem", borderBottom: "1px solid #ede9fe" }}>
                          <code style={{ fontSize: "0.7rem" }}>
                            <UserIdWithName userId={row.candidateUserId} />
                          </code>
                        </td>
                        <td style={{ padding: "0.25rem", borderBottom: "1px solid #ede9fe" }}>{String(row.aiSimulationV2Full)}</td>
                        <td style={{ textAlign: "right", padding: "0.25rem", borderBottom: "1px solid #ede9fe" }}>
                          {row.simulationRankScore == null ? "—" : row.simulationRankScore}
                        </td>
                        <td style={{ textAlign: "right", padding: "0.25rem", borderBottom: "1px solid #ede9fe" }}>
                          {row.simulatedRhythmScore == null ? "—" : row.simulatedRhythmScore}
                        </td>
                        <td style={{ padding: "0.25rem", borderBottom: "1px solid #ede9fe" }}>
                          <code style={{ fontSize: "0.68rem" }}>{row.suggestedAction || "—"}</code>
                        </td>
                        <td style={{ padding: "0.25rem", borderBottom: "1px solid #ede9fe" }}>
                          <code style={{ fontSize: "0.68rem" }}>{row.progressionWindow || "—"}</code>
                        </td>
                        <td style={{ padding: "0.25rem", borderBottom: "1px solid #ede9fe" }}>{String(row.fallbackUsed)}</td>
                        <td style={{ padding: "0.25rem", borderBottom: "1px solid #ede9fe", wordBreak: "break-all" }}>
                          <code style={{ fontSize: "0.65rem" }}>{row.rrmUnavailableReason || "—"}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            </>
          ) : null}
        </>
      ) : null}
    </main>
  );
}

