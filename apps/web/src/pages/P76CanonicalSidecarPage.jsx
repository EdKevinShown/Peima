import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getP76CanonicalSidecarAggregate,
  getP76CanonicalSidecarDetail,
  listP76CanonicalSidecarAdmin,
} from "../api/p76CanonicalSidecarAdmin";
import AdminFilterPanel from "../components/admin/AdminFilterPanel";
import AdminJsonBlock from "../components/admin/AdminJsonBlock";
import AdminKpiGrid from "../components/admin/AdminKpiGrid";
import AdminNotice from "../components/admin/AdminNotice";
import AdminPageShell from "../components/admin/AdminPageShell";
import {
  adminBadgeToneClass,
  adminBtnSecondary,
  adminInput,
  adminLabel,
  adminLink,
  adminModalOverlay,
  adminModalPanel,
  adminMuted,
  adminSectionTitle,
  adminSelect,
  adminTd,
  adminTh,
} from "../components/admin/adminTheme";
import LoadingState from "../components/common/LoadingState";
import UserIdWithName from "../components/common/UserIdWithName";
import {
  appliedFlagTone,
  getCanonicalSidecarAppliedFlagLabel,
  getCanonicalSidecarModeLabel,
  getCanonicalSidecarPromotionStatusLabel,
  getCanonicalSidecarSafetyLabel,
  hasCanonicalSidecarP0Violation,
  hasCanonicalSidecarRowP0Violation,
  safetyBadgeTone,
} from "../utils/p76CanonicalSidecarLabels.mjs";

const SIDECAR_BANNER =
  "CANONICAL SIDECAR ONLY — NOT APPLIED TO MATCHRESULT";
const SIDECAR_BANNER_ZH =
  "这些记录只是 P7.6 canonical sidecar 候选结果，不代表已经写入 MatchResult，也不会影响用户看到的最终匹配结果。";

const DEFAULT_FILTERS = {
  auditRunId: "",
  environment: "",
  viewerUserId: "",
  matchResultId: "",
  selectedCandidateId: "",
  sourceVersion: "",
  mode: "",
  promotionStatus: "",
  appliedToMatchResult: "false",
  appliedToFinalScore: "",
  appliedToWorkerRanking: "",
  rolledBack: "",
  generatedAtFrom: "",
  generatedAtTo: "",
  activeOnly: "true",
  includeDeleted: "false",
  limit: "50",
};

function formatDt(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString();
}

function truncateId(id, head = 10) {
  if (!id || typeof id !== "string") return "—";
  if (id.length <= head + 3) return id;
  return `${id.slice(0, head)}…`;
}

async function copyText(text) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
}

function isApiDisabledError(message) {
  const m = (message || "").toLowerCase();
  return (
    m.includes("peima_p76_canonical_sidecar_admin_enabled") ||
    m.includes("功能未启用")
  );
}

function isPermissionError(message) {
  const m = message || "";
  return m.includes("无权限") || m.includes("403") || m.includes("401");
}

function badgeToneClass(tone) {
  const key = tone === "neutral" ? "muted" : tone;
  return adminBadgeToneClass[key] ?? adminBadgeToneClass.muted;
}

function jsonPreview(value, maxLen = 8192) {
  if (value == null) return "—";
  let text;
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  if (text.length > maxLen) {
    return `${text.slice(0, maxLen)}\n… (truncated)`;
  }
  return text;
}

function AppliedFlagBadge({ value, context, promotionStatus }) {
  const tone = appliedFlagTone(value, promotionStatus);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[0.68rem] ${badgeToneClass(tone)} ${tone === "p0" ? "font-semibold" : ""}`}
    >
      {getCanonicalSidecarAppliedFlagLabel(value, context, promotionStatus)}
    </span>
  );
}

function SafetyBadge({ item }) {
  const label = getCanonicalSidecarSafetyLabel(item);
  const tone = safetyBadgeTone(item);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[0.68rem] ${badgeToneClass(tone)} ${tone === "p0" ? "font-semibold" : ""}`}
    >
      {label}
    </span>
  );
}

function CopyIdCell({ value, truncate = true }) {
  if (!value) return <span>—</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <span title={value}>{truncate ? truncateId(value) : value}</span>
      <button
        type="button"
        className={`${adminBtnSecondary} !py-0.5 !px-1.5 !text-[0.65rem]`}
        onClick={(e) => {
          e.stopPropagation();
          void copyText(value);
        }}
      >
        copy
      </button>
    </span>
  );
}

