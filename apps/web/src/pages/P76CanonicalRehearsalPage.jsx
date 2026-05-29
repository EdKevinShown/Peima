import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getP76CanonicalRehearsalAggregate,
  getP76CanonicalRehearsalRow,
  listP76CanonicalRehearsalRows,
} from "../api/p76CanonicalRehearsalAdmin";
import LoadingState from "../components/common/LoadingState";
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

function EligibleBadge({ eligible, guardrailReason }) {
  const tone = eligibleTone(eligible, guardrailReason);
  const bg =
    tone === "blocked"
      ? "#fef2f2"
      : tone === "warning"
        ? "#fffbeb"
        : "#f0fdf4";
  const color =
    tone === "blocked"
      ? "#b91c1c"
      : tone === "warning"
        ? "#b45309"
        : "#15803d";
  const border =
    tone === "blocked"
      ? "#fecaca"
      : tone === "warning"
        ? "#fde68a"
        : "#bbf7d0";
  const label = eligible ? "eligible" : "blocked";
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
      {label}
    </span>
  );
}

function AppliedToMatchResultBadge({ applied }) {
  const isP0 = applied === true;
  const tone = isP0 ? "p0" : "ok";
  const bg = tone === "p0" ? "#fef2f2" : "#f8fafc";
  const color = tone === "p0" ? "#b91c1c" : "#475569";
  const border = tone === "p0" ? "#fecaca" : "#e2e8f0";
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
        fontWeight: isP0 ? 600 : 400,
      }}
    >
      {appliedToMatchResultLabel(applied)}
    </span>
  );
}

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

