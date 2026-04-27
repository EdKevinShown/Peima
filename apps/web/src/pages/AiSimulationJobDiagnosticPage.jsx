import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getAdminAiSimulationV1Job } from "../api/ai-simulation-v1";
import LoadingState from "../components/common/LoadingState";

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
    shortlistScenariosV0: job.shortlistScenariosV0 != null,
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

  const load = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    setError("");
    try {
      const data = await getAdminAiSimulationV1Job(jobId);
      setJob(data);
    } catch (e) {
      setJob(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    load();
  }, [jobId, load]);

  const audit = useMemo(() => parseJobAudit(job), [job]);
  const binding = useMemo(() => parseBindingSummary(job?.shortlistBinding), [job]);
  const presence = useMemo(() => sidecarPresence(job), [job]);
  const items = Array.isArray(job?.results) ? job.results : [];

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
                  shortlistScenariosV0：<strong>{String(presence.shortlistScenariosV0)}</strong>
                </p>
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
                          <code style={{ fontSize: "0.72rem" }}>{it.candidateUserId}</code>
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
        </>
      ) : null}
    </main>
  );
}