function AggregateCards({ aggregate, loading }) {
  if (loading && !aggregate) {
    return <LoadingState label="加载 aggregate…" />;
  }
  if (!aggregate) return null;

  const p0Violation = hasCanonicalSidecarP0Violation(aggregate);

  const items = [
    { key: "totalVisible", label: "totalVisible", value: aggregate.totalVisible },
    { key: "sidecarOnlyCount", label: "sidecarOnlyCount", value: aggregate.sidecarOnlyCount },
    { key: "promotedCount", label: "promotedCount", value: aggregate.promotedCount },
    { key: "blockedCount", label: "blockedCount", value: aggregate.blockedCount },
    { key: "rolledBackCount", label: "rolledBackCount", value: aggregate.rolledBackCount },
    {
      key: "appliedToMatchResultViolationCount",
      label: "appliedToMatchResultViolationCount",
      value: aggregate.appliedToMatchResultViolationCount,
      p0: aggregate.appliedToMatchResultViolationCount > 0,
    },
    {
      key: "appliedToFinalScoreViolationCount",
      label: "appliedToFinalScoreViolationCount",
      value: aggregate.appliedToFinalScoreViolationCount,
      p0: aggregate.appliedToFinalScoreViolationCount > 0,
    },
    {
      key: "appliedToWorkerRankingViolationCount",
      label: "appliedToWorkerRankingViolationCount",
      value: aggregate.appliedToWorkerRankingViolationCount,
      p0: aggregate.appliedToWorkerRankingViolationCount > 0,
    },
  ];

  return (
    <>
      {p0Violation ? (
        <AdminNotice variant="p0">
          P0 alert: one or more applied* violation counts &gt; 0
        </AdminNotice>
      ) : null}
      <AdminKpiGrid items={items} />
    </>
  );
}

