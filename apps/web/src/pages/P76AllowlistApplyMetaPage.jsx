import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getP76AllowlistApplyMetaAggregate,
  getP76AllowlistApplyMetaDetail,
  listP76AllowlistApplyMeta,
} from "../api/p76AdminAllowlistApplyMeta";
import AdminFilterPanel from "../components/admin/AdminFilterPanel";
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
  hasMainChainP0,
  hasNonAllowlistP0,
  labelMainChainApplyStatus,
  labelProductApplyStatus,
  labelSidecarStatus,
  labelViolationStatus,
  violationTone,
} from "../utils/p76AllowlistApplyMetaLabels.mjs";

const DEFAULT_FILTERS = {
  viewerUserId: "",
  applied: "",
  rolledBack: "",
  sourceVersion: "",
  violationOnly: false,
  limit: "50",
};

const AUDIT_BANNER =
  "Sidecar written is audit metadata only. It is not production apply and does not affect MatchResult, finalScore, worker, or display.";

function formatDt(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString();
}

function formatIdArray(value) {
  if (!Array.isArray(value) || value.length === 0) return "—";
  return value.filter((x) => typeof x === "string").join(", ");
}

function ViolationBadge({ status }) {
  const tone = violationTone(status);
  const key = tone === "p0" ? "p0" : tone === "warning" ? "warning" : "muted";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[0.68rem] ${adminBadgeToneClass[key]}`}
    >
      {labelViolationStatus(status)}
    </span>
  );
}

function AggregateCards({ aggregate, loading }) {
  if (loading && !aggregate) {
    return <LoadingState label="加载 aggregate…" />;
  }
  if (!aggregate) return null;

  const violationAlert = aggregate.violationCount > 0;
  const mainChainP0 = aggregate.mainChainViolationCount > 0;
  const rolledBackWarn = aggregate.rolledBackRows > 0;

  const items = [
    { key: "totalSidecarRows", label: "Total sidecar rows", value: aggregate.totalSidecarRows },
    { key: "writtenRows", label: "Written rows", value: aggregate.writtenRows },
    { key: "dryRunRows", label: "Dry-run rows", value: aggregate.dryRunRows },
    {
      key: "rolledBackRows",
      label: "Rolled back rows",
      value: aggregate.rolledBackRows,
    },
    {
      key: "violationCount",
      label: "Violation count",
      value: aggregate.violationCount,
      p0: violationAlert,
    },
    {
      key: "mainChainViolationCount",
      label: "Main-chain violation count",
      value: aggregate.mainChainViolationCount,
      p0: mainChainP0,
    },
    {
      key: "appliedToMatchResultTrueCount",
      label: "appliedToMatchResult=true",
      value: aggregate.appliedToMatchResultTrueCount,
    },
    {
      key: "appliedToFinalScoreTrueCount",
      label: "appliedToFinalScore=true",
      value: aggregate.appliedToFinalScoreTrueCount,
    },
    {
      key: "appliedToWorkerRankingTrueCount",
      label: "appliedToWorkerRanking=true",
      value: aggregate.appliedToWorkerRankingTrueCount,
    },
    {
      key: "appliedToDisplayTrueCount",
      label: "appliedToDisplay=true",
      value: aggregate.appliedToDisplayTrueCount,
    },
  ];

  return (
    <>
      {mainChainP0 ? (
        <AdminNotice variant="p0">
          P0 warning: main-chain violation count &gt; 0
        </AdminNotice>
      ) : null}
      {rolledBackWarn && !mainChainP0 ? (
        <AdminNotice variant="warning">
          Warning: rolled-back rows present (not P0)
        </AdminNotice>
      ) : null}
      <AdminKpiGrid items={items} />
    </>
  );
}

export default function P76AllowlistApplyMetaPage() {
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });
  const [appliedFilters, setAppliedFilters] = useState({ ...DEFAULT_FILTERS });
  const [rows, setRows] = useState([]);
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
    const p = {
      viewerUserId: appliedFilters.viewerUserId || undefined,
      sourceVersion: appliedFilters.sourceVersion || undefined,
      violationOnly: appliedFilters.violationOnly || undefined,
      limit,
    };
    if (appliedFilters.applied === "true") p.applied = true;
    if (appliedFilters.applied === "false") p.applied = false;
    if (appliedFilters.rolledBack === "true") p.rolledBack = true;
    if (appliedFilters.rolledBack === "false") p.rolledBack = false;
    return p;
  }, [appliedFilters]);

  const fetchData = useCallback(
    async ({ append = false, cursor = null } = {}) => {
      setListLoading(true);
      setAggLoading(true);
      if (!append) setListError("");
      try {
        const listPromise = listP76AllowlistApplyMeta({
          ...queryParams,
          cursor: cursor ?? undefined,
        });
        const aggPromise = getP76AllowlistApplyMetaAggregate(queryParams);
        const [listData, aggData] = await Promise.all([listPromise, aggPromise]);
        const next = Array.isArray(listData.rows) ? listData.rows : [];
        setRows((prev) => (append ? [...prev, ...next] : next));
        setNextCursor(listData.pagination?.nextCursor ?? null);
        setAggregate(aggData);
      } catch (e) {
        if (!append) {
          setRows([]);
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
      setDetail(await getP76AllowlistApplyMetaDetail(id));
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

  const row = detail?.row;

  return (
    <AdminPageShell
      title="P76 Allowlist Apply Meta"
      subtitle="查询 sidecar 审计元数据。Sidecar written ≠ product-applied；不写 sidecar、不 rollback。"
      maxWidth="max-w-[1400px]"
    >
      <AdminNotice variant="info" sticky title="Audit only.">
        {AUDIT_BANNER}
      </AdminNotice>

      <AdminNotice variant="internal">
        <strong>内部 / Admin</strong> — P76 Allowlist Apply Meta（只读）；
        权限 VIEW_P76_ALLOWLIST_APPLY_META。
        {" "}
        <Link to="/admin/photo-review" className={adminLink}>
          照片审核
        </Link>
      </AdminNotice>

      <AggregateCards aggregate={aggregate} loading={aggLoading} />

      <AdminFilterPanel title="Filters">
          <label className={adminLabel}>
            viewerUserId
            <input
              type="text"
              className={`${adminInput} block mt-0.5 w-[200px]`}
              value={filters.viewerUserId}
              onChange={(e) =>
                setFilters((f) => ({ ...f, viewerUserId: e.target.value }))
              }
            />
          </label>
          <label className={adminLabel}>
            applied
            <select
              className={`${adminSelect} block mt-0.5`}
              value={filters.applied}
              onChange={(e) =>
                setFilters((f) => ({ ...f, applied: e.target.value }))
              }
            >
              <option value="">any</option>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </label>
          <label className={adminLabel}>
            rolledBack
            <select
              className={`${adminSelect} block mt-0.5`}
              value={filters.rolledBack}
              onChange={(e) =>
                setFilters((f) => ({ ...f, rolledBack: e.target.value }))
              }
            >
              <option value="">any</option>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </label>
          <label className={adminLabel}>
            sourceVersion
            <input
              type="text"
              className={`${adminInput} block mt-0.5 w-[220px]`}
              value={filters.sourceVersion}
              onChange={(e) =>
                setFilters((f) => ({ ...f, sourceVersion: e.target.value }))
              }
            />
          </label>
          <label className={adminLabel}>
            limit
            <input
              type="number"
              min={1}
              max={100}
              className={`${adminInput} block mt-0.5 w-[72px]`}
              value={filters.limit}
              onChange={(e) =>
                setFilters((f) => ({ ...f, limit: e.target.value }))
              }
            />
          </label>
          <label className={`${adminLabel} items-center`}>
            <input
              type="checkbox"
              checked={filters.violationOnly}
              onChange={(e) =>
                setFilters((f) => ({ ...f, violationOnly: e.target.checked }))
              }
            />
            violationOnly
          </label>
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
      </AdminFilterPanel>
      <p className={`${adminMuted} mt-2`}>
        Default: limit=50 · createdAt desc
      </p>

      {listLoading && rows.length === 0 ? (
        <LoadingState label="加载列表…" />
      ) : null}
      {listError ? (
        <AdminNotice variant="p0">{listError}</AdminNotice>
      ) : null}

      {!listError ? (
        <section className="admin-table-wrap overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={adminTh}>viewerUserId</th>
                <th className={adminTh}>selectedCandidateId</th>
                <th className={adminTh}>sidecarStatus</th>
                <th className={adminTh}>productApplyStatus</th>
                <th className={adminTh}>mainChainApplyStatus</th>
                <th className={adminTh}>violationStatus</th>
                <th className={adminTh}>pmSignoff</th>
                <th className={adminTh}>opsSignoff</th>
                <th className={adminTh}>allowlist</th>
                <th className={adminTh}>dryRun</th>
                <th className={adminTh}>rolledBack</th>
                <th className={adminTh}>sourceVersion</th>
                <th className={adminTh}>createdAt</th>
                <th className={adminTh}>updatedAt</th>
                <th className={adminTh}>action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={
                    hasMainChainP0(r) || hasNonAllowlistP0(r)
                      ? "bg-red-500/10"
                      : r.rolledBack
                        ? "bg-amber-500/10"
                        : undefined
                  }
                >
                  <td className={adminTd}>
                    <UserIdWithName userId={r.viewerUserId} />
                  </td>
                  <td className={adminTd}>
                    <UserIdWithName userId={r.selectedCandidateId} />
                  </td>
                  <td className={adminTd}>{labelSidecarStatus(r.sidecarStatus)}</td>
                  <td className={adminTd}>
                    {labelProductApplyStatus(r.productApplyStatus)}
                  </td>
                  <td className={adminTd}>
                    {labelMainChainApplyStatus(r.mainChainApplyStatus)}
                  </td>
                  <td className={adminTd}>
                    <ViolationBadge status={r.violationStatus} />
                  </td>
                  <td className={adminTd}>{r.pmSignoffStatus}</td>
                  <td className={adminTd}>{r.opsSignoffStatus}</td>
                  <td className={adminTd}>
                    {r.allowlistMatched ? "yes" : (
                      <span className="text-red-200 font-semibold">no (P0)</span>
                    )}
                  </td>
                  <td className={adminTd}>{r.dryRun ? "yes" : "no"}</td>
                  <td className={adminTd}>{r.rolledBack ? "yes" : "no"}</td>
                  <td className={adminTd}>{r.sourceVersion}</td>
                  <td className={adminTd}>{formatDt(r.createdAt)}</td>
                  <td className={adminTd}>{formatDt(r.updatedAt)}</td>
                  <td className={adminTd}>
                    <button
                      type="button"
                      className={adminBtnSecondary}
                      onClick={() => void openDetail(r.id)}
                    >
                      View detail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && !listLoading ? (
            <p className={`${adminMuted} mt-2`}>
              无记录。
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
            className={`${adminModalPanel} max-w-lg max-h-[90vh] overflow-y-auto`}
            onClick={(e) => e.stopPropagation()}
          >
            <AdminNotice variant="info">{AUDIT_BANNER}</AdminNotice>

            <div className="flex justify-between items-center mb-3">
              <h2 className="text-base font-semibold text-white m-0">Detail</h2>
              <button type="button" className={adminBtnSecondary} onClick={closeDetail}>
                Close
              </button>
            </div>

            {detailLoading ? <LoadingState label="加载详情…" /> : null}
            {detailError ? (
              <AdminNotice variant="p0">{detailError}</AdminNotice>
            ) : null}

            {row ? (
              <>
                {hasMainChainP0(row) ? (
                  <AdminNotice variant="p0">
                    P0: main-chain apply flag detected.
                  </AdminNotice>
                ) : null}
                {hasNonAllowlistP0(row) ? (
                  <AdminNotice variant="p0">
                    P0: non-allowlist row.
                  </AdminNotice>
                ) : null}

                <DetailGrid
                  items={[
                    ["viewerUserId", row.viewerUserId],
                    ["selectedCandidateId", row.selectedCandidateId],
                    ["sourcePipeline", row.sourcePipeline],
                    ["schemaVersion", row.schemaVersion],
                    ["sourceVersion", row.sourceVersion],
                    ["routeCArtifactPath", row.routeCArtifactPath ?? "—"],
                    [
                      "stage1SelectedCandidateIds",
                      formatIdArray(row.stage1SelectedCandidateIds),
                    ],
                    [
                      "stage2Top2CandidateIds",
                      formatIdArray(row.stage2Top2CandidateIds),
                    ],
                    [
                      "selectedBy20DOnlyCandidateId",
                      row.selectedBy20DOnlyCandidateId ?? "—",
                    ],
                    [
                      "selectedByRrmCandidateId",
                      row.selectedByRrmCandidateId ?? "—",
                    ],
                    [
                      "finalShadowSelectedCandidateId",
                      row.finalShadowSelectedCandidateId,
                    ],
                    ["pmSignoffStatus", row.pmSignoffStatus],
                    ["opsSignoffStatus", row.opsSignoffStatus],
                    ["appliedToPool", String(row.appliedToPool)],
                    ["appliedToMatchResult", String(row.appliedToMatchResult)],
                    ["appliedToFinalScore", String(row.appliedToFinalScore)],
                    ["appliedToDisplay", String(row.appliedToDisplay)],
                    [
                      "appliedToWorkerRanking",
                      String(row.appliedToWorkerRanking),
                    ],
                    ["rolledBack", String(row.rolledBack)],
                    ["rollbackReason", row.rollbackReason ?? "—"],
                    [
                      "auditNotes",
                      row.auditNotes != null
                        ? JSON.stringify(row.auditNotes)
                        : "—",
                    ],
                  ]}
                />

                <h3 className={adminSectionTitle}>Derived statuses</h3>
                <DetailGrid
                  items={[
                    ["sidecarStatus", labelSidecarStatus(row.sidecarStatus)],
                    [
                      "productApplyStatus",
                      labelProductApplyStatus(row.productApplyStatus),
                    ],
                    [
                      "mainChainApplyStatus",
                      labelMainChainApplyStatus(row.mainChainApplyStatus),
                    ],
                    [
                      "violationStatus",
                      <ViolationBadge
                        key="v"
                        status={
                          detail.violationStatus ?? row.violationStatus
                        }
                      />,
                    ],
                  ]}
                />

                {detail.stageSummary ? (
                  <>
                    <h3 className={adminSectionTitle}>Stage summary</h3>
                    <DetailGrid
                      items={[
                        ["stage1Count", detail.stageSummary.stage1Count],
                        ["stage2Count", detail.stageSummary.stage2Count],
                        [
                          "selectedBy20DOnlyCandidateId",
                          detail.stageSummary.selectedBy20DOnlyCandidateId ??
                            "—",
                        ],
                        [
                          "selectedByRrmCandidateId",
                          detail.stageSummary.selectedByRrmCandidateId ?? "—",
                        ],
                        [
                          "finalShadowSelectedCandidateId",
                          detail.stageSummary.finalShadowSelectedCandidateId,
                        ],
                      ]}
                    />
                  </>
                ) : null}
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
