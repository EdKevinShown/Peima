import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getAdminAiSimulationV1JobsTriage } from "../api/ai-simulation-v1";
import LoadingState from "../components/common/LoadingState";

function parseBoolParam(v) {
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}

export default function AiSimulationJobTriagePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const filters = useMemo(() => {
    return {
      limit: 50,
      jobStatus: (searchParams.get("jobStatus") || "").trim() || undefined,
      sidecarSuppressedReason: (searchParams.get("sidecarSuppressedReason") || "").trim() || undefined,
      diagnosticBucket: (searchParams.get("diagnosticBucket") || "").trim() || undefined,
      sidecarTrioPresent: parseBoolParam(searchParams.get("sidecarTrioPresent")),
      rankConsistent: parseBoolParam(searchParams.get("rankConsistent")),
      hasFailedItem: parseBoolParam(searchParams.get("hasFailedItem")),
    };
  }, [searchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getAdminAiSimulationV1JobsTriage(filters);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const updateFilter = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value == null || value === "") next.delete(key);
    else next.set(key, String(value));
    setSearchParams(next);
  };

  return (
    <main style={{ maxWidth: 1200, margin: "1.1rem auto", padding: "0 1rem", color: "#334155" }}>
      <h1 style={{ margin: "0 0 0.45rem", fontSize: "1.25rem", color: "#0f172a" }}>
        AI Simulation Job 分诊列表（内部只读）
      </h1>
      <p style={{ margin: "0 0 0.65rem", fontSize: "0.82rem", color: "#64748b" }}>
        仅用于诊断状态与排障分诊；不触发写操作，不参与主链结论。
      </p>
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.78rem" }}>
        <Link to="/admin/ai-sim-job-diagnostic">去单条诊断详情（手填 jobId）</Link>
      </p>

      <section
        style={{
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          background: "#f8fafc",
          padding: "0.65rem 0.85rem",
          marginBottom: "0.8rem",
          fontSize: "0.8rem",
        }}
      >
        <strong style={{ color: "#334155" }}>最小筛选</strong>
        <div style={{ marginTop: "0.45rem", display: "flex", gap: "0.55rem", flexWrap: "wrap" }}>
          <label>
            jobStatus{" "}
            <select value={filters.jobStatus || ""} onChange={(e) => updateFilter("jobStatus", e.target.value)}>
              <option value="">全部</option>
              <option value="queued">queued</option>
              <option value="running">running</option>
              <option value="completed">completed</option>
            </select>
          </label>
          <label>
            sidecarTrioPresent{" "}
            <select
              value={searchParams.get("sidecarTrioPresent") || ""}
              onChange={(e) => updateFilter("sidecarTrioPresent", e.target.value)}
            >
              <option value="">全部</option>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </label>
          <label>
            rankConsistent{" "}
            <select
              value={searchParams.get("rankConsistent") || ""}
              onChange={(e) => updateFilter("rankConsistent", e.target.value)}
            >
              <option value="">全部</option>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </label>
          <label>
            hasFailedItem{" "}
            <select
              value={searchParams.get("hasFailedItem") || ""}
              onChange={(e) => updateFilter("hasFailedItem", e.target.value)}
            >
              <option value="">全部</option>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </label>
          <label>
            sidecarSuppressedReason{" "}
            <input
              value={filters.sidecarSuppressedReason || ""}
              onChange={(e) => updateFilter("sidecarSuppressedReason", e.target.value)}
              placeholder="例如 rank_mismatch"
            />
          </label>
          <label>
            diagnosticBucket{" "}
            <select
              value={filters.diagnosticBucket || ""}
              onChange={(e) => updateFilter("diagnosticBucket", e.target.value)}
            >
              <option value="">全部</option>
              <option value="legacy_acceptable">legacy_acceptable</option>
              <option value="current_ok">current_ok</option>
              <option value="current_anomaly">current_anomaly</option>
              <option value="in_progress">in_progress</option>
            </select>
          </label>
        </div>
      </section>

      {loading ? <LoadingState label="加载 AI 模拟 job 列表（最近 50 条）..." /> : null}
      {error ? (
        <p style={{ marginTop: "0.5rem", color: "#b91c1c" }} role="alert">
          {error}
        </p>
      ) : null}

      {!loading && !error ? (
        <section
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            background: "#fff",
            padding: "0.6rem 0.75rem",
          }}
        >
          {rows.length === 0 ? (
            <p style={{ margin: 0, fontSize: "0.82rem" }}>无匹配记录（当前筛选条件）。</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: "0.25rem" }}>jobId</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: "0.25rem" }}>jobStatus</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: "0.25rem" }}>itemCounts</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: "0.25rem" }}>binding</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: "0.25rem" }}>trio</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: "0.25rem" }}>rank</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: "0.25rem" }}>suppressedReason</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: "0.25rem" }}>spec</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: "0.25rem" }}>bucket</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: "0.25rem" }}>buildability</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: "0.25rem" }}>hasFailedItem</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: "0.25rem" }}>updatedAt</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: "0.25rem" }}>详情</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.simulationJobId}>
                      <td style={{ padding: "0.25rem", borderBottom: "1px solid #f1f5f9" }}>
                        <code style={{ fontSize: "0.72rem" }}>{row.simulationJobId}</code>
                      </td>
                      <td style={{ padding: "0.25rem", borderBottom: "1px solid #f1f5f9" }}>{row.jobStatus}</td>
                      <td style={{ padding: "0.25rem", borderBottom: "1px solid #f1f5f9" }}>
                        <code style={{ fontSize: "0.72rem" }}>
                          t{row.itemCounts.total}/q{row.itemCounts.queued}/r{row.itemCounts.running}/s{row.itemCounts.succeeded}
                          /f{row.itemCounts.failed}
                        </code>
                      </td>
                      <td style={{ padding: "0.25rem", borderBottom: "1px solid #f1f5f9" }}>
                        {String(row.shortlistBindingPresent)}
                      </td>
                      <td style={{ padding: "0.25rem", borderBottom: "1px solid #f1f5f9" }}>
                        {String(row.sidecarTrioPresent)}
                      </td>
                      <td style={{ padding: "0.25rem", borderBottom: "1px solid #f1f5f9" }}>
                        {row.rankConsistent == null ? "null" : String(row.rankConsistent)}
                      </td>
                      <td style={{ padding: "0.25rem", borderBottom: "1px solid #f1f5f9" }}>
                        <code style={{ fontSize: "0.72rem" }}>{row.sidecarSuppressedReason}</code>
                      </td>
                      <td style={{ padding: "0.25rem", borderBottom: "1px solid #f1f5f9" }}>
                        <code style={{ fontSize: "0.72rem" }}>{row.specClassification}</code>
                      </td>
                      <td style={{ padding: "0.25rem", borderBottom: "1px solid #f1f5f9" }}>
                        <code style={{ fontSize: "0.72rem" }}>{row.diagnosticBucket}</code>
                      </td>
                      <td style={{ padding: "0.25rem", borderBottom: "1px solid #f1f5f9" }}>
                        <code style={{ fontSize: "0.72rem" }}>{row.buildabilityDetail}</code>
                      </td>
                      <td style={{ padding: "0.25rem", borderBottom: "1px solid #f1f5f9" }}>{String(row.hasFailedItem)}</td>
                      <td style={{ padding: "0.25rem", borderBottom: "1px solid #f1f5f9" }}>
                        {new Date(row.updatedAt).toLocaleString()}
                      </td>
                      <td style={{ padding: "0.25rem", borderBottom: "1px solid #f1f5f9" }}>
                        <Link to={`/admin/ai-sim-job-diagnostic?jobId=${encodeURIComponent(row.simulationJobId)}`}>查看</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
}

