import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getP76AllowlistApplyMetaAggregate,
  getP76AllowlistApplyMetaDetail,
  listP76AllowlistApplyMeta,
} from "../api/p76AdminAllowlistApplyMeta";
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

const th = {
  textAlign: "left",
  borderBottom: "1px solid #e2e8f0",
  padding: "0.35rem 0.4rem",
  whiteSpace: "nowrap",
  fontSize: "0.72rem",
};
const td = {
  padding: "0.35rem 0.4rem",
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "top",
  fontSize: "0.72rem",
};
const btnSecondary = {
  padding: "0.3rem 0.55rem",
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#334155",
  fontSize: "0.75rem",
  cursor: "pointer",
};

function ViolationBadge({ status }) {
  const tone = violationTone(status);
  const bg =
    tone === "p0" ? "#fef2f2" : tone === "warning" ? "#fffbeb" : "#f8fafc";
  const color =
    tone === "p0" ? "#b91c1c" : tone === "warning" ? "#b45309" : "#475569";
  const border =
    tone === "p0" ? "#fecaca" : tone === "warning" ? "#fde68a" : "#e2e8f0";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.1rem 0.35rem",
        borderRadius: 4,
        fontSize: "0.68rem",
        background: bg,
        color,
        border: `1px solid ${border}`,
      }}
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

  const cards = [
    { label: "Total sidecar rows", value: aggregate.totalSidecarRows },
    { label: "Written rows", value: aggregate.writtenRows },
    { label: "Dry-run rows", value: aggregate.dryRunRows },
    {
      label: "Rolled back rows",
      value: aggregate.rolledBackRows,
      warn: rolledBackWarn,
    },
    {
      label: "Violation count",
      value: aggregate.violationCount,
      alert: violationAlert,
    },
    {
      label: "Main-chain violation count",
      value: aggregate.mainChainViolationCount,
      p0: mainChainP0,
    },
    {
      label: "appliedToMatchResult=true",
      value: aggregate.appliedToMatchResultTrueCount,
    },
    {
      label: "appliedToFinalScore=true",
      value: aggregate.appliedToFinalScoreTrueCount,
    },
    {
      label: "appliedToWorkerRanking=true",
      value: aggregate.appliedToWorkerRankingTrueCount,
    },
    {
      label: "appliedToDisplay=true",
      value: aggregate.appliedToDisplayTrueCount,
    },
  ];

  return (
    <section style={{ marginBottom: "0.85rem" }}>
      {mainChainP0 ? (
        <p
          role="alert"
          style={{
            margin: "0 0 0.5rem",
            padding: "0.45rem 0.65rem",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 6,
            color: "#b91c1c",
            fontSize: "0.82rem",
            fontWeight: 600,
          }}
        >
          P0 warning: main-chain violation count &gt; 0
        </p>
      ) : null}
      {rolledBackWarn && !mainChainP0 ? (
        <p
          style={{
            margin: "0 0 0.5rem",
            padding: "0.45rem 0.65rem",
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: 6,
            color: "#b45309",
            fontSize: "0.82rem",
          }}
        >
          Warning: rolled-back rows present (not P0)
        </p>
      ) : null}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: "0.45rem",
        }}
      >
        {cards.map((c) => (
          <div
            key={c.label}
            style={{
              border: `1px solid ${c.alert || c.p0 ? "#fecaca" : c.warn ? "#fde68a" : "#e2e8f0"}`,
              borderRadius: 8,
              padding: "0.45rem 0.55rem",
              background:
                c.alert || c.p0 ? "#fef2f2" : c.warn ? "#fffbeb" : "#fff",
            }}
          >
            <div
              style={{
                fontSize: "0.65rem",
                color: "#64748b",
                marginBottom: "0.15rem",
              }}
            >
              {c.label}
            </div>
            <div
              style={{
                fontSize: "1.1rem",
                fontWeight: 600,
                color: c.alert || c.p0 ? "#b91c1c" : "#0f172a",
              }}
            >
              {c.value}
            </div>
          </div>
        ))}
      </div>
    </section>
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
    <main
      style={{
        maxWidth: 1400,
        margin: "1.1rem auto",
        padding: "0 1rem",
        color: "#334155",
      }}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "#eff6ff",
          border: "1px solid #93c5fd",
          borderRadius: 8,
          padding: "0.5rem 0.75rem",
          marginBottom: "0.85rem",
          fontSize: "0.8rem",
          color: "#1e3a8a",
        }}
      >
        <strong>Audit only.</strong> {AUDIT_BANNER}
      </div>

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
        <strong>内部 / Admin</strong> — P76 Allowlist Apply Meta（只读）；
        权限 VIEW_P76_ALLOWLIST_APPLY_META。
        {" "}
        <Link to="/" style={{ color: "#b45309" }}>
          返回首页
        </Link>
        {" · "}
        <Link to="/admin/photo-review" style={{ color: "#b45309" }}>
          照片审核
        </Link>
      </div>

      <h1 style={{ margin: "0 0 0.45rem", fontSize: "1.25rem", color: "#0f172a" }}>
        P76 Allowlist Apply Meta
      </h1>
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.82rem", color: "#64748b" }}>
        查询 sidecar 审计元数据。Sidecar written ≠ product-applied；不写 sidecar、不 rollback。
      </p>

      <AggregateCards aggregate={aggregate} loading={aggLoading} />

      <section
        style={{
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          background: "#f8fafc",
          padding: "0.65rem 0.75rem",
          marginBottom: "0.75rem",
        }}
      >
        <h2 style={{ margin: "0 0 0.5rem", fontSize: "0.9rem" }}>Filters</h2>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.5rem 0.75rem",
            alignItems: "flex-end",
            fontSize: "0.78rem",
          }}
        >
          <label>
            viewerUserId
            <input
              type="text"
              value={filters.viewerUserId}
              onChange={(e) =>
                setFilters((f) => ({ ...f, viewerUserId: e.target.value }))
              }
              style={{ display: "block", marginTop: 2, padding: "0.25rem", width: 200 }}
            />
          </label>
          <label>
            applied
            <select
              value={filters.applied}
              onChange={(e) =>
                setFilters((f) => ({ ...f, applied: e.target.value }))
              }
              style={{ display: "block", marginTop: 2 }}
            >
              <option value="">any</option>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </label>
          <label>
            rolledBack
            <select
              value={filters.rolledBack}
              onChange={(e) =>
                setFilters((f) => ({ ...f, rolledBack: e.target.value }))
              }
              style={{ display: "block", marginTop: 2 }}
            >
              <option value="">any</option>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </label>
          <label>
            sourceVersion
            <input
              type="text"
              value={filters.sourceVersion}
              onChange={(e) =>
                setFilters((f) => ({ ...f, sourceVersion: e.target.value }))
              }
              style={{ display: "block", marginTop: 2, padding: "0.25rem", width: 220 }}
            />
          </label>
          <label>
            limit
            <input
              type="number"
              min={1}
              max={100}
              value={filters.limit}
              onChange={(e) =>
                setFilters((f) => ({ ...f, limit: e.target.value }))
              }
              style={{ display: "block", marginTop: 2, padding: "0.25rem", width: 72 }}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
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
            style={btnSecondary}
            disabled={listLoading}
            onClick={() => setAppliedFilters({ ...filters })}
          >
            Query
          </button>
          <button
            type="button"
            style={btnSecondary}
            disabled={listLoading}
            onClick={() => {
              setFilters({ ...DEFAULT_FILTERS });
              setAppliedFilters({ ...DEFAULT_FILTERS });
            }}
          >
            Reset
          </button>
        </div>
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.72rem", color: "#94a3b8" }}>
          Default: limit=50 · createdAt desc
        </p>
      </section>

      {listLoading && rows.length === 0 ? (
        <LoadingState label="加载列表…" />
      ) : null}
      {listError ? (
        <p style={{ color: "#b91c1c", fontSize: "0.85rem" }} role="alert">
          {listError}
        </p>
      ) : null}

      {!listError ? (
        <section style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>viewerUserId</th>
                <th style={th}>selectedCandidateId</th>
                <th style={th}>sidecarStatus</th>
                <th style={th}>productApplyStatus</th>
                <th style={th}>mainChainApplyStatus</th>
                <th style={th}>violationStatus</th>
                <th style={th}>pmSignoff</th>
                <th style={th}>opsSignoff</th>
                <th style={th}>allowlist</th>
                <th style={th}>dryRun</th>
                <th style={th}>rolledBack</th>
                <th style={th}>sourceVersion</th>
                <th style={th}>createdAt</th>
                <th style={th}>updatedAt</th>
                <th style={th}>action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  style={
                    hasMainChainP0(r) || hasNonAllowlistP0(r)
                      ? { background: "#fef2f2" }
                      : r.rolledBack
                        ? { background: "#fffbeb" }
                        : undefined
                  }
                >
                  <td style={td}>
                    <UserIdWithName userId={r.viewerUserId} />
                  </td>
                  <td style={td}>
                    <UserIdWithName userId={r.selectedCandidateId} />
                  </td>
                  <td style={td}>{labelSidecarStatus(r.sidecarStatus)}</td>
                  <td style={td}>
                    {labelProductApplyStatus(r.productApplyStatus)}
                  </td>
                  <td style={td}>
                    {labelMainChainApplyStatus(r.mainChainApplyStatus)}
                  </td>
                  <td style={td}>
                    <ViolationBadge status={r.violationStatus} />
                  </td>
                  <td style={td}>{r.pmSignoffStatus}</td>
                  <td style={td}>{r.opsSignoffStatus}</td>
                  <td style={td}>
                    {r.allowlistMatched ? "yes" : (
                      <span style={{ color: "#b91c1c", fontWeight: 600 }}>no (P0)</span>
                    )}
                  </td>
                  <td style={td}>{r.dryRun ? "yes" : "no"}</td>
                  <td style={td}>{r.rolledBack ? "yes" : "no"}</td>
                  <td style={td}>{r.sourceVersion}</td>
                  <td style={td}>{formatDt(r.createdAt)}</td>
                  <td style={td}>{formatDt(r.updatedAt)}</td>
                  <td style={td}>
                    <button
                      type="button"
                      style={btnSecondary}
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
            <p style={{ fontSize: "0.82rem", color: "#64748b", marginTop: "0.5rem" }}>
              无记录。
            </p>
          ) : null}
          {nextCursor ? (
            <button
              type="button"
              style={{ ...btnSecondary, marginTop: "0.5rem" }}
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
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.45)",
            zIndex: 50,
            display: "flex",
            justifyContent: "flex-end",
          }}
          onClick={closeDetail}
        >
          <div
            style={{
              width: "min(520px, 100%)",
              height: "100%",
              background: "#fff",
              overflowY: "auto",
              padding: "1rem",
              boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                background: "#eff6ff",
                border: "1px solid #93c5fd",
                borderRadius: 6,
                padding: "0.45rem 0.6rem",
                fontSize: "0.75rem",
                color: "#1e3a8a",
                marginBottom: "0.65rem",
              }}
            >
              {AUDIT_BANNER}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.5rem",
              }}
            >
              <h2 style={{ margin: 0, fontSize: "1rem" }}>Detail</h2>
              <button type="button" style={btnSecondary} onClick={closeDetail}>
                Close
              </button>
            </div>

            {detailLoading ? <LoadingState label="加载详情…" /> : null}
            {detailError ? (
              <p style={{ color: "#b91c1c" }} role="alert">
                {detailError}
              </p>
            ) : null}

            {row ? (
              <>
                {hasMainChainP0(row) ? (
                  <p
                    role="alert"
                    style={{
                      background: "#fef2f2",
                      border: "1px solid #fecaca",
                      padding: "0.45rem",
                      borderRadius: 6,
                      color: "#b91c1c",
                      fontWeight: 600,
                      fontSize: "0.82rem",
                    }}
                  >
                    P0: main-chain apply flag detected.
                  </p>
                ) : null}
                {hasNonAllowlistP0(row) ? (
                  <p
                    role="alert"
                    style={{
                      background: "#fef2f2",
                      border: "1px solid #fecaca",
                      padding: "0.45rem",
                      borderRadius: 6,
                      color: "#b91c1c",
                      fontWeight: 600,
                      fontSize: "0.82rem",
                      marginTop: "0.35rem",
                    }}
                  >
                    P0: non-allowlist row.
                  </p>
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

                <h3 style={{ fontSize: "0.85rem", marginTop: "0.75rem" }}>
                  Derived statuses
                </h3>
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
                    <h3 style={{ fontSize: "0.85rem", marginTop: "0.75rem" }}>
                      Stage summary
                    </h3>
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
    </main>
  );
}

function DetailGrid({ items }) {
  return (
    <dl
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(140px, 38%) 1fr",
        gap: "0.25rem 0.5rem",
        fontSize: "0.78rem",
        margin: 0,
      }}
    >
      {items.map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <dt style={{ margin: 0, color: "#64748b" }}>{k}</dt>
          <dd style={{ margin: 0, wordBreak: "break-all" }}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
