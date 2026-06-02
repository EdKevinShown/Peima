import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getP76CanonicalRehearsalAggregate,
  getP76CanonicalRehearsalRow,
  listP76CanonicalRehearsalRows,
} from "../api/p76CanonicalRehearsalAdmin";
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
  appliedToMatchResultLabel,
  eligibleTone,
  labelProductApplyStatus,
  labelRehearsalStatus,
  labelViolationStatus,
  violationTone,
} from "../utils/p76CanonicalRehearsalLabels.mjs";

const SHADOW_BANNER =
  "SHADOW REHEARSAL ONLY — NOT APPLIED TO MATCHRESULT";
const SHADOW_BANNER_ZH =
  "这些记录只是 canonical writer rehearsal / shadow 证据，不会影响 MatchResult、FinalMatchPage、worker 或 GET /matching/result。";

const DEFAULT_FILTERS = {
  auditRunId: "",
  sourceVersion: "",
  readPathSourceVersion: "",
  environment: "",
  eligible: "",
  guardrailReason: "",
  wouldChangeCandidate: "",
  appliedToMatchResult: "",
  generatedAtFrom: "",
  generatedAtTo: "",
  matchResultId: "",
  viewerUserId: "",
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
    m.includes("peima_p76_rehearsal_admin_enabled") ||
    m.includes("rehearsal admin api is disabled")
  );
}

function isPermissionError(message) {
  const m = message || "";
  return m.includes("无权限") || m.includes("403");
}

function hasAppliedToMatchResultP0(row) {
  return row?.appliedToMatchResult === true;
}

function deriveSafetyFlags(detail) {
  const row = detail?.row;
  const derived = detail?.derived;
  return {
    isShadowOnly:
      derived?.rehearsalStatus === "shadow_only" ||
      row?.rehearsalStatus === "shadow_only",
    notAppliedToMatchResult:
      row?.appliedToMatchResult === false &&
      (derived?.productApplyStatus === "not_applied" ||
        row?.productApplyStatus === "not_applied"),
    readByGetPath: false,
    readByWorker: false,
  };
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

function eligibleToneClass(tone) {
  const key = tone === "blocked" ? "danger" : tone === "warning" ? "warning" : "ok";
  return adminBadgeToneClass[key] ?? adminBadgeToneClass.muted;
}

function EligibleBadge({ eligible, guardrailReason }) {
  const tone = eligibleTone(eligible, guardrailReason);
  const label = eligible ? "eligible" : "blocked";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[0.68rem] ${eligibleToneClass(tone)}`}
    >
      {label}
    </span>
  );
}

function AppliedToMatchResultBadge({ applied }) {
  const isP0 = applied === true;
  const tone = isP0 ? "p0" : "muted";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[0.68rem] ${adminBadgeToneClass[tone]} ${isP0 ? "font-semibold" : ""}`}
    >
      {appliedToMatchResultLabel(applied)}
    </span>
  );
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

  const p0Violation = aggregate.appliedToMatchResultViolationCount > 0;

  const items = [
    { key: "totalVisible", label: "totalVisible", value: aggregate.totalVisible },
    { key: "eligibleCount", label: "eligibleCount", value: aggregate.eligibleCount },
    { key: "blockedCount", label: "blockedCount", value: aggregate.blockedCount },
    {
      key: "wouldChangeCandidateCount",
      label: "wouldChangeCandidateCount",
      value: aggregate.wouldChangeCandidateCount,
    },
    {
      key: "appliedToMatchResultViolationCount",
      label: "appliedToMatchResultViolationCount",
      value: aggregate.appliedToMatchResultViolationCount,
      p0: p0Violation,
    },
  ];

  return (
    <>
      {p0Violation ? (
        <AdminNotice variant="p0">
          P0 alert: appliedToMatchResultViolationCount &gt; 0
        </AdminNotice>
      ) : null}
      <AdminKpiGrid items={items} />
    </>
  );
}

