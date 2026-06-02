import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getAdminAiSimulationV1Job } from "../api/ai-simulation-v1";
import LoadingState from "../components/common/LoadingState";
import UserIdWithName from "../components/common/UserIdWithName";
import AdminPageShell from "../components/admin/AdminPageShell";
import AdminNotice from "../components/admin/AdminNotice";
import AdminSection from "../components/admin/AdminSection";
import AdminIdPill from "../components/admin/AdminIdPill";
import {
  adminTh,
  adminTd,
  adminLink,
  adminMuted,
} from "../components/admin/adminTheme";

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

function DiagnosticRow({ label, children }) {
  return (
    <p className="m-0 mb-1 text-sm text-white/80 leading-relaxed">
      <span className="text-white/55">{label}：</span>
      {children}
    </p>
  );
}

function AdminTable({ children }) {
  return (
    <div className="admin-table-wrap overflow-x-auto">
      <table className="w-full min-w-[480px] border-collapse text-sm">{children}</table>
    </div>
  );
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
    <AdminPageShell
      maxWidth="max-w-4xl"
      title="AI 模拟 job 诊断详情（内部只读）"
      subtitle="仅用于诊断状态与排障信息；不参与主链匹配结论，不影响 finalScore。"
    >
      <AdminNotice variant="internal" title="内部 / Admin">
        不在 Phase G v0.1 用户主路径；需管理员权限与有效登录。本页为<strong>只读</strong>诊断，不写入
        MatchResult，不改变 finalScore。
      </AdminNotice>

      <p className={`${adminMuted} mb-1`}>
        <Link className={adminLink} to="/final-match">
          返回 Final Match
        </Link>
      </p>
      <p className={`${adminMuted} mb-4`}>
        <Link className={adminLink} to="/admin/ai-sim-job-triage">
          去 AI 模拟 job 分诊列表（内部只读）
        </Link>
      </p>

      {!jobId ? (
        <AdminNotice variant="warning">缺少 jobId（请使用 ?jobId=... 或 ?aiSimJobId=...）。</AdminNotice>
      ) : null}
      {loading ? <LoadingState label="加载 AI 模拟 job 诊断..." /> : null}
      {error ? (
        <AdminNotice variant="danger" title="加载失败">
          {error}
        </AdminNotice>
      ) : null}

      {!loading && !error && job ? (
        <>
          {(job.jobStatus === "queued" || job.jobStatus === "running") && (
            <AdminNotice variant="info" title="后台生成中">
              本页可继续浏览当前快照；数据会随轮询自动刷新，无需阻塞等待整轮 LLM 完成。
            </AdminNotice>
          )}

          <AdminSection title="诊断摘要">
            <DiagnosticRow label="aiSimJobId">
              <AdminIdPill id={job.simulationJobId || jobId} truncate={24} />
            </DiagnosticRow>
            <DiagnosticRow label="jobStatus">
              <AdminIdPill id={job.jobStatus || "—"} truncate={20} />
            </DiagnosticRow>
            {audit.state === "ok" ? (
              <>
                <DiagnosticRow label="itemCounts">
                  <code className="text-xs text-white/75">
                    total {audit.itemCounts.total} / queued {audit.itemCounts.queued} / running{" "}
                    {audit.itemCounts.running} / succeeded {audit.itemCounts.succeeded} / failed{" "}
                    {audit.itemCounts.failed}
                  </code>
                </DiagnosticRow>
                <DiagnosticRow label="shortlistBindingPresent">
                  <strong className="text-white">{String(audit.shortlistBindingPresent)}</strong>
                </DiagnosticRow>
                <DiagnosticRow label="sidecarTrioPresent">
                  <strong className="text-white">{String(audit.sidecarTrioPresent)}</strong>
                </DiagnosticRow>
                <DiagnosticRow label="rankConsistent">
                  <code className="text-xs text-white/75">
                    {audit.rankConsistent == null ? "null (in progress)" : String(audit.rankConsistent)}
                  </code>
                </DiagnosticRow>
                <DiagnosticRow label="sidecarSuppressedReason">
                  <AdminIdPill id={audit.sidecarSuppressedReason} truncate={24} />
                </DiagnosticRow>
                <DiagnosticRow label="specClassification">
                  <AdminIdPill id={audit.specClassification} truncate={24} />
                </DiagnosticRow>
                <DiagnosticRow label="diagnosticBucket">
                  <AdminIdPill id={audit.diagnosticBucket} truncate={24} />
                </DiagnosticRow>
                <DiagnosticRow label="buildabilityDetail">
                  <AdminIdPill id={audit.buildabilityDetail} truncate={24} />
                </DiagnosticRow>
              </>
            ) : (
              <AdminNotice variant="warning" className="mb-0 mt-2">
                jobAuditV0 {audit.state === "unavailable" ? "缺失（已平滑降级）" : "结构异常（仅供排障）"}。
              </AdminNotice>
            )}
          </AdminSection>

          <AdminSection title="shortlistBinding 摘要">
            {binding.state !== "ok" ? (
              <p className={`m-0 ${adminMuted}`}>shortlistBinding 不可读。</p>
            ) : (
              <>
                <DiagnosticRow label="previewPoolId">
                  <AdminIdPill id={binding.previewPoolId} truncate={24} />
                </DiagnosticRow>
                <DiagnosticRow label="shortlistSchemaVersion">
                  <AdminIdPill id={binding.shortlistSchemaVersion} truncate={24} />
                </DiagnosticRow>
                <DiagnosticRow label="shortlistFingerprint">
                  <code className="text-xs text-white/75 break-all">{binding.shortlistFingerprint}</code>
                </DiagnosticRow>
                <DiagnosticRow label="shortlistCandidateUserIds">
                  <code className="text-xs text-white/75 break-all">
                    {binding.shortlistCandidateUserIds.join(" > ")}
                  </code>
                </DiagnosticRow>
              </>
            )}
          </AdminSection>

          <AdminSection title="sidecar 存在性">
            {!presence ? (
              <p className={`m-0 ${adminMuted}`}>sidecar 信息不可读。</p>
            ) : (
              <>
                <DiagnosticRow label="shortlistFourDimV0">
                  <strong className="text-white">{String(presence.shortlistFourDimV0)}</strong>
                </DiagnosticRow>
                <DiagnosticRow label="shortlistDecisionV0">
                  <strong className="text-white">{String(presence.shortlistDecisionV0)}</strong>
                </DiagnosticRow>
              </>
            )}
          </AdminSection>

          <AdminSection title="candidate item 最小状态摘要">
            {items.length === 0 ? (
              <p className={`m-0 ${adminMuted}`}>当前 job 无 results。</p>
            ) : (
              <AdminTable>
                <thead>
                  <tr>
                    <th className={adminTh}>candidateUserId</th>
                    <th className={adminTh}>status</th>
                    <th className={`${adminTh} text-right`}>attemptCount</th>
                    <th className={adminTh}>errorCode</th>
                    <th className={adminTh}>hasTranscriptLite</th>
                    <th className={adminTh}>hasEvaluator</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={`${it.candidateUserId}-${idx}`}>
                      <td className={adminTd}>
                        <code className="text-[0.72rem] text-white/80">
                          <UserIdWithName userId={it.candidateUserId} />
                        </code>
                      </td>
                      <td className={adminTd}>{it.status || "—"}</td>
                      <td className={`${adminTd} text-right`}>
                        {Number.isFinite(Number(it.attemptCount)) ? Number(it.attemptCount) : "—"}
                      </td>
                      <td className={adminTd}>
                        <AdminIdPill id={it.errorCode || "—"} truncate={16} />
                      </td>
                      <td className={adminTd}>{String(it.transcriptLite != null)}</td>
                      <td className={adminTd}>{String(it.evaluator != null)}</td>
                    </tr>
                  ))}
                </tbody>
              </AdminTable>
            )}
          </AdminSection>

          {rrmDiag ? (
            <>
              {rrmProposal ? (
                <details className="glass rounded-2xl p-4 sm:p-5 mb-4 border border-sky-400/25 text-sm leading-relaxed">
                  <summary className="cursor-pointer font-bold text-sky-100 select-none">
                    M4.0 — RRM 排序建议（只读 · 不入主链）
                  </summary>
                  <p className="mt-2 mb-2 text-xs text-sky-200/80">
                    <strong>Admin / 诊断专用</strong>：展示「若仅按 RRM-Sim 节奏分重排」的假设结果；<strong>不</strong>
                    写入 MatchResult、<strong>不</strong>影响 worker 主排序与 finalScore。
                  </p>
                  <p className={`${adminMuted} mb-1`}>
                    <AdminIdPill id={rrmProposal.sourceVersion} truncate={20} /> · schemaVersion{" "}
                    {rrmProposal.schemaVersion} · mode <AdminIdPill id={rrmProposal.mode} truncate={16} />
                  </p>
                  <p className={`${adminMuted} mb-1`}>
                    appliedToFinalScore：<strong className="text-white">{String(rrmProposal.appliedToFinalScore)}</strong>{" "}
                    · appliedToWorkerRanking：
                    <strong className="text-white">{String(rrmProposal.appliedToWorkerRanking)}</strong>
                  </p>
                  <p className={`${adminMuted} mb-1`}>
                    recommendation：<AdminIdPill id={rrmProposal.recommendation} truncate={20} /> · confidenceLevel：
                    <AdminIdPill id={rrmProposal.confidenceLevel} truncate={12} /> · scoreDistributionFlag：
                    <AdminIdPill id={rrmProposal.scoreDistributionFlag} truncate={16} />
                  </p>
                  <p className={`${adminMuted} mb-1`}>
                    existingTop：<AdminIdPill id={rrmProposal.existingTopCandidateUserId || "—"} truncate={12} /> ·
                    rrmTop：<AdminIdPill id={rrmProposal.rrmTopCandidateUserId || "—"} truncate={12} /> ·
                    topCandidateChanged：
                    <strong className="text-white">{String(rrmProposal.topCandidateChanged)}</strong>
                  </p>
                  {Array.isArray(rrmProposal.warnings) && rrmProposal.warnings.length > 0 ? (
                    <ul className="my-2 pl-4 text-xs text-amber-200/90 list-disc">
                      {rrmProposal.warnings.map((w, i) => (
                        <li key={`rrm-prop-w-${i}`}>{w}</li>
                      ))}
                    </ul>
                  ) : null}
                  <AdminTable>
                    <thead>
                      <tr>
                        <th className={adminTh}>existingRank</th>
                        <th className={adminTh}>rrmRank</th>
                        <th className={adminTh}>candidateUserId</th>
                        <th className={`${adminTh} text-right`}>simulatedRhythmScore</th>
                        <th className={adminTh}>reasonSummary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rrmProposal.items.map((row, idx) => (
                        <tr key={`rrm-prop-${row.candidateUserId}-${idx}`}>
                          <td className={adminTd}>{row.existingRank == null ? "—" : row.existingRank}</td>
                          <td className={adminTd}>{row.rrmRank == null ? "—" : row.rrmRank}</td>
                          <td className={adminTd}>
                            <code className="text-[0.68rem] text-white/80">
                              <UserIdWithName userId={row.candidateUserId} />
                            </code>
                          </td>
                          <td className={`${adminTd} text-right`}>
                            {row.simulatedRhythmScore == null ? "—" : row.simulatedRhythmScore}
                          </td>
                          <td className={`${adminTd} break-words`}>{row.reasonSummary}</td>
                        </tr>
                      ))}
                    </tbody>
                  </AdminTable>
                </details>
              ) : null}
              <details className="glass rounded-2xl p-4 sm:p-5 mb-4 border border-violet-400/25 text-sm leading-relaxed">
                <summary className="cursor-pointer font-bold text-violet-100 select-none">
                  RRM-Sim 多候选人对比（只读诊断）
                </summary>
                <p className="mt-2 mb-2 text-xs text-violet-200/80">
                  以下排序为<strong>假设仅按 RRM 节奏分</strong>的对比，不参与真实匹配排序，不改变 finalScore /
                  MatchResult。
                </p>
                <p className={`${adminMuted} mb-1`}>
                  jobId：<AdminIdPill id={rrmDiag.jobId} truncate={16} /> · viewerUserId：
                  <code className="text-white/75 text-xs">
                    <UserIdWithName userId={rrmDiag.viewerUserId} />
                  </code>{" "}
                  · transcript 侧 sourceVersion 摘要：
                  <AdminIdPill id={rrmDiag.sourceVersion} truncate={16} />
                </p>
                <div className="mb-3 rounded-xl border border-violet-400/20 bg-violet-500/10 p-3 text-xs text-violet-100/90">
                  <p className="m-0 mb-1">
                    RRM 可用条数：<strong>{rrmDiag.diagnostics.rrmAvailableCount}</strong> · fallback 条数：
                    <strong>{rrmDiag.diagnostics.fallbackCount}</strong>
                  </p>
                  <p className="m-0 mb-1">
                    节奏分 spread（仅非 fallback）：<strong>{rrmDiag.diagnostics.scoreRange.spread}</strong>（min{" "}
                    {rrmDiag.diagnostics.scoreRange.min} / max {rrmDiag.diagnostics.scoreRange.max}）
                  </p>
                  <p className="m-0 mb-1">
                    scoreDistributionFlag：<AdminIdPill id={rrmDiag.diagnostics.scoreDistributionFlag} truncate={16} />
                  </p>
                  <p className="m-0">
                    若仅按 RRM 节奏排，Top 是否变化：
                    <strong>{String(rrmDiag.diagnostics.topCandidateChangedIfRrmOnly)}</strong>
                  </p>
                  <p className={`${adminMuted} mt-2 mb-0`}>
                    existingSimulationRank：<code className="text-white/70">{rrmDiag.rankings.existingSimulationRank.join(" > ")}</code>
                  </p>
                  <p className={`${adminMuted} mt-1 mb-0`}>
                    rrmRhythmRank（降序）：<code className="text-white/70">{rrmDiag.rankings.rrmRhythmRank.join(" > ")}</code>
                  </p>
                </div>
                <AdminTable>
                  <thead>
                    <tr>
                      <th className={adminTh}>existingRank</th>
                      <th className={adminTh}>candidateUserId</th>
                      <th className={adminTh}>v2 full</th>
                      <th className={`${adminTh} text-right`}>simulationRankScore</th>
                      <th className={`${adminTh} text-right`}>simulatedRhythmScore</th>
                      <th className={adminTh}>suggestedAction</th>
                      <th className={adminTh}>progressionWindow</th>
                      <th className={adminTh}>fallbackUsed</th>
                      <th className={adminTh}>rrmUnavailableReason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rrmDiag.items.map((row, idx) => (
                      <tr key={`rrm-diag-${row.candidateUserId}-${idx}`}>
                        <td className={adminTd}>{row.existingRank == null ? "—" : row.existingRank}</td>
                        <td className={adminTd}>
                          <code className="text-[0.7rem] text-white/80">
                            <UserIdWithName userId={row.candidateUserId} />
                          </code>
                        </td>
                        <td className={adminTd}>{String(row.aiSimulationV2Full)}</td>
                        <td className={`${adminTd} text-right`}>
                          {row.simulationRankScore == null ? "—" : row.simulationRankScore}
                        </td>
                        <td className={`${adminTd} text-right`}>
                          {row.simulatedRhythmScore == null ? "—" : row.simulatedRhythmScore}
                        </td>
                        <td className={adminTd}>
                          <AdminIdPill id={row.suggestedAction || "—"} truncate={14} />
                        </td>
                        <td className={adminTd}>
                          <AdminIdPill id={row.progressionWindow || "—"} truncate={14} />
                        </td>
                        <td className={adminTd}>{String(row.fallbackUsed)}</td>
                        <td className={`${adminTd} break-all`}>
                          <AdminIdPill id={row.rrmUnavailableReason || "—"} truncate={20} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </AdminTable>
              </details>
            </>
          ) : null}
        </>
      ) : null}
    </AdminPageShell>
  );
}
