import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import LoadingState from "../components/common/LoadingState";
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

  return (
    <main style={{ maxWidth: 980, margin: "1.2rem auto", padding: "0 1rem 2rem" }}>
      <h1 style={{ margin: "0 0 0.6rem", fontSize: "1.25rem", color: "#0f172a" }}>
        管理员：我的 AI 记录
      </h1>
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.84rem", color: "#64748b", lineHeight: 1.6 }}>
        本页用于查看当前管理员账号可追溯的 AI 相关持久化记录（摘要快照、画像建议、AI 模拟 job）。
      </p>
      <p style={{ margin: "0 0 0.85rem", fontSize: "0.8rem" }}>
        <Link to="/">返回首页</Link>
      </p>
      <button type="button" onClick={() => void load()} disabled={loading}>
        {loading ? "刷新中…" : "刷新"}
      </button>

      {loading ? <LoadingState label="加载 AI 记录…" /> : null}
      {error ? (
        <p style={{ color: "#b91c1c" }} role="alert">
          {error}
        </p>
      ) : null}

      {!loading && !error && data ? (
        <>
          <section style={{ marginTop: "0.9rem", padding: "0.7rem 0.8rem", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8 }}>
            <p style={{ margin: "0 0 0.25rem", fontSize: "0.82rem" }}>
              userId: <code><UserIdWithName userId={data.userId} /></code>
            </p>
            <p style={{ margin: "0 0 0.25rem", fontSize: "0.82rem" }}>
              generatedAt: <code>{dt(data.generatedAt)}</code>
            </p>
            <p style={{ margin: 0, fontSize: "0.8rem", color: "#475569" }}>{data.note}</p>
          </section>

          <section style={{ marginTop: "0.9rem" }}>
            <h2 style={{ fontSize: "1rem", margin: "0 0 0.45rem" }}>
              会话摘要快照（{data.conversationSummaries.length}）
            </h2>
            <div style={{ display: "grid", gap: "0.5rem" }}>
              {data.conversationSummaries.map((row) => (
                <article key={row.id} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "0.55rem 0.65rem" }}>
                  <div style={{ fontSize: "0.78rem", color: "#64748b" }}>
                    {dt(row.createdAt)} · <code>{row.sourceType}</code> · <code>{row.sourceVersion}</code>
                  </div>
                  <div style={{ marginTop: "0.25rem", fontSize: "0.82rem" }}>
                    conv: <code>{row.conversationId}</code> · viewer: <code><UserIdWithName userId={row.viewerUserId} /></code> · candidate:{" "}
                    <code><UserIdWithName userId={row.candidateUserId} /></code>
                  </div>
                  <p style={{ margin: "0.3rem 0 0", fontSize: "0.86rem", color: "#334155", lineHeight: 1.5 }}>
                    {row.summaryPreview}
                  </p>
                </article>
              ))}
              {data.conversationSummaries.length === 0 ? (
                <p style={{ margin: 0, color: "#64748b", fontSize: "0.84rem" }}>暂无记录</p>
              ) : null}
            </div>
          </section>

          <section style={{ marginTop: "0.9rem" }}>
            <h2 style={{ fontSize: "1rem", margin: "0 0 0.45rem" }}>
              画像建议（AI 来源）（{data.profileSuggestions.length}）
            </h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", color: "#475569" }}>
                    <th style={{ padding: "0.45rem" }}>id</th>
                    <th style={{ padding: "0.45rem" }}>status</th>
                    <th style={{ padding: "0.45rem" }}>source</th>
                    <th style={{ padding: "0.45rem" }}>sourceConversationId</th>
                    <th style={{ padding: "0.45rem" }}>createdAt</th>
                  </tr>
                </thead>
                <tbody>
                  {data.profileSuggestions.map((row) => (
                    <tr key={row.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "0.45rem" }}><code>{row.id}</code></td>
                      <td style={{ padding: "0.45rem" }}>{row.status}</td>
                      <td style={{ padding: "0.45rem" }}><code>{row.sourceType}</code> · <code>{row.sourceVersion}</code></td>
                      <td style={{ padding: "0.45rem" }}>{row.sourceConversationId ? <code>{row.sourceConversationId}</code> : "-"}</td>
                      <td style={{ padding: "0.45rem" }}>{dt(row.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section style={{ marginTop: "0.9rem" }}>
            <h2 style={{ fontSize: "1rem", margin: "0 0 0.45rem" }}>
              AI 模拟 Jobs（{data.aiSimulationJobs.length}）
            </h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", color: "#475569" }}>
                    <th style={{ padding: "0.45rem" }}>jobId</th>
                    <th style={{ padding: "0.45rem" }}>status</th>
                    <th style={{ padding: "0.45rem" }}>poolId</th>
                    <th style={{ padding: "0.45rem" }}>spec</th>
                    <th style={{ padding: "0.45rem" }}>createdAt</th>
                  </tr>
                </thead>
                <tbody>
                  {data.aiSimulationJobs.map((row) => (
                    <tr key={row.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "0.45rem" }}><code>{row.id}</code></td>
                      <td style={{ padding: "0.45rem" }}>{row.jobStatus}</td>
                      <td style={{ padding: "0.45rem" }}><code>{row.poolId}</code></td>
                      <td style={{ padding: "0.45rem" }}>
                        <code>{row.schemaVersion}</code> · <code>{row.runSpecVersion}</code>
                      </td>
                      <td style={{ padding: "0.45rem" }}>{dt(row.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}