export default function P76CanonicalSidecarPage() {
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });
  const [appliedFilters, setAppliedFilters] = useState({ ...DEFAULT_FILTERS });
  const [items, setItems] = useState([]);
  const [aggregate, setAggregate] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [listLoading, setListLoading] = useState(false);
  const [aggLoading, setAggLoading] = useState(false);
  const [listError, setListError] = useState("");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const queryParams = useMemo(() => {
    const limit = Math.min(
      100,
      Math.max(1, parseInt(appliedFilters.limit, 10) || 50),
    );
    const p = { limit };
    const setStr = (key) => {
      const v = appliedFilters[key];
      if (v) p[key] = v;
    };
    setStr("auditRunId");
    setStr("environment");
    setStr("viewerUserId");
    setStr("matchResultId");
    setStr("selectedCandidateId");
    setStr("sourceVersion");
    setStr("mode");
    setStr("promotionStatus");
    setStr("generatedAtFrom");
    setStr("generatedAtTo");
    if (appliedFilters.appliedToMatchResult === "true") {
      p.appliedToMatchResult = true;
    }
    if (appliedFilters.appliedToMatchResult === "false") {
      p.appliedToMatchResult = false;
    }
    if (appliedFilters.appliedToFinalScore === "true") {
      p.appliedToFinalScore = true;
    }
    if (appliedFilters.appliedToFinalScore === "false") {
      p.appliedToFinalScore = false;
    }
    if (appliedFilters.appliedToWorkerRanking === "true") {
      p.appliedToWorkerRanking = true;
    }
    if (appliedFilters.appliedToWorkerRanking === "false") {
      p.appliedToWorkerRanking = false;
    }
    if (appliedFilters.rolledBack === "true") p.rolledBack = true;
    if (appliedFilters.rolledBack === "false") p.rolledBack = false;
    if (appliedFilters.activeOnly === "true") p.activeOnly = true;
    if (appliedFilters.activeOnly === "false") p.activeOnly = false;
    if (appliedFilters.includeDeleted === "true") p.includeDeleted = true;
    if (appliedFilters.includeDeleted === "false") p.includeDeleted = false;
    return p;
  }, [appliedFilters]);

  const fetchData = useCallback(
    async ({ append = false, cursor = null } = {}) => {
      setListLoading(true);
      setAggLoading(true);
      if (!append) setListError("");
      try {
        const listPromise = listP76CanonicalSidecarAdmin({
          ...queryParams,
          cursor: cursor ?? undefined,
        });
        const aggPromise = getP76CanonicalSidecarAggregate(queryParams);
        const [listData, aggData] = await Promise.all([listPromise, aggPromise]);
        const next = Array.isArray(listData.items) ? listData.items : [];
        setItems((prev) => (append ? [...prev, ...next] : next));
        setNextCursor(listData.pageInfo?.nextCursor ?? null);
        setAggregate(aggData);
      } catch (e) {
        if (!append) {
          setItems([]);
          setAggregate(null);
        }
        setListError(e instanceof Error ? e.message : String(e));
      } finally {
        setListLoading(false);
        setAggLoading(false);
      }
    },
    [queryParams],
  );

  useEffect(() => {
    void fetchData({ append: false });
  }, [fetchData]);

  const openDetail = useCallback(async (id) => {
    setDetailId(id);
    setDetailOpen(true);
    setDetail(null);
    setDetailError("");
    setDetailLoading(true);
    try {
      setDetail(await getP76CanonicalSidecarDetail(id));
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeDetail = () => {
    setDetailOpen(false);
    setDetailId(null);
    setDetail(null);
    setDetailError("");
  };

  const exportVisibleJson = () => {
    const blob = new Blob([JSON.stringify(items, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `p76-canonical-sidecar-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const row = detail?.row;
  const safety = row?.safety;
  const links = detail?.links;

  const apiDisabled = isApiDisabledError(listError);
  const permissionDenied = isPermissionError(listError);

  return (
    <AdminPageShell
      title="P7.6 Canonical Sidecar Review"
      subtitle="Read-only review of p76_canonical_match_result_meta. Not applied to MatchResult."
      maxWidth="max-w-[1400px]"
    >
      <AdminNotice variant="p0" sticky title={SIDECAR_BANNER}>
        <div className="text-xs mt-1">{SIDECAR_BANNER_ZH}</div>
        <ul className="mt-1.5 pl-4 text-xs list-disc">
          <li>No Apply</li>
          <li>No MatchResult write</li>
          <li>No worker / GET read</li>
          <li>No production rollout</li>
        </ul>
      </AdminNotice>

      <AdminNotice variant="internal">
        <strong>内部 / Admin</strong> — 只读审阅；权限 VIEW_P76_CANONICAL_REHEARSAL。
        你需要 VIEW_P76_CANONICAL_REHEARSAL 权限才能查看 canonical sidecar 只读记录。
        No Apply · No MatchResult write · No worker / GET read · No production rollout。
        {" "}
        <Link to="/admin/p76/canonical-rehearsal" className={adminLink}>
          Canonical Rehearsal
        </Link>
      </AdminNotice>

      <AggregateCards aggregate={aggregate} loading={aggLoading} />

      <AdminFilterPanel title="Filters">
          <label className={adminLabel}>
            auditRunId
            <input
              type="text"
              value={filters.auditRunId}
              onChange={(e) =>
                setFilters((f) => ({ ...f, auditRunId: e.target.value }))
              }
              className={`${adminInput} block mt-0.5 w-[180px]`}
            />
          </label>
          <label className={adminLabel}>
            environment
            <select
              value={filters.environment}
              onChange={(e) =>
                setFilters((f) => ({ ...f, environment: e.target.value }))
              }
              className={`${adminSelect} block mt-0.5`}
            >
              <option value="">any</option>
              <option value="dev">dev</option>
              <option value="staging">staging</option>
            </select>
          </label>
          <label className={adminLabel}>
            viewerUserId
            <input
              type="text"
              value={filters.viewerUserId}
              onChange={(e) =>
                setFilters((f) => ({ ...f, viewerUserId: e.target.value }))
              }
              className={`${adminInput} block mt-0.5 w-[160px]`}
            />
          </label>
          <label className={adminLabel}>
            matchResultId
            <input
              type="text"
              value={filters.matchResultId}
              onChange={(e) =>
                setFilters((f) => ({ ...f, matchResultId: e.target.value }))
              }
              className={`${adminInput} block mt-0.5 w-[160px]`}
            />
          </label>
          <label className={adminLabel}>
            selectedCandidateId
            <input
              type="text"
              value={filters.selectedCandidateId}
              onChange={(e) =>
                setFilters((f) => ({ ...f, selectedCandidateId: e.target.value }))
              }
              className={`${adminInput} block mt-0.5 w-[160px]`}
            />
          </label>
          <label className={adminLabel}>
            sourceVersion
            <input
              type="text"
              value={filters.sourceVersion}
              onChange={(e) =>
                setFilters((f) => ({ ...f, sourceVersion: e.target.value }))
              }
              className={`${adminInput} block mt-0.5 w-[220px]`}
            />
          </label>
          <label className={adminLabel}>
            mode
            <select
              value={filters.mode}
              onChange={(e) => setFilters((f) => ({ ...f, mode: e.target.value }))}
              className={`${adminSelect} block mt-0.5`}
            >
              <option value="">any</option>
              <option value="dry_run">dry_run</option>
              <option value="sidecar">sidecar</option>
              <option value="promoted">promoted</option>
            </select>
          </label>
          <label className={adminLabel}>
            promotionStatus
            <select
              value={filters.promotionStatus}
              onChange={(e) =>
                setFilters((f) => ({ ...f, promotionStatus: e.target.value }))
              }
              className={`${adminSelect} block mt-0.5`}
            >
              <option value="">any</option>
              <option value="not_promoted">not_promoted</option>
              <option value="promoted">promoted</option>
              <option value="rolled_back">rolled_back</option>
              <option value="blocked">blocked</option>
            </select>
          </label>
          <label className={adminLabel}>
            appliedToMatchResult
            <select
              value={filters.appliedToMatchResult}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  appliedToMatchResult: e.target.value,
                }))
              }
              className={`${adminSelect} block mt-0.5`}
            >
              <option value="false">false</option>
              <option value="true">true (P0)</option>
              <option value="">any</option>
            </select>
          </label>
          <label className={adminLabel}>
            appliedToFinalScore
            <select
              value={filters.appliedToFinalScore}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  appliedToFinalScore: e.target.value,
                }))
              }
              className={`${adminSelect} block mt-0.5`}
            >
              <option value="">any</option>
              <option value="false">false</option>
              <option value="true">true (P0)</option>
            </select>
          </label>
          <label className={adminLabel}>
            appliedToWorkerRanking
            <select
              value={filters.appliedToWorkerRanking}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  appliedToWorkerRanking: e.target.value,
                }))
              }
              className={`${adminSelect} block mt-0.5`}
            >
              <option value="">any</option>
              <option value="false">false</option>
              <option value="true">true (P0)</option>
            </select>
          </label>
          <label className={adminLabel}>
            rolledBack
            <select
              value={filters.rolledBack}
              onChange={(e) =>
                setFilters((f) => ({ ...f, rolledBack: e.target.value }))
              }
              className={`${adminSelect} block mt-0.5`}
            >
              <option value="">any</option>
              <option value="false">false</option>
              <option value="true">true</option>
            </select>
          </label>
          <label className={adminLabel}>
            generatedAtFrom
            <input
              type="datetime-local"
              value={filters.generatedAtFrom}
              onChange={(e) =>
                setFilters((f) => ({ ...f, generatedAtFrom: e.target.value }))
              }
              className={`${adminInput} block mt-0.5`}
            />
          </label>
          <label className={adminLabel}>
            generatedAtTo
            <input
              type="datetime-local"
              value={filters.generatedAtTo}
              onChange={(e) =>
                setFilters((f) => ({ ...f, generatedAtTo: e.target.value }))
              }
              className={`${adminInput} block mt-0.5`}
            />
          </label>
          <label className={adminLabel}>
            activeOnly
            <select
              value={filters.activeOnly}
              onChange={(e) =>
                setFilters((f) => ({ ...f, activeOnly: e.target.value }))
              }
              className={`${adminSelect} block mt-0.5`}
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </label>
          <label className={adminLabel}>
            includeDeleted
            <select
              value={filters.includeDeleted}
              onChange={(e) =>
                setFilters((f) => ({ ...f, includeDeleted: e.target.value }))
              }
              className={`${adminSelect} block mt-0.5`}
            >
              <option value="false">false</option>
              <option value="true">true</option>
            </select>
          </label>
          <label className={adminLabel}>
            limit
            <input
              type="number"
              min={1}
              max={100}
              value={filters.limit}
              onChange={(e) =>
                setFilters((f) => ({ ...f, limit: e.target.value }))
              }
              className={`${adminInput} block mt-0.5 w-[72px]`}
            />
          </label>
          <button
            type="button"
            className={adminBtnSecondary}
            disabled={listLoading}
            onClick={() => void fetchData({ append: false })}
          >
            Refresh
          </button>
          <button
            type="button"
            className={adminBtnSecondary}
            disabled={listLoading}
            onClick={() => setAppliedFilters({ ...filters })}
          >
            Query
          </button>
          <button
            type="button"
            className={adminBtnSecondary}
            disabled={listLoading}
            onClick={() => {
              setFilters({ ...DEFAULT_FILTERS });
              setAppliedFilters({ ...DEFAULT_FILTERS });
            }}
          >
            Reset
          </button>
          <button
            type="button"
            className={adminBtnSecondary}
            disabled={items.length === 0}
            onClick={exportVisibleJson}
          >
            Export visible JSON
          </button>
        </AdminFilterPanel>
        <p className={`${adminMuted} mt-2`}>
          Default: activeOnly=true · includeDeleted=false · appliedToMatchResult=false ·
          limit=50 · createdAt desc
        </p>

      {listLoading && items.length === 0 ? (
        <LoadingState label="加载列表…" />
      ) : null}

      {listError ? (
        <AdminNotice
          variant={apiDisabled ? "disabled" : permissionDenied ? "warning" : "p0"}
        >
          {apiDisabled ? (
            <>
              <strong>API disabled.</strong> Enable{" "}
              <code>PEIMA_P76_CANONICAL_SIDECAR_ADMIN_ENABLED=1</code> locally, then
              refresh.
            </>
          ) : permissionDenied ? (
            <>
              <strong>Permission denied.</strong> {listError}
            </>
          ) : (
            listError
          )}
        </AdminNotice>
      ) : null}

      {!listError || items.length > 0 ? (
        <section className="admin-table-wrap overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={adminTh}>createdAt</th>
                <th className={adminTh}>environment</th>
                <th className={adminTh}>auditRunId</th>
                <th className={adminTh}>sourceVersion</th>
                <th className={adminTh}>viewerUserId</th>
                <th className={adminTh}>matchResultId</th>
                <th className={adminTh}>selectedCandidateId</th>
                <th className={adminTh}>score</th>
                <th className={adminTh}>mode</th>
                <th className={adminTh}>promotionStatus</th>
                <th className={adminTh}>appliedToMatchResult</th>
                <th className={adminTh}>appliedToFinalScore</th>
                <th className={adminTh}>appliedToWorkerRanking</th>
                <th className={adminTh}>rolledBack</th>
                <th className={adminTh}>safety</th>
                <th className={adminTh}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const p0 = hasCanonicalSidecarRowP0Violation(r);
                const superseded = Boolean(r.supersededAt);
                return (
                  <tr
                    key={r.id}
                    onClick={() => void openDetail(r.id)}
                    className={`cursor-pointer ${
                      p0
                        ? "bg-red-500/10"
                        : superseded
                          ? "bg-white/5"
                          : "hover:bg-white/5"
                    }`}
                  >
                    <td className={adminTd}>{formatDt(r.createdAt)}</td>
                    <td className={adminTd}>{r.environment ?? "—"}</td>
                    <td className={adminTd}>
                      <CopyIdCell value={r.auditRunId} />
                    </td>
                    <td className={adminTd}>{r.sourceVersion ?? "—"}</td>
                    <td className={adminTd}>
                      {r.viewerUserId ? <UserIdWithName userId={r.viewerUserId} /> : "—"}
                    </td>
                    <td className={adminTd}>{r.matchResultId ?? "—"}</td>
                    <td className={adminTd}>
                      {r.selectedCandidateId ? <UserIdWithName userId={r.selectedCandidateId} /> : "—"}
                    </td>
                    <td className={adminTd}>{r.score != null ? String(r.score) : "—"}</td>
                    <td className={adminTd}>{getCanonicalSidecarModeLabel(r.mode)}</td>
                    <td className={adminTd}>
                      {getCanonicalSidecarPromotionStatusLabel(r.promotionStatus)}
                    </td>
                    <td className={adminTd}>
                      <AppliedFlagBadge
                        value={r.appliedToMatchResult}
                        context="matchResult"
                        promotionStatus={r.promotionStatus}
                      />
                    </td>
                    <td className={adminTd}>
                      <AppliedFlagBadge
                        value={r.appliedToFinalScore}
                        context="finalScore"
                        promotionStatus={r.promotionStatus}
                      />
                    </td>
                    <td className={adminTd}>
                      <AppliedFlagBadge
                        value={r.appliedToWorkerRanking}
                        context="workerRanking"
                        promotionStatus={r.promotionStatus}
                      />
                    </td>
                    <td className={adminTd}>{r.rolledBack ? "yes" : "no"}</td>
                    <td className={adminTd}>
                      <SafetyBadge item={r} />
                    </td>
                    <td className={adminTd}>
                      <button
                        type="button"
                        className={adminBtnSecondary}
                        onClick={(e) => {
                          e.stopPropagation();
                          void openDetail(r.id);
                        }}
                      >
                        Detail
                      </button>
                      {" "}
                      <Link
                        to={`/admin/p76/canonical-sidecar/${r.id}/apply-review`}
                        className={`${adminLink} text-[0.68rem]`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        Apply review
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {items.length === 0 && !listLoading && !listError ? (
            <p className={`${adminMuted} mt-2`}>
              无记录。
            </p>
          ) : null}
          {items.length === 0 && !listLoading && listError && !apiDisabled ? (
            <p className={`${adminMuted} mt-2`}>
              无记录（请调整筛选条件）。
            </p>
          ) : null}
          {nextCursor ? (
            <button
              type="button"
              className={`${adminBtnSecondary} mt-2`}
              disabled={listLoading}
              onClick={() => void fetchData({ append: true, cursor: nextCursor })}
            >
              Load more
            </button>
          ) : null}
        </section>
      ) : null}

      {detailOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          className={adminModalOverlay}
          onClick={closeDetail}
        >
          <div
            className={`${adminModalPanel} max-w-xl max-h-[90vh] overflow-y-auto`}
            onClick={(e) => e.stopPropagation()}
          >
            <AdminNotice variant="p0" title={SIDECAR_BANNER}>
              {SIDECAR_BANNER_ZH}
            </AdminNotice>

            <div className="flex justify-between items-center mb-3 gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-white m-0">Detail</h2>
              <div className="flex gap-1.5 flex-wrap">
                {detailId ? (
                  <>
                    <button
                      type="button"
                      className={adminBtnSecondary}
                      onClick={() => void copyText(detailId)}
                    >
                      Copy id
                    </button>
                    <Link
                      to={`/admin/p76/canonical-sidecar/${detailId}/apply-review`}
                      className={adminBtnSecondary}
                    >
                      Open apply review
                    </Link>
                  </>
                ) : null}
                <button type="button" className={adminBtnSecondary} onClick={closeDetail}>
                  Close
                </button>
              </div>
            </div>

            {detailLoading ? <LoadingState label="加载详情…" /> : null}
            {detailError ? (
              <AdminNotice variant="p0">{detailError}</AdminNotice>
            ) : null}

            {row ? (
              <>
                {hasCanonicalSidecarRowP0Violation(row) ? (
                  <AdminNotice variant="p0">
                    P0: applied* flag violation — sidecar must not mutate MatchResult /
                    finalScore / worker ranking.
                  </AdminNotice>
                ) : null}

                <h3 className={`${adminSectionTitle} mt-2`}>Basic info</h3>
                <DetailGrid
                  items={[
                    ["id", <CopyIdCell key="id" value={row.id} truncate={false} />],
                    ["environment", row.environment ?? "—"],
                    ["viewerUserId", row.viewerUserId ?? "—"],
                    ["matchResultId", row.matchResultId ?? "—"],
                    ["createdAt", formatDt(row.createdAt)],
                    ["updatedAt", formatDt(row.updatedAt)],
                  ]}
                />

                <h3 className={adminSectionTitle}>Candidate / score</h3>
                <DetailGrid
                  items={[
                    ["selectedCandidateId", row.selectedCandidateId ?? "—"],
                    ["score", row.score != null ? String(row.score) : "—"],
                    ["sourceType", row.sourceType ?? "—"],
                  ]}
                />

                <h3 className={adminSectionTitle}>Source / audit</h3>
                <DetailGrid
                  items={[
                    ["auditRunId", <CopyIdCell key="a" value={row.auditRunId} truncate={false} />],
                    ["sourceVersion", row.sourceVersion ?? "—"],
                    ["schemaVersion", row.schemaVersion != null ? String(row.schemaVersion) : "—"],
                    ["mode", getCanonicalSidecarModeLabel(row.mode)],
                  ]}
                />

                <h3 className={adminSectionTitle}>Promotion status</h3>
                <DetailGrid
                  items={[
                    [
                      "promotionStatus",
                      getCanonicalSidecarPromotionStatusLabel(row.promotionStatus),
                    ],
                    ["rolledBack", row.rolledBack ? "true" : "false"],
                    [
                      "promotionTargetMatchResultId",
                      row.promotionTargetMatchResultId ?? "—",
                    ],
                    [
                      "rollbackTokenPresent",
                      row.rollbackTokenPresent ? "true" : "false",
                    ],
                  ]}
                />

                <h3 className={adminSectionTitle}>Applied flags</h3>
                <DetailGrid
                  items={[
                    [
                      "appliedToMatchResult",
                      <AppliedFlagBadge
                        key="amr"
                        value={row.appliedToMatchResult}
                        context="matchResult"
                        promotionStatus={row.promotionStatus}
                      />,
                    ],
                    [
                      "appliedToFinalScore",
                      <AppliedFlagBadge
                        key="afs"
                        value={row.appliedToFinalScore}
                        context="finalScore"
                        promotionStatus={row.promotionStatus}
                      />,
                    ],
                    [
                      "appliedToWorkerRanking",
                      <AppliedFlagBadge
                        key="awr"
                        value={row.appliedToWorkerRanking}
                        context="workerRanking"
                        promotionStatus={row.promotionStatus}
                      />,
                    ],
                  ]}
                />

                <h3 className={adminSectionTitle}>Safety flags</h3>
                <DetailGrid
                  items={[
                    ["isSidecarOnly", safety?.isSidecarOnly ? "true" : "false"],
                    [
                      "notAppliedToMatchResult",
                      safety?.notAppliedToMatchResult ? "true" : "false",
                    ],
                    [
                      "notAppliedToFinalScore",
                      safety?.notAppliedToFinalScore ? "true" : "false",
                    ],
                    [
                      "notAppliedToWorkerRanking",
                      safety?.notAppliedToWorkerRanking ? "true" : "false",
                    ],
                    ["readByGetPath", "false"],
                    ["readByWorker", "false"],
                  ]}
                />

                <h3 className={adminSectionTitle}>Signoff statuses</h3>
                <DetailGrid
                  items={[
                    ["pmSignoffStatus", row.pmSignoffStatus ?? "—"],
                    ["opsSignoffStatus", row.opsSignoffStatus ?? "—"],
                  ]}
                />

                <h3 className={adminSectionTitle}>Lifecycle</h3>
                <DetailGrid
                  items={[
                    ["supersededAt", formatDt(row.supersededAt)],
                    ["deletedAt", formatDt(row.deletedAt)],
                    [
                      "rehearsal admin",
                      links?.rehearsalAdminPath ? (
                        <Link key="rh" to={links.rehearsalAdminPath} className={adminLink}>
                          open rehearsal
                        </Link>
                      ) : (
                        "—"
                      ),
                    ],
                  ]}
                />

                <h3 className={adminSectionTitle}>reasonSummary JSON preview</h3>
                <AdminJsonBlock value={jsonPreview(row.reasonSummary)} />

                <h3 className={adminSectionTitle}>stageSummary JSON preview</h3>
                <AdminJsonBlock value={jsonPreview(row.stageSummary)} />

                <h3 className={adminSectionTitle}>safeFallbackMeta JSON preview</h3>
                <AdminJsonBlock value={jsonPreview(row.safeFallbackMeta)} />

                <h3 className={adminSectionTitle}>guardrails JSON preview</h3>
                <AdminJsonBlock value={jsonPreview(row.guardrails)} />

                <h3 className={adminSectionTitle}>sanitized dryRunPayload JSON preview</h3>
                <AdminJsonBlock value={jsonPreview(row.dryRunPayload)} />
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </AdminPageShell>
  );
}

function DetailGrid({ items }) {
  return (
    <dl className="grid grid-cols-[minmax(140px,38%)_1fr] gap-x-2 gap-y-1 text-xs m-0 mb-3">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="m-0 text-white/45">{k}</dt>
          <dd className="m-0 break-all text-white/85">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