export default function P76CanonicalRehearsalPage() {
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
    setStr("sourceVersion");
    setStr("readPathSourceVersion");
    setStr("environment");
    setStr("guardrailReason");
    setStr("generatedAtFrom");
    setStr("generatedAtTo");
    setStr("viewerUserId");
    setStr("matchResultId");
    if (appliedFilters.eligible === "true") p.eligible = true;
    if (appliedFilters.eligible === "false") p.eligible = false;
    if (appliedFilters.wouldChangeCandidate === "true") {
      p.wouldChangeCandidate = true;
    }
    if (appliedFilters.wouldChangeCandidate === "false") {
      p.wouldChangeCandidate = false;
    }
    if (appliedFilters.appliedToMatchResult === "true") {
      p.appliedToMatchResult = true;
    }
    if (appliedFilters.appliedToMatchResult === "false") {
      p.appliedToMatchResult = false;
    }
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
        const listPromise = listP76CanonicalRehearsalRows({
          ...queryParams,
          cursor: cursor ?? undefined,
        });
        const aggPromise = getP76CanonicalRehearsalAggregate(queryParams);
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
      setDetail(await getP76CanonicalRehearsalRow(id));
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
    a.download = `p76-canonical-rehearsal-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const row = detail?.row;
  const safety = detail ? deriveSafetyFlags(detail) : null;
  const shadowGuardrails =
    detail?.shadow && typeof detail.shadow === "object"
      ? detail.shadow.guardrails
      : null;
  const shadowNotes =
    detail?.shadow && typeof detail.shadow === "object" && Array.isArray(detail.shadow.notes)
      ? detail.shadow.notes
      : null;

  const apiDisabled = isApiDisabledError(listError);
  const permissionDenied = isPermissionError(listError);

  return (
    <AdminPageShell
      title="P7.6 Canonical Writer Rehearsal Review"
      subtitle="Read-only review of canonical writer rehearsal rows (shadow compare). Rehearsal does not update MatchResult or matchInsights."
      maxWidth="max-w-[1400px]"
    >
      <AdminNotice variant="p0" sticky title={SHADOW_BANNER}>
        <div className="text-xs mt-1">{SHADOW_BANNER_ZH}</div>
      </AdminNotice>

      <AdminNotice variant="internal">
        <strong>内部 / Admin</strong> — 只读审阅；权限 VIEW_P76_CANONICAL_REHEARSAL。
        你需要 VIEW_P76_CANONICAL_REHEARSAL 权限才能查看 canonical rehearsal 只读记录。
        无 Apply / Promote / worker 操作。
        {" "}
        <Link to="/admin/p76/allowlist-apply-meta" className={adminLink}>
          Allowlist Apply Meta
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
            readPathSourceVersion
            <input
              type="text"
              value={filters.readPathSourceVersion}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  readPathSourceVersion: e.target.value,
                }))
              }
              className={`${adminInput} block mt-0.5 w-[200px]`}
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
            eligible
            <select
              value={filters.eligible}
              onChange={(e) =>
                setFilters((f) => ({ ...f, eligible: e.target.value }))
              }
              className={`${adminSelect} block mt-0.5`}
            >
              <option value="">any</option>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </label>
          <label className={adminLabel}>
            guardrailReason
            <input
              type="text"
              value={filters.guardrailReason}
              onChange={(e) =>
                setFilters((f) => ({ ...f, guardrailReason: e.target.value }))
              }
              className={`${adminInput} block mt-0.5 w-[140px]`}
            />
          </label>
          <label className={adminLabel}>
            wouldChangeCandidate
            <select
              value={filters.wouldChangeCandidate}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  wouldChangeCandidate: e.target.value,
                }))
              }
              className={`${adminSelect} block mt-0.5`}
            >
              <option value="">any</option>
              <option value="true">true</option>
              <option value="false">false</option>
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
              <option value="">any</option>
              <option value="false">false</option>
              <option value="true">true (P0)</option>
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
          Default: activeOnly=true · includeDeleted=false · limit=50 · generatedAt desc
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
              <code>PEIMA_P76_REHEARSAL_ADMIN_ENABLED=1</code> locally, then refresh.
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
                <th className={adminTh}>generatedAt</th>
                <th className={adminTh}>environment</th>
                <th className={adminTh}>auditRunId</th>
                <th className={adminTh}>sourceVersion</th>
                <th className={adminTh}>viewerUserId</th>
                <th className={adminTh}>matchResultId</th>
                <th className={adminTh}>baselineCandidateUserId</th>
                <th className={adminTh}>proposedCandidateUserId</th>
                <th className={adminTh}>wouldChangeCandidate</th>
                <th className={adminTh}>eligible</th>
                <th className={adminTh}>guardrailReason</th>
                <th className={adminTh}>scoreDeltaBand</th>
                <th className={adminTh}>appliedToMatchResult</th>
                <th className={adminTh}>rehearsalStatus</th>
                <th className={adminTh}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const p0 = hasAppliedToMatchResultP0(r);
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
                          : r.wouldChangeCandidate
                            ? "bg-amber-500/10"
                            : "hover:bg-white/5"
                    }`}
                  >
                    <td className={adminTd}>{formatDt(r.generatedAt)}</td>
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
                      {r.baselineCandidateUserId ? <UserIdWithName userId={r.baselineCandidateUserId} /> : "—"}
                    </td>
                    <td className={adminTd}>
                      {r.proposedCandidateUserId ? <UserIdWithName userId={r.proposedCandidateUserId} /> : "—"}
                    </td>
                    <td className={adminTd}>
                      {r.wouldChangeCandidate ? (
                        <span className="font-semibold text-amber-200">yes</span>
                      ) : (
                        "no"
                      )}
                    </td>
                    <td className={adminTd}>
                      <EligibleBadge
                        eligible={r.eligible}
                        guardrailReason={r.guardrailReason}
                      />
                    </td>
                    <td className={adminTd}>{r.guardrailReason ?? "—"}</td>
                    <td className={adminTd}>{r.scoreDeltaBand ?? "—"}</td>
                    <td className={adminTd}>
                      <AppliedToMatchResultBadge applied={r.appliedToMatchResult} />
                    </td>
                    <td className={adminTd}>{labelRehearsalStatus(r.rehearsalStatus)}</td>
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
            <AdminNotice variant="p0" title={SHADOW_BANNER}>
              {SHADOW_BANNER_ZH}
            </AdminNotice>

            <div className="flex justify-between items-center mb-3 gap-2">
              <h2 className="text-base font-semibold text-white m-0">Detail</h2>
              <div className="flex gap-1.5">
                {detailId ? (
                  <button
                    type="button"
                    className={adminBtnSecondary}
                    onClick={() => void copyText(detailId)}
                  >
                    Copy id
                  </button>
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
                {hasAppliedToMatchResultP0(row) ? (
                  <AdminNotice variant="p0">
                    P0: appliedToMatchResult is true — rehearsal must remain shadow-only.
                  </AdminNotice>
                ) : null}

                <h3 className={`${adminSectionTitle} mt-2`}>Safety flags</h3>
                <DetailGrid
                  items={[
                    ["isShadowOnly", safety?.isShadowOnly ? "true" : "false"],
                    [
                      "notAppliedToMatchResult",
                      safety?.notAppliedToMatchResult ? "true" : "false",
                    ],
                    ["readByGetPath", safety?.readByGetPath ? "true" : "false"],
                    ["readByWorker", safety?.readByWorker ? "true" : "false"],
                    [
                      "violationStatus",
                      <ViolationBadge
                        key="v"
                        status={detail.derived?.violationStatus ?? row.violationStatus}
                      />,
                    ],
                  ]}
                />

                <h3 className={adminSectionTitle}>Baseline vs proposal</h3>
                <DetailGrid
                  items={[
                    ["baselineCandidateUserId", row.baselineCandidateUserId ?? "—"],
                    ["proposedCandidateUserId", row.proposedCandidateUserId ?? "—"],
                    ["wouldChangeCandidate", String(row.wouldChangeCandidate)],
                    ["scoreDeltaBand", row.scoreDeltaBand ?? "—"],
                    [
                      "baselineFinalScore",
                      detail.shadow?.baselineFinalScore != null
                        ? String(detail.shadow.baselineFinalScore)
                        : "—",
                    ],
                    [
                      "proposedScore",
                      detail.shadow?.proposedScore != null
                        ? String(detail.shadow.proposedScore)
                        : "—",
                    ],
                  ]}
                />

                <h3 className={adminSectionTitle}>Guardrails</h3>
                <DetailGrid
                  items={[
                    ["eligible", String(row.eligible)],
                    ["guardrailReason", row.guardrailReason ?? "—"],
                    [
                      "shadow.guardrails",
                      shadowGuardrails != null
                        ? JSON.stringify(shadowGuardrails)
                        : "—",
                    ],
                    [
                      "shadow.notes",
                      shadowNotes?.length
                        ? shadowNotes.join(" · ")
                        : "—",
                    ],
                  ]}
                />

                <h3 className={adminSectionTitle}>Provenance</h3>
                <DetailGrid
                  items={[
                    ["id", row.id],
                    ["auditRunId", <CopyIdCell key="a" value={row.auditRunId} truncate={false} />],
                    ["sourceVersion", row.sourceVersion],
                    ["pipelineVersion", row.pipelineVersion],
                    ["readPathSourceVersion", row.readPathSourceVersion ?? "—"],
                    ["environment", row.environment],
                    ["rehearsalMode", row.rehearsalMode ?? "—"],
                    [
                      "rehearsalStatus",
                      labelRehearsalStatus(row.rehearsalStatus),
                    ],
                    [
                      "productApplyStatus",
                      labelProductApplyStatus(
                        detail.derived?.productApplyStatus ?? row.productApplyStatus,
                      ),
                    ],
                    [
                      "appliedToMatchResult",
                      <AppliedToMatchResultBadge
                        key="amr"
                        applied={row.appliedToMatchResult}
                      />,
                    ],
                    [
                      "allowlist sidecar",
                      detail.links?.allowlistApplyMetaAdminPath ? (
                        <Link
                          key="link"
                          to={detail.links.allowlistApplyMetaAdminPath}
                          className={adminLink}
                        >
                          {detail.links.allowlistApplyMetaId}
                        </Link>
                      ) : (
                        "—"
                      ),
                    ],
                    ["generatedAt", formatDt(row.generatedAt)],
                    ["supersededAt", formatDt(row.supersededAt)],
                    ["deletedAt", formatDt(row.deletedAt)],
                  ]}
                />

                <h3 className={adminSectionTitle}>summary JSON preview</h3>
                <AdminJsonBlock value={jsonPreview(detail.summary)} />

                <h3 className={adminSectionTitle}>shadow JSON preview</h3>
                <AdminJsonBlock value={jsonPreview(detail.shadow)} maxHeightClass="max-h-80" />
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