function CopyIdCell({ value, truncate = true }) {
  if (!value) return <span>—</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span title={value}>{truncate ? truncateId(value) : value}</span>
      <button
        type="button"
        style={{ ...btnSecondary, padding: "0.1rem 0.35rem", fontSize: "0.65rem" }}
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

  const cards = [
    { label: "totalVisible", value: aggregate.totalVisible },
    { label: "eligibleCount", value: aggregate.eligibleCount },
    { label: "blockedCount", value: aggregate.blockedCount },
    {
      label: "wouldChangeCandidateCount",
      value: aggregate.wouldChangeCandidateCount,
    },
    {
      label: "appliedToMatchResultViolationCount",
      value: aggregate.appliedToMatchResultViolationCount,
      p0: p0Violation,
    },
  ];

  return (
    <section style={{ marginBottom: "0.85rem" }}>
      {p0Violation ? (
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
          P0 alert: appliedToMatchResultViolationCount &gt; 0
        </p>
      ) : null}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: "0.45rem",
        }}
      >
        {cards.map((c) => (
          <div
            key={c.label}
            style={{
              border: `1px solid ${c.p0 ? "#fecaca" : "#e2e8f0"}`,
              borderRadius: 8,
              padding: "0.45rem 0.55rem",
              background: c.p0 ? "#fef2f2" : "#fff",
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
                color: c.p0 ? "#b91c1c" : "#0f172a",
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
          background: "#fef2f2",
          border: "1px solid #fecaca",
          borderRadius: 8,
          padding: "0.5rem 0.75rem",
          marginBottom: "0.85rem",
          fontSize: "0.8rem",
          color: "#991b1b",
        }}
      >
        <strong>{SHADOW_BANNER}</strong>
        <div style={{ marginTop: "0.25rem", fontSize: "0.78rem" }}>
          {SHADOW_BANNER_ZH}
        </div>
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
        <strong>内部 / Admin</strong> — 只读审阅；权限 VIEW_P76_CANONICAL_REHEARSAL。
        你需要 VIEW_P76_CANONICAL_REHEARSAL 权限才能查看 canonical rehearsal 只读记录。
        无 Apply / Promote / worker 操作。
        {" "}
        <Link to="/admin/p76/allowlist-apply-meta" style={{ color: "#b45309" }}>
          Allowlist Apply Meta
        </Link>
        {" · "}
        <Link to="/" style={{ color: "#b45309" }}>
          返回首页
        </Link>
      </div>

      <h1 style={{ margin: "0 0 0.45rem", fontSize: "1.25rem", color: "#0f172a" }}>
        P7.6 Canonical Writer Rehearsal Review
      </h1>
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.82rem", color: "#64748b" }}>
        Read-only review of canonical writer rehearsal rows (shadow compare). Rehearsal
        does not update MatchResult or matchInsights.
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
            auditRunId
            <input
              type="text"
              value={filters.auditRunId}
              onChange={(e) =>
                setFilters((f) => ({ ...f, auditRunId: e.target.value }))
              }
              style={{ display: "block", marginTop: 2, padding: "0.25rem", width: 180 }}
            />
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
              style={{ display: "block", marginTop: 2, padding: "0.25rem", width: 200 }}
            />
          </label>
          <label>
            environment
            <select
              value={filters.environment}
              onChange={(e) =>
                setFilters((f) => ({ ...f, environment: e.target.value }))
              }
              style={{ display: "block", marginTop: 2 }}
            >
              <option value="">any</option>
              <option value="dev">dev</option>
              <option value="staging">staging</option>
            </select>
          </label>
          <label>
            eligible
            <select
              value={filters.eligible}
              onChange={(e) =>
                setFilters((f) => ({ ...f, eligible: e.target.value }))
              }
              style={{ display: "block", marginTop: 2 }}
            >
              <option value="">any</option>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </label>
          <label>
            guardrailReason
            <input
              type="text"
              value={filters.guardrailReason}
              onChange={(e) =>
                setFilters((f) => ({ ...f, guardrailReason: e.target.value }))
              }
              style={{ display: "block", marginTop: 2, padding: "0.25rem", width: 140 }}
            />
          </label>
          <label>
            wouldChangeCandidate
            <select
              value={filters.wouldChangeCandidate}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  wouldChangeCandidate: e.target.value,
                }))
              }
              style={{ display: "block", marginTop: 2 }}
            >
              <option value="">any</option>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </label>
          <label>
            appliedToMatchResult
            <select
              value={filters.appliedToMatchResult}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  appliedToMatchResult: e.target.value,
                }))
              }
              style={{ display: "block", marginTop: 2 }}
            >
              <option value="">any</option>
              <option value="false">false</option>
              <option value="true">true (P0)</option>
            </select>
          </label>
          <label>
            viewerUserId
            <input
              type="text"
              value={filters.viewerUserId}
              onChange={(e) =>
                setFilters((f) => ({ ...f, viewerUserId: e.target.value }))
              }
              style={{ display: "block", marginTop: 2, padding: "0.25rem", width: 160 }}
            />
          </label>
          <label>
            matchResultId
            <input
              type="text"
              value={filters.matchResultId}
              onChange={(e) =>
                setFilters((f) => ({ ...f, matchResultId: e.target.value }))
              }
              style={{ display: "block", marginTop: 2, padding: "0.25rem", width: 160 }}
            />
          </label>
          <label>
            generatedAtFrom
            <input
              type="datetime-local"
              value={filters.generatedAtFrom}
              onChange={(e) =>
                setFilters((f) => ({ ...f, generatedAtFrom: e.target.value }))
              }
              style={{ display: "block", marginTop: 2, padding: "0.25rem" }}
            />
          </label>
          <label>
            generatedAtTo
            <input
              type="datetime-local"
              value={filters.generatedAtTo}
              onChange={(e) =>
                setFilters((f) => ({ ...f, generatedAtTo: e.target.value }))
              }
              style={{ display: "block", marginTop: 2, padding: "0.25rem" }}
            />
          </label>
          <label>
            activeOnly
            <select
              value={filters.activeOnly}
              onChange={(e) =>
                setFilters((f) => ({ ...f, activeOnly: e.target.value }))
              }
              style={{ display: "block", marginTop: 2 }}
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </label>
          <label>
            includeDeleted
            <select
              value={filters.includeDeleted}
              onChange={(e) =>
                setFilters((f) => ({ ...f, includeDeleted: e.target.value }))
              }
              style={{ display: "block", marginTop: 2 }}
            >
              <option value="false">false</option>
              <option value="true">true</option>
            </select>
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
          <button
            type="button"
            style={btnSecondary}
            disabled={listLoading}
            onClick={() => void fetchData({ append: false })}
          >
            Refresh
          </button>
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
          <button
            type="button"
            style={btnSecondary}
            disabled={items.length === 0}
            onClick={exportVisibleJson}
          >
            Export visible JSON
          </button>
        </div>
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.72rem", color: "#94a3b8" }}>
          Default: activeOnly=true · includeDeleted=false · limit=50 · generatedAt desc
        </p>
      </section>

      {listLoading && items.length === 0 ? (
        <LoadingState label="加载列表…" />
      ) : null}

      {listError ? (
        <div
          role="alert"
          style={{
            padding: "0.65rem 0.75rem",
            borderRadius: 8,
            marginBottom: "0.75rem",
            fontSize: "0.85rem",
            background: apiDisabled ? "#f8fafc" : permissionDenied ? "#fffbeb" : "#fef2f2",
            border: `1px solid ${apiDisabled ? "#cbd5e1" : permissionDenied ? "#fde68a" : "#fecaca"}`,
            color: apiDisabled ? "#475569" : permissionDenied ? "#b45309" : "#b91c1c",
          }}
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
        </div>
      ) : null}

      {!listError || items.length > 0 ? (
        <section style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>generatedAt</th>
                <th style={th}>environment</th>
                <th style={th}>auditRunId</th>
                <th style={th}>sourceVersion</th>
                <th style={th}>viewerUserId</th>
                <th style={th}>matchResultId</th>
                <th style={th}>baselineCandidateUserId</th>
                <th style={th}>proposedCandidateUserId</th>
                <th style={th}>wouldChangeCandidate</th>
                <th style={th}>eligible</th>
                <th style={th}>guardrailReason</th>
                <th style={th}>scoreDeltaBand</th>
                <th style={th}>appliedToMatchResult</th>
                <th style={th}>rehearsalStatus</th>
                <th style={th}>Detail</th>
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
                    style={{
                      cursor: "pointer",
                      background: p0
                        ? "#fef2f2"
                        : superseded
                          ? "#f1f5f9"
                          : r.wouldChangeCandidate
                            ? "#fffbeb"
                            : undefined,
                    }}
                  >
                    <td style={td}>{formatDt(r.generatedAt)}</td>
                    <td style={td}>{r.environment ?? "—"}</td>
                    <td style={td}>
                      <CopyIdCell value={r.auditRunId} />
                    </td>
                    <td style={td}>{r.sourceVersion ?? "—"}</td>
                    <td style={td}>{r.viewerUserId ?? "—"}</td>
                    <td style={td}>{r.matchResultId ?? "—"}</td>
                    <td style={td}>{r.baselineCandidateUserId ?? "—"}</td>
                    <td style={td}>{r.proposedCandidateUserId ?? "—"}</td>
                    <td style={td}>
                      {r.wouldChangeCandidate ? (
                        <span style={{ fontWeight: 600, color: "#b45309" }}>yes</span>
                      ) : (
                        "no"
                      )}
                    </td>
                    <td style={td}>
                      <EligibleBadge
                        eligible={r.eligible}
                        guardrailReason={r.guardrailReason}
                      />
                    </td>
                    <td style={td}>{r.guardrailReason ?? "—"}</td>
                    <td style={td}>{r.scoreDeltaBand ?? "—"}</td>
                    <td style={td}>
                      <AppliedToMatchResultBadge applied={r.appliedToMatchResult} />
                    </td>
                    <td style={td}>{labelRehearsalStatus(r.rehearsalStatus)}</td>
                    <td style={td}>
                      <button
                        type="button"
                        style={btnSecondary}
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
            <p style={{ fontSize: "0.82rem", color: "#64748b", marginTop: "0.5rem" }}>
              无记录。
            </p>
          ) : null}
          {items.length === 0 && !listLoading && listError && !apiDisabled ? (
            <p style={{ fontSize: "0.82rem", color: "#64748b", marginTop: "0.5rem" }}>
              无记录（请调整筛选条件）。
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
              width: "min(560px, 100%)",
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
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 6,
                padding: "0.45rem 0.6rem",
                fontSize: "0.75rem",
                color: "#991b1b",
                marginBottom: "0.65rem",
              }}
            >
              <strong>{SHADOW_BANNER}</strong>
              <div style={{ marginTop: "0.2rem" }}>{SHADOW_BANNER_ZH}</div>
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
              <div style={{ display: "flex", gap: "0.35rem" }}>
                {detailId ? (
                  <button
                    type="button"
                    style={btnSecondary}
                    onClick={() => void copyText(detailId)}
                  >
                    Copy id
                  </button>
                ) : null}
                <button type="button" style={btnSecondary} onClick={closeDetail}>
                  Close
                </button>
              </div>
            </div>

            {detailLoading ? <LoadingState label="加载详情…" /> : null}
            {detailError ? (
              <p style={{ color: "#b91c1c" }} role="alert">
                {detailError}
              </p>
            ) : null}

            {row ? (
              <>
                {hasAppliedToMatchResultP0(row) ? (
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
                    P0: appliedToMatchResult is true — rehearsal must remain shadow-only.
                  </p>
                ) : null}

                <h3 style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>
                  Safety flags
                </h3>
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

                <h3 style={{ fontSize: "0.85rem", marginTop: "0.75rem" }}>
                  Baseline vs proposal
                </h3>
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

                <h3 style={{ fontSize: "0.85rem", marginTop: "0.75rem" }}>Guardrails</h3>
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

                <h3 style={{ fontSize: "0.85rem", marginTop: "0.75rem" }}>Provenance</h3>
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
                          style={{ color: "#2563eb" }}
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

                <h3 style={{ fontSize: "0.85rem", marginTop: "0.75rem" }}>
                  summary JSON preview
                </h3>
                <pre
                  style={{
                    margin: 0,
                    padding: "0.5rem",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: 6,
                    fontSize: "0.7rem",
                    maxHeight: 240,
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                  }}
                >
                  {jsonPreview(detail.summary)}
                </pre>

                <h3 style={{ fontSize: "0.85rem", marginTop: "0.75rem" }}>
                  shadow JSON preview
                </h3>
                <pre
                  style={{
                    margin: 0,
                    padding: "0.5rem",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: 6,
                    fontSize: "0.7rem",
                    maxHeight: 320,
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                  }}
                >
                  {jsonPreview(detail.shadow)}
                </pre>
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
