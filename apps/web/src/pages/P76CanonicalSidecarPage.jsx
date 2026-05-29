import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getP76CanonicalSidecarAggregate,
  getP76CanonicalSidecarDetail,
  listP76CanonicalSidecarAdmin,
} from "../api/p76CanonicalSidecarAdmin";
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
const jsonPreStyle = {
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

function badgeStyle(tone) {
  const map = {
    p0: { bg: "#fef2f2", color: "#b91c1c", border: "#fecaca" },
    warning: { bg: "#fffbeb", color: "#b45309", border: "#fde68a" },
    ok: { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
    muted: { bg: "#f1f5f9", color: "#64748b", border: "#e2e8f0" },
    neutral: { bg: "#f8fafc", color: "#475569", border: "#e2e8f0" },
  };
  return map[tone] ?? map.neutral;
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
  const s = badgeStyle(tone);
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.1rem 0.35rem",
        borderRadius: 4,
        fontSize: "0.68rem",
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        fontWeight: tone === "p0" ? 600 : 400,
      }}
    >
      {getCanonicalSidecarAppliedFlagLabel(value, context, promotionStatus)}
    </span>
  );
}

function SafetyBadge({ item }) {
  const label = getCanonicalSidecarSafetyLabel(item);
  const tone = safetyBadgeTone(item);
  const s = badgeStyle(tone);
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.1rem 0.35rem",
        borderRadius: 4,
        fontSize: "0.68rem",
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        fontWeight: tone === "p0" ? 600 : 400,
      }}
    >
      {label}
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

  const p0Violation = hasCanonicalSidecarP0Violation(aggregate);

  const cards = [
    { label: "totalVisible", value: aggregate.totalVisible },
    { label: "sidecarOnlyCount", value: aggregate.sidecarOnlyCount },
    { label: "promotedCount", value: aggregate.promotedCount },
    { label: "blockedCount", value: aggregate.blockedCount },
    { label: "rolledBackCount", value: aggregate.rolledBackCount },
    {
      label: "appliedToMatchResultViolationCount",
      value: aggregate.appliedToMatchResultViolationCount,
      p0: aggregate.appliedToMatchResultViolationCount > 0,
    },
    {
      label: "appliedToFinalScoreViolationCount",
      value: aggregate.appliedToFinalScoreViolationCount,
      p0: aggregate.appliedToFinalScoreViolationCount > 0,
    },
    {
      label: "appliedToWorkerRankingViolationCount",
      value: aggregate.appliedToWorkerRankingViolationCount,
      p0: aggregate.appliedToWorkerRankingViolationCount > 0,
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
          P0 alert: one or more applied* violation counts &gt; 0
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
        <strong>{SIDECAR_BANNER}</strong>
        <div style={{ marginTop: "0.25rem", fontSize: "0.78rem" }}>
          {SIDECAR_BANNER_ZH}
        </div>
        <ul
          style={{
            margin: "0.35rem 0 0",
            paddingLeft: "1.1rem",
            fontSize: "0.72rem",
            color: "#7f1d1d",
          }}
        >
          <li>No Apply</li>
          <li>No MatchResult write</li>
          <li>No worker / GET read</li>
          <li>No production rollout</li>
        </ul>
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
        你需要 VIEW_P76_CANONICAL_REHEARSAL 权限才能查看 canonical sidecar 只读记录。
        No Apply · No MatchResult write · No worker / GET read · No production rollout。
        {" "}
        <Link to="/admin/p76/canonical-rehearsal" style={{ color: "#b45309" }}>
          Canonical Rehearsal
        </Link>
        {" · "}
        <Link to="/" style={{ color: "#b45309" }}>
          返回首页
        </Link>
      </div>

      <h1 style={{ margin: "0 0 0.45rem", fontSize: "1.25rem", color: "#0f172a" }}>
        P7.6 Canonical Sidecar Review
      </h1>
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.82rem", color: "#64748b" }}>
        Read-only review of p76_canonical_match_result_meta. Not applied to MatchResult.
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
            selectedCandidateId
            <input
              type="text"
              value={filters.selectedCandidateId}
              onChange={(e) =>
                setFilters((f) => ({ ...f, selectedCandidateId: e.target.value }))
              }
              style={{ display: "block", marginTop: 2, padding: "0.25rem", width: 160 }}
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
            mode
            <select
              value={filters.mode}
              onChange={(e) => setFilters((f) => ({ ...f, mode: e.target.value }))}
              style={{ display: "block", marginTop: 2 }}
            >
              <option value="">any</option>
              <option value="dry_run">dry_run</option>
              <option value="sidecar">sidecar</option>
              <option value="promoted">promoted</option>
            </select>
          </label>
          <label>
            promotionStatus
            <select
              value={filters.promotionStatus}
              onChange={(e) =>
                setFilters((f) => ({ ...f, promotionStatus: e.target.value }))
              }
              style={{ display: "block", marginTop: 2 }}
            >
              <option value="">any</option>
              <option value="not_promoted">not_promoted</option>
              <option value="promoted">promoted</option>
              <option value="rolled_back">rolled_back</option>
              <option value="blocked">blocked</option>
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
              <option value="false">false</option>
              <option value="true">true (P0)</option>
              <option value="">any</option>
            </select>
          </label>
          <label>
            appliedToFinalScore
            <select
              value={filters.appliedToFinalScore}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  appliedToFinalScore: e.target.value,
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
            appliedToWorkerRanking
            <select
              value={filters.appliedToWorkerRanking}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  appliedToWorkerRanking: e.target.value,
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
            rolledBack
            <select
              value={filters.rolledBack}
              onChange={(e) =>
                setFilters((f) => ({ ...f, rolledBack: e.target.value }))
              }
              style={{ display: "block", marginTop: 2 }}
            >
              <option value="">any</option>
              <option value="false">false</option>
              <option value="true">true</option>
            </select>
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
          Default: activeOnly=true · includeDeleted=false · appliedToMatchResult=false ·
          limit=50 · createdAt desc
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
        </div>
      ) : null}

      {!listError || items.length > 0 ? (
        <section style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>createdAt</th>
                <th style={th}>environment</th>
                <th style={th}>auditRunId</th>
                <th style={th}>sourceVersion</th>
                <th style={th}>viewerUserId</th>
                <th style={th}>matchResultId</th>
                <th style={th}>selectedCandidateId</th>
                <th style={th}>score</th>
                <th style={th}>mode</th>
                <th style={th}>promotionStatus</th>
                <th style={th}>appliedToMatchResult</th>
                <th style={th}>appliedToFinalScore</th>
                <th style={th}>appliedToWorkerRanking</th>
                <th style={th}>rolledBack</th>
                <th style={th}>safety</th>
                <th style={th}>Detail</th>
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
                    style={{
                      cursor: "pointer",
                      background: p0
                        ? "#fef2f2"
                        : superseded
                          ? "#f1f5f9"
                          : undefined,
                    }}
                  >
                    <td style={td}>{formatDt(r.createdAt)}</td>
                    <td style={td}>{r.environment ?? "—"}</td>
                    <td style={td}>
                      <CopyIdCell value={r.auditRunId} />
                    </td>
                    <td style={td}>{r.sourceVersion ?? "—"}</td>
                    <td style={td}>
                      {r.viewerUserId ? <UserIdWithName userId={r.viewerUserId} /> : "—"}
                    </td>
                    <td style={td}>{r.matchResultId ?? "—"}</td>
                    <td style={td}>
                      {r.selectedCandidateId ? <UserIdWithName userId={r.selectedCandidateId} /> : "—"}
                    </td>
                    <td style={td}>{r.score != null ? String(r.score) : "—"}</td>
                    <td style={td}>{getCanonicalSidecarModeLabel(r.mode)}</td>
                    <td style={td}>
                      {getCanonicalSidecarPromotionStatusLabel(r.promotionStatus)}
                    </td>
                    <td style={td}>
                      <AppliedFlagBadge
                        value={r.appliedToMatchResult}
                        context="matchResult"
                        promotionStatus={r.promotionStatus}
                      />
                    </td>
                    <td style={td}>
                      <AppliedFlagBadge
                        value={r.appliedToFinalScore}
                        context="finalScore"
                        promotionStatus={r.promotionStatus}
                      />
                    </td>
                    <td style={td}>
                      <AppliedFlagBadge
                        value={r.appliedToWorkerRanking}
                        context="workerRanking"
                        promotionStatus={r.promotionStatus}
                      />
                    </td>
                    <td style={td}>{r.rolledBack ? "yes" : "no"}</td>
                    <td style={td}>
                      <SafetyBadge item={r} />
                    </td>
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
                      {" "}
                      <Link
                        to={`/admin/p76/canonical-sidecar/${r.id}/apply-review`}
                        style={{ fontSize: "0.68rem", color: "#2563eb" }}
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
              <strong>{SIDECAR_BANNER}</strong>
              <div style={{ marginTop: "0.2rem" }}>{SIDECAR_BANNER_ZH}</div>
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
              <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                {detailId ? (
                  <>
                    <button
                      type="button"
                      style={btnSecondary}
                      onClick={() => void copyText(detailId)}
                    >
                      Copy id
                    </button>
                    <Link
                      to={`/admin/p76/canonical-sidecar/${detailId}/apply-review`}
                      style={{ ...btnSecondary, textDecoration: "none", display: "inline-block" }}
                    >
                      Open apply review
                    </Link>
                  </>
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
                {hasCanonicalSidecarRowP0Violation(row) ? (
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
                    P0: applied* flag violation — sidecar must not mutate MatchResult /
                    finalScore / worker ranking.
                  </p>
                ) : null}

                <h3 style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>Basic info</h3>
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

                <h3 style={{ fontSize: "0.85rem", marginTop: "0.75rem" }}>
                  Candidate / score
                </h3>
                <DetailGrid
                  items={[
                    ["selectedCandidateId", row.selectedCandidateId ?? "—"],
                    ["score", row.score != null ? String(row.score) : "—"],
                    ["sourceType", row.sourceType ?? "—"],
                  ]}
                />

                <h3 style={{ fontSize: "0.85rem", marginTop: "0.75rem" }}>Source / audit</h3>
                <DetailGrid
                  items={[
                    ["auditRunId", <CopyIdCell key="a" value={row.auditRunId} truncate={false} />],
                    ["sourceVersion", row.sourceVersion ?? "—"],
                    ["schemaVersion", row.schemaVersion != null ? String(row.schemaVersion) : "—"],
                    ["mode", getCanonicalSidecarModeLabel(row.mode)],
                  ]}
                />

                <h3 style={{ fontSize: "0.85rem", marginTop: "0.75rem" }}>
                  Promotion status
                </h3>
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

                <h3 style={{ fontSize: "0.85rem", marginTop: "0.75rem" }}>Applied flags</h3>
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

                <h3 style={{ fontSize: "0.85rem", marginTop: "0.75rem" }}>Safety flags</h3>
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

                <h3 style={{ fontSize: "0.85rem", marginTop: "0.75rem" }}>Signoff statuses</h3>
                <DetailGrid
                  items={[
                    ["pmSignoffStatus", row.pmSignoffStatus ?? "—"],
                    ["opsSignoffStatus", row.opsSignoffStatus ?? "—"],
                  ]}
                />

                <h3 style={{ fontSize: "0.85rem", marginTop: "0.75rem" }}>Lifecycle</h3>
                <DetailGrid
                  items={[
                    ["supersededAt", formatDt(row.supersededAt)],
                    ["deletedAt", formatDt(row.deletedAt)],
                    [
                      "rehearsal admin",
                      links?.rehearsalAdminPath ? (
                        <Link key="rh" to={links.rehearsalAdminPath} style={{ color: "#2563eb" }}>
                          open rehearsal
                        </Link>
                      ) : (
                        "—"
                      ),
                    ],
                  ]}
                />

                <h3 style={{ fontSize: "0.85rem", marginTop: "0.75rem" }}>
                  reasonSummary JSON preview
                </h3>
                <pre style={jsonPreStyle}>{jsonPreview(row.reasonSummary)}</pre>

                <h3 style={{ fontSize: "0.85rem", marginTop: "0.75rem" }}>
                  stageSummary JSON preview
                </h3>
                <pre style={jsonPreStyle}>{jsonPreview(row.stageSummary)}</pre>

                <h3 style={{ fontSize: "0.85rem", marginTop: "0.75rem" }}>
                  safeFallbackMeta JSON preview
                </h3>
                <pre style={jsonPreStyle}>{jsonPreview(row.safeFallbackMeta)}</pre>

                <h3 style={{ fontSize: "0.85rem", marginTop: "0.75rem" }}>
                  guardrails JSON preview
                </h3>
                <pre style={jsonPreStyle}>{jsonPreview(row.guardrails)}</pre>

                <h3 style={{ fontSize: "0.85rem", marginTop: "0.75rem" }}>
                  sanitized dryRunPayload JSON preview
                </h3>
                <pre style={jsonPreStyle}>{jsonPreview(row.dryRunPayload)}</pre>
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
