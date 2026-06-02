import { useCallback, useEffect, useState } from "react";
import LoadingState from "../components/common/LoadingState";
import AdminPageShell from "../components/admin/AdminPageShell";
import AdminSection from "../components/admin/AdminSection";
import AdminDataTable from "../components/admin/AdminDataTable";
import AdminIdPill from "../components/admin/AdminIdPill";
import AdminNotice from "../components/admin/AdminNotice";
import { adminMuted } from "../components/admin/adminTheme";
import { getAdminMyAiRecords } from "../api/admin";
import UserIdWithName from "../components/common/UserIdWithName";

function dt(x) {
  if (!x) return "-";
  const d = new Date(x);
  if (Number.isNaN(d.getTime())) return String(x);
  return d.toLocaleString();
}

export default function AdminMyAiRecordsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await getAdminMyAiRecords();
      setData(next);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const profileColumns = [
    { key: "id", label: "id", render: (row) => <AdminIdPill id={row.id} /> },
    { key: "status", label: "status" },
    {
      key: "source",
      label: "source",
      render: (row) => (
        <span className="text-white/75">
          <AdminIdPill id={row.sourceType} truncate={16} /> ·{" "}
          <AdminIdPill id={row.sourceVersion} truncate={16} />
        </span>
      ),
    },
    {
      key: "sourceConversationId",
      label: "sourceConversationId",
      render: (row) =>
        row.sourceConversationId ? <AdminIdPill id={row.sourceConversationId} /> : "—",
    },
    { key: "createdAt", label: "createdAt", render: (row) => dt(row.createdAt) },
  ];

  const jobColumns = [
    { key: "id", label: "jobId", render: (row) => <AdminIdPill id={row.id} /> },
    { key: "jobStatus", label: "status" },
    { key: "poolId", label: "poolId", render: (row) => <AdminIdPill id={row.poolId} /> },
    {
      key: "spec",
      label: "spec",
      render: (row) => (
        <span className="text-white/75">
          <AdminIdPill id={row.schemaVersion} truncate={12} /> ·{" "}
          <AdminIdPill id={row.runSpecVersion} truncate={12} />
        </span>
      ),
    },
    { key: "createdAt", label: "createdAt", render: (row) => dt(row.createdAt) },
  ];

  return (
    <AdminPageShell
      maxWidth="max-w-5xl"
      title="管理员：我的 AI 记录"
      subtitle="当前管理员账号可追溯的 AI 持久化记录（摘要、画像建议、模拟 job）。"
      actions={
        <button type="button" className="btn-ghost text-sm" onClick={() => void load()} disabled={loading}>
          {loading ? "刷新中…" : "刷新"}
        </button>
      }
    >
      {loading ? <LoadingState label="加载 AI 记录…" /> : null}
      {error ? (
        <AdminNotice variant="danger" title="加载失败">
          {error}
        </AdminNotice>
      ) : null}

      {!loading && !error && data ? (
        <>
          <AdminSection title="账号摘要">
            <p className={`${adminMuted} mb-1`}>
              userId:{" "}
              <code className="text-white/80 text-xs">
                <UserIdWithName userId={data.userId} />
              </code>
            </p>
            <p className={`${adminMuted} mb-1`}>
              generatedAt: <code className="text-white/80">{dt(data.generatedAt)}</code>
            </p>
            <p className="text-xs text-white/55 m-0">{data.note}</p>
          </AdminSection>

          <AdminSection title={`会话摘要快照（${data.conversationSummaries.length}）`}>
            <div className="grid gap-2">
              {data.conversationSummaries.map((row) => (
                <article
                  key={row.id}
                  className="rounded-xl border border-white/10 bg-white/5 p-3"
                >
                  <div className="text-[0.72rem] text-white/45">
                    {dt(row.createdAt)} · <AdminIdPill id={row.sourceType} truncate={14} /> ·{" "}
                    <AdminIdPill id={row.sourceVersion} truncate={14} />
                  </div>
                  <div className="mt-1 text-xs text-white/70">
                    conv: <AdminIdPill id={row.conversationId} /> · viewer:{" "}
                    <code className="text-white/80">
                      <UserIdWithName userId={row.viewerUserId} />
                    </code>{" "}
                    · candidate:{" "}
                    <code className="text-white/80">
                      <UserIdWithName userId={row.candidateUserId} />
                    </code>
                  </div>
                  <p className="mt-1.5 mb-0 text-sm text-white/75 leading-relaxed">
                    {row.summaryPreview}
                  </p>
                </article>
              ))}
              {data.conversationSummaries.length === 0 ? (
                <p className={`m-0 ${adminMuted}`}>暂无记录</p>
              ) : null}
            </div>
          </AdminSection>

          <AdminSection title={`画像建议（AI 来源）（${data.profileSuggestions.length}）`}>
            <AdminDataTable
              columns={profileColumns}
              rows={data.profileSuggestions}
              rowKey="id"
              emptyMessage="暂无记录"
            />
          </AdminSection>

          <AdminSection title={`AI 模拟 Jobs（${data.aiSimulationJobs.length}）`}>
            <AdminDataTable
              columns={jobColumns}
              rows={data.aiSimulationJobs}
              rowKey="id"
              emptyMessage="暂无记录"
            />
          </AdminSection>
        </>
      ) : null}
    </AdminPageShell>
  );
}
