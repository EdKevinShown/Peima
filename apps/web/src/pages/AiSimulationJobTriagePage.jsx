import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getAdminAiSimulationV1JobsTriage } from "../api/ai-simulation-v1";
import LoadingState from "../components/common/LoadingState";
import AdminPageShell from "../components/admin/AdminPageShell";
import AdminNotice from "../components/admin/AdminNotice";
import AdminFilterPanel from "../components/admin/AdminFilterPanel";
import AdminKpiGrid from "../components/admin/AdminKpiGrid";
import AdminDataTable from "../components/admin/AdminDataTable";
import AdminIdPill from "../components/admin/AdminIdPill";
import { adminLabel, adminLink, adminSelect, adminMuted } from "../components/admin/adminTheme";

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

  /** Phase F v0.6：基于当前接口返回的 rows 前端聚合（只读，不联动筛选）。 */
  const triageSummary = useMemo(() => {
    let inProgress = 0;
    let currentOk = 0;
    let currentAnomaly = 0;
    let legacyAcceptable = 0;
    let hasFailedItem = 0;
    for (const r of rows) {
      const st = typeof r.jobStatus === "string" ? r.jobStatus : "";
      const bucket = typeof r.diagnosticBucket === "string" ? r.diagnosticBucket : "";
      if (st === "queued" || st === "running" || bucket === "in_progress") inProgress += 1;
      if (bucket === "current_ok") currentOk += 1;
      if (bucket === "current_anomaly") currentAnomaly += 1;
      if (bucket === "legacy_acceptable") legacyAcceptable += 1;
      if (r.hasFailedItem === true) hasFailedItem += 1;
    }
    return { inProgress, currentOk, currentAnomaly, legacyAcceptable, hasFailedItem };
  }, [rows]);

  const updateFilter = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value == null || value === "") next.delete(key);
    else next.set(key, String(value));
    setSearchParams(next);
  };

  const kpiItems = [
    { key: "inProgress", label: "进行中", value: triageSummary.inProgress, hint: "排队或运行中，或分诊桶为进行中" },
    { key: "currentOk", label: "当前规范·正常", value: triageSummary.currentOk, hint: "分诊桶：当前规范、正常" },
    {
      key: "currentAnomaly",
      label: "当前规范·异常",
      value: triageSummary.currentAnomaly,
      hint: "分诊桶：当前规范、异常",
      danger: triageSummary.currentAnomaly > 0,
    },
    { key: "legacyAcceptable", label: "旧版可接受", value: triageSummary.legacyAcceptable, hint: "分诊桶：旧版可接受" },
    {
      key: "hasFailedItem",
      label: "含失败项",
      value: triageSummary.hasFailedItem,
      hint: "行上标记含失败项为是",
      danger: triageSummary.hasFailedItem > 0,
    },
  ];

  const tableColumns = [
    {
      key: "jobId",
      label: "jobId",
      render: (row) => <AdminIdPill id={row.simulationJobId} />,
    },
    { key: "jobStatus", label: "jobStatus" },
    {
      key: "itemCounts",
      label: "itemCounts",
      render: (row) => (
        <code className="text-[0.68rem] text-white/70">
          t{row.itemCounts.total}/q{row.itemCounts.queued}/r{row.itemCounts.running}/s
          {row.itemCounts.succeeded}/f{row.itemCounts.failed}
        </code>
      ),
    },
    { key: "binding", label: "binding", render: (row) => String(row.shortlistBindingPresent) },
    { key: "trio", label: "trio", render: (row) => String(row.sidecarTrioPresent) },
    {
      key: "rank",
      label: "rank",
      render: (row) => (row.rankConsistent == null ? "null" : String(row.rankConsistent)),
    },
    {
      key: "suppressedReason",
      label: "suppressedReason",
      render: (row) => <AdminIdPill id={row.sidecarSuppressedReason} truncate={18} />,
    },
    {
      key: "spec",
      label: "spec",
      render: (row) => <AdminIdPill id={row.specClassification} truncate={18} />,
    },
    {
      key: "bucket",
      label: "bucket",
      render: (row) => <AdminIdPill id={row.diagnosticBucket} truncate={18} />,
    },
    {
      key: "buildability",
      label: "buildability",
      render: (row) => <AdminIdPill id={row.buildabilityDetail} truncate={18} />,
    },
    { key: "hasFailedItem", label: "hasFailedItem", render: (row) => String(row.hasFailedItem) },
    {
      key: "updatedAt",
      label: "updatedAt",
      render: (row) => new Date(row.updatedAt).toLocaleString(),
    },
    {
      key: "detail",
      label: "详情",
      render: (row) => (
        <Link
          className={adminLink}
          to={`/admin/ai-sim-job-diagnostic?jobId=${encodeURIComponent(row.simulationJobId)}`}
        >
          查看
        </Link>
      ),
    },
  ];

  return (
    <AdminPageShell
      maxWidth="max-w-6xl"
      title="AI Simulation Job 分诊列表（内部只读）"
      subtitle="仅用于诊断状态与排障分诊；不触发写操作，不参与主链结论。"
    >
      <AdminNotice variant="internal" title="内部 / Admin">
        不在 Phase G v0.1 用户主路径；需管理员权限与有效登录。
      </AdminNotice>

      <p className={`${adminMuted} mb-4`}>
        <Link className={adminLink} to="/admin/ai-sim-job-diagnostic">
          去单条诊断详情（手填 jobId）
        </Link>
      </p>

      <AdminFilterPanel title="最小筛选">
        <label className={adminLabel}>
          jobStatus{" "}
          <select
            className={adminSelect}
            value={filters.jobStatus || ""}
            onChange={(e) => updateFilter("jobStatus", e.target.value)}
          >
            <option value="">全部</option>
            <option value="queued">queued</option>
            <option value="running">running</option>
            <option value="completed">completed</option>
          </select>
        </label>
        <label className={adminLabel}>
          sidecarTrioPresent{" "}
          <select
            className={adminSelect}
            value={searchParams.get("sidecarTrioPresent") || ""}
            onChange={(e) => updateFilter("sidecarTrioPresent", e.target.value)}
          >
            <option value="">全部</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </label>
        <label className={adminLabel}>
          rankConsistent{" "}
          <select
            className={adminSelect}
            value={searchParams.get("rankConsistent") || ""}
            onChange={(e) => updateFilter("rankConsistent", e.target.value)}
          >
            <option value="">全部</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </label>
        <label className={adminLabel}>
          hasFailedItem{" "}
          <select
            className={adminSelect}
            value={searchParams.get("hasFailedItem") || ""}
            onChange={(e) => updateFilter("hasFailedItem", e.target.value)}
          >
            <option value="">全部</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </label>
        <label className={adminLabel}>
          sidecarSuppressedReason{" "}
          <input
            className="admin-input"
            value={filters.sidecarSuppressedReason || ""}
            onChange={(e) => updateFilter("sidecarSuppressedReason", e.target.value)}
            placeholder="例如 rank_mismatch"
          />
        </label>
        <label className={adminLabel}>
          diagnosticBucket{" "}
          <select
            className={adminSelect}
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
      </AdminFilterPanel>

      {!loading && !error ? (
        <>
          <p className={`${adminMuted} mb-2`}>
            <strong className="text-white/60">基于当前列表结果</strong>（本页接口最多 {filters.limit}{" "}
            条，随上方筛选与刷新变化）· 只读摘要，非全库统计。
          </p>
          <AdminKpiGrid items={kpiItems} />
          <p className={`${adminMuted} mb-4`}>
            与下方表格为同一批数据；摘要项不可点击，筛选仍请用上方控件。
          </p>
        </>
      ) : null}

      {loading ? <LoadingState label="加载 AI 模拟 job 列表（最近 50 条）..." /> : null}
      {error ? (
        <AdminNotice variant="danger" title="加载失败">
          {error}
        </AdminNotice>
      ) : null}

      {!loading && !error ? (
        <AdminDataTable
          columns={tableColumns}
          rows={rows}
          rowKey="simulationJobId"
          emptyMessage="无匹配记录（当前筛选条件）。"
        />
      ) : null}
    </AdminPageShell>
  );
}
