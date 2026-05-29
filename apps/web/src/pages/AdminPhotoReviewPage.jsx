import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  PHOTO_REVIEW_REASON_CODES,
  approveAdminPhotoReviewItem,
  getAdminPhotoReviewItem,
  listAdminPhotoReviewItems,
  needsReuploadAdminPhotoReviewItem,
  rejectAdminPhotoReviewItem,
} from "../api/adminPhotoReview";
import LoadingState from "../components/common/LoadingState";

const DEFAULT_FILTERS = {
  reviewStatus: "pending_review",
  detectionStatus: "",
  reasonCode: "",
  hasWarnings: "",
  userId: "",
};

function formatDt(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString();
}

function formatCodes(codes) {
  if (!codes?.length) return "—";
  return codes.join(", ");
}

function warningsLabel(summary) {
  const w = summary?.warnings;
  if (!w?.length) return "—";
  return w.join(", ");
}

const th = {
  textAlign: "left",
  borderBottom: "1px solid #e2e8f0",
  padding: "0.35rem 0.4rem",
  whiteSpace: "nowrap",
};
const td = {
  padding: "0.35rem 0.4rem",
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "top",
  fontSize: "0.78rem",
};
const btnPrimary = {
  padding: "0.4rem 0.85rem",
  borderRadius: 6,
  border: "none",
  background: "#1e293b",
  color: "#fff",
  fontSize: "0.82rem",
  cursor: "pointer",
};
const btnSecondary = {
  padding: "0.35rem 0.7rem",
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#334155",
  fontSize: "0.82rem",
  cursor: "pointer",
};
const btnDanger = {
  padding: "0.4rem 0.85rem",
  borderRadius: 6,
  border: "none",
  background: "#b91c1c",
  color: "#fff",
  fontSize: "0.82rem",
  cursor: "pointer",
};
const textareaStyle = {
  display: "block",
  width: "100%",
  marginTop: "0.35rem",
  padding: "0.4rem",
  fontSize: "0.8rem",
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  boxSizing: "border-box",
};

export default function AdminPhotoReviewPage() {
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });
  const [appliedFilters, setAppliedFilters] = useState({ ...DEFAULT_FILTERS });
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const [approveNote, setApproveNote] = useState("");
  const [rejectReasonCodes, setRejectReasonCodes] = useState([]);
  const [rejectNote, setRejectNote] = useState("");
  const [reuploadReasonCodes, setReuploadReasonCodes] = useState(["NEEDS_REUPLOAD"]);
  const [reuploadNote, setReuploadNote] = useState("");
  const [actionBusy, setActionBusy] = useState(null);
  const [actionMessage, setActionMessage] = useState("");
  const [showScoreJson, setShowScoreJson] = useState(false);

  const listParams = useMemo(() => {
    const p = {
      reviewStatus: appliedFilters.reviewStatus || undefined,
      detectionStatus: appliedFilters.detectionStatus || undefined,
      reasonCode: appliedFilters.reasonCode || undefined,
      userId: appliedFilters.userId || undefined,
      limit: 20,
    };
    if (appliedFilters.hasWarnings === "true") p.hasWarnings = true;
    if (appliedFilters.hasWarnings === "false") p.hasWarnings = false;
    return p;
  }, [appliedFilters]);

  const fetchList = useCallback(
    async ({ append = false, cursor = null } = {}) => {
      setListLoading(true);
      if (!append) setListError("");
      try {
        const data = await listAdminPhotoReviewItems({
          ...listParams,
          cursor: cursor ?? undefined,
        });
        const next = Array.isArray(data.items) ? data.items : [];
        setItems((prev) => (append ? [...prev, ...next] : next));
        setNextCursor(data.nextCursor ?? null);
      } catch (e) {
        if (!append) setItems([]);
        setListError(e instanceof Error ? e.message : String(e));
      } finally {
        setListLoading(false);
      }
    },
    [listParams],
  );

  useEffect(() => {
    void fetchList({ append: false });
  }, [fetchList]);

  const openDetail = useCallback(async (imageId) => {
    setDetailId(imageId);
    setDetailOpen(true);
    setDetail(null);
    setDetailError("");
    setActionMessage("");
    setApproveNote("");
    setRejectReasonCodes([]);
    setRejectNote("");
    setReuploadReasonCodes(["NEEDS_REUPLOAD"]);
    setReuploadNote("");
    setShowScoreJson(false);
    setDetailLoading(true);
    try {
      setDetail(await getAdminPhotoReviewItem(imageId));
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
    setActionMessage("");
  };

  const afterActionSuccess = useCallback(
    (updated) => {
      setDetail(updated);
      setActionMessage("审核操作已成功保存。");
      setItems((prev) => {
        const mapped = prev.map((row) =>
          row.imageId === updated.imageId ? { ...row, ...updated } : row,
        );
        if (
          appliedFilters.reviewStatus === "pending_review" &&
          updated.reviewStatus !== "pending_review"
        ) {
          return mapped.filter((row) => row.imageId !== updated.imageId);
        }
        return mapped;
      });
    },
    [appliedFilters.reviewStatus],
  );

  const runApprove = async () => {
    if (!detailId) return;
    setActionBusy("approve");
    setActionMessage("");
    try {
      afterActionSuccess(
        await approveAdminPhotoReviewItem(detailId, {
          note: approveNote.trim() || undefined,
        }),
      );
    } catch (e) {
      setActionMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(null);
    }
  };

  const runReject = async () => {
    if (!detailId) return;
    setActionBusy("reject");
    setActionMessage("");
    try {
      afterActionSuccess(
        await rejectAdminPhotoReviewItem(detailId, {
          reasonCodes: rejectReasonCodes,
          note: rejectNote.trim() || undefined,
        }),
      );
    } catch (e) {
      setActionMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(null);
    }
  };

  const runNeedsReupload = async () => {
    if (!detailId) return;
    setActionBusy("needs-reupload");
    setActionMessage("");
    try {
      afterActionSuccess(
        await needsReuploadAdminPhotoReviewItem(detailId, {
          reasonCodes: reuploadReasonCodes,
          note: reuploadNote.trim() || undefined,
        }),
      );
    } catch (e) {
      setActionMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(null);
    }
  };

  const toggleReason = (setList, code) => {
    setList((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  return (
    <main style={{ maxWidth: 1280, margin: "1.1rem auto", padding: "0 1rem", color: "#334155" }}>
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
        <strong>内部 / Admin</strong> — 仅运营与管理员；普通用户页面不展示 reviewNote。
        {" "}
        <Link to="/" style={{ color: "#b45309" }}>
          返回首页
        </Link>
      </div>

      <h1 style={{ margin: "0 0 0.45rem", fontSize: "1.25rem", color: "#0f172a" }}>照片审核</h1>
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.82rem", color: "#64748b" }}>
        运营 / 管理员审核用户上传照片。需 manage_photo_review 权限。
      </p>

      <FilterSection
        filters={filters}
        setFilters={setFilters}
        onQuery={() => setAppliedFilters({ ...filters })}
        onReset={() => {
          setFilters({ ...DEFAULT_FILTERS });
          setAppliedFilters({ ...DEFAULT_FILTERS });
        }}
        listLoading={listLoading}
      />

      {listLoading && items.length === 0 ? (
        <LoadingState label="加载待审核照片列表…" />
      ) : null}
      {listError ? (
        <p style={{ color: "#b91c1c", fontSize: "0.85rem" }} role="alert">
          {listError}
        </p>
      ) : null}

      {!listError ? (
        <ListSection
          items={items}
          listLoading={listLoading}
          openDetail={openDetail}
          nextCursor={nextCursor}
          onLoadMore={() => void fetchList({ append: true, cursor: nextCursor })}
        />
      ) : null}

      {detailOpen ? (
        <DetailModal
          detail={detail}
          detailLoading={detailLoading}
          detailError={detailError}
          showScoreJson={showScoreJson}
          setShowScoreJson={setShowScoreJson}
          actionMessage={actionMessage}
          approveNote={approveNote}
          setApproveNote={setApproveNote}
          rejectReasonCodes={rejectReasonCodes}
          rejectNote={rejectNote}
          setRejectNote={setRejectNote}
          reuploadReasonCodes={reuploadReasonCodes}
          reuploadNote={reuploadNote}
          setReuploadNote={setReuploadNote}
          actionBusy={actionBusy}
          onClose={closeDetail}
          onApprove={() => void runApprove()}
          onReject={() => void runReject()}
          onNeedsReupload={() => void runNeedsReupload()}
          toggleReject={(code) => toggleReason(setRejectReasonCodes, code)}
          toggleReupload={(code) => toggleReason(setReuploadReasonCodes, code)}
        />
      ) : null}
    </main>
  );
}

function FilterSection({ filters, setFilters, onQuery, onReset, listLoading }) {
  return (
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
      <strong>筛选</strong>
      <div
        style={{
          marginTop: "0.45rem",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(11rem, 1fr))",
          gap: "0.55rem",
        }}
      >
        <label>
          reviewStatus{" "}
          <select
            value={filters.reviewStatus}
            onChange={(e) => setFilters((f) => ({ ...f, reviewStatus: e.target.value }))}
          >
            <option value="pending_review">pending_review</option>
            <option value="not_required">not_required</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
            <option value="needs_reupload">needs_reupload</option>
            <option value="">全部</option>
          </select>
        </label>
        <label>
          detectionStatus{" "}
          <select
            value={filters.detectionStatus}
            onChange={(e) => setFilters((f) => ({ ...f, detectionStatus: e.target.value }))}
          >
            <option value="">全部</option>
            <option value="pending">pending</option>
            <option value="passed">passed</option>
            <option value="failed">failed</option>
            <option value="skipped">skipped</option>
          </select>
        </label>
        <label>
          reasonCode{" "}
          <input
            value={filters.reasonCode}
            onChange={(e) => setFilters((f) => ({ ...f, reasonCode: e.target.value }))}
            placeholder="如 FACE_NOT_FOUND"
          />
        </label>
        <label>
          hasWarnings{" "}
          <select
            value={filters.hasWarnings}
            onChange={(e) => setFilters((f) => ({ ...f, hasWarnings: e.target.value }))}
          >
            <option value="">全部</option>
            <option value="true">有 warning</option>
            <option value="false">无 warning</option>
          </select>
        </label>
        <label>
          userId{" "}
          <input
            value={filters.userId}
            onChange={(e) => setFilters((f) => ({ ...f, userId: e.target.value }))}
            placeholder="用户 ID"
          />
        </label>
      </div>
      <FilterActions onQuery={onQuery} onReset={onReset} listLoading={listLoading} />
    </section>
  );
}

function FilterActions({ onQuery, onReset, listLoading }) {
  return (
    <div style={{ marginTop: "0.55rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
      <button type="button" onClick={onQuery} disabled={listLoading} style={btnPrimary}>
        查询
      </button>
      <button type="button" onClick={onReset} disabled={listLoading} style={btnSecondary}>
        重置
      </button>
    </div>
  );
}

function ListSection({ items, listLoading, openDetail, nextCursor, onLoadMore }) {
  return (
    <section
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        background: "#fff",
        padding: "0.6rem 0.75rem",
      }}
    >
      {items.length === 0 && !listLoading ? (
        <p style={{ margin: 0, fontSize: "0.82rem" }}>无匹配记录。</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>缩略图</th>
                <th style={th}>userId</th>
                <th style={th}>detection</th>
                <th style={th}>detection codes</th>
                <th style={th}>review</th>
                <th style={th}>review codes</th>
                <th style={th}>warnings</th>
                <th style={th}>detectedAt</th>
                <th style={th}>createdAt</th>
                <th style={th}>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.imageId}>
                  <td style={td}>
                    <img
                      src={row.imageUrl}
                      alt=""
                      style={{
                        width: 56,
                        height: 56,
                        objectFit: "cover",
                        borderRadius: 6,
                        border: "1px solid #e2e8f0",
                      }}
                    />
                  </td>
                  <td style={td}>
                    <code style={{ fontSize: "0.7rem" }}>{row.userId}</code>
                  </td>
                  <td style={td}>{row.detectionStatus}</td>
                  <td style={td}>
                    <code style={{ fontSize: "0.68rem" }}>{formatCodes(row.detectionReasonCodes)}</code>
                  </td>
                  <td style={td}>{row.reviewStatus}</td>
                  <td style={td}>
                    <code style={{ fontSize: "0.68rem" }}>{formatCodes(row.reviewReasonCodes)}</code>
                  </td>
                  <td style={td}>{warningsLabel(row.detectionSummary)}</td>
                  <td style={td}>{formatDt(row.detectedAt)}</td>
                  <td style={td}>{formatDt(row.createdAt)}</td>
                  <td style={td}>
                    <button
                      type="button"
                      onClick={() => void openDetail(row.imageId)}
                      style={btnSecondary}
                    >
                      查看详情
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {items.length > 0 && nextCursor ? (
        <LoadMoreButton listLoading={listLoading} onLoadMore={onLoadMore} />
      ) : null}
    </section>
  );
}

function LoadMoreButton({ listLoading, onLoadMore }) {
  return (
    <div style={{ marginTop: "0.65rem" }}>
      <button type="button" disabled={listLoading} onClick={onLoadMore} style={btnSecondary}>
        {listLoading ? "加载中…" : "加载更多"}
      </button>
    </div>
  );
}

function DetailModal(props) {
  const {
    detail,
    detailLoading,
    detailError,
    showScoreJson,
    setShowScoreJson,
    actionMessage,
    approveNote,
    setApproveNote,
    rejectReasonCodes,
    rejectNote,
    setRejectNote,
    reuploadReasonCodes,
    reuploadNote,
    setReuploadNote,
    actionBusy,
    onClose,
    onApprove,
    onReject,
    onNeedsReupload,
    toggleReject,
    toggleReupload,
  } = props;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="photo-review-detail-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "1.5rem 1rem",
        overflowY: "auto",
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 920,
          background: "#fff",
          borderRadius: 10,
          border: "1px solid #e2e8f0",
          padding: "1rem 1.1rem",
          boxShadow: "0 12px 40px rgba(15,23,42,0.12)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 id="photo-review-detail-title" style={{ margin: 0, fontSize: "1.05rem", color: "#0f172a" }}>
            照片详情
          </h2>
          <button type="button" onClick={onClose} style={btnSecondary}>
            关闭
          </button>
        </div>

        {detailLoading ? <LoadingState label="加载详情…" /> : null}
        {detailError ? (
          <p style={{ color: "#b91c1c", fontSize: "0.85rem" }} role="alert">
            {detailError}
          </p>
        ) : null}

        {detail && !detailLoading ? (
          <>
            <DetailBody detail={detail} showScoreJson={showScoreJson} setShowScoreJson={setShowScoreJson} />
            {actionMessage ? (
              <p
                style={{
                  margin: "0.75rem 0 0",
                  fontSize: "0.82rem",
                  color: actionMessage.includes("成功") ? "#15803d" : "#b91c1c",
                }}
                role="status"
              >
                {actionMessage}
              </p>
            ) : null}
            <ActionPanel
              approveNote={approveNote}
              setApproveNote={setApproveNote}
              rejectReasonCodes={rejectReasonCodes}
              rejectNote={rejectNote}
              setRejectNote={setRejectNote}
              reuploadReasonCodes={reuploadReasonCodes}
              reuploadNote={reuploadNote}
              setReuploadNote={setReuploadNote}
              actionBusy={actionBusy}
              onApprove={onApprove}
              onReject={onReject}
              onNeedsReupload={onNeedsReupload}
              toggleReject={toggleReject}
              toggleReupload={toggleReupload}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

function DetailBody({ detail, showScoreJson, setShowScoreJson }) {
  return (
    <DetailContent
      detail={detail}
      summary={detail.detectionSummary}
      showScoreJson={showScoreJson}
      setShowScoreJson={setShowScoreJson}
    />
  );
}

function DetailContent({ detail, summary, showScoreJson, setShowScoreJson }) {
  return (
    <div
      style={{
        marginTop: "0.85rem",
        display: "grid",
        gridTemplateColumns: "minmax(140px, 220px) 1fr",
        gap: "1rem",
      }}
    >
      <img
        src={detail.imageUrl}
        alt=""
        style={{
          width: "100%",
          maxHeight: 280,
          objectFit: "contain",
          borderRadius: 8,
          border: "1px solid #e2e8f0",
          background: "#f8fafc",
        }}
      />
      <div style={{ fontSize: "0.8rem", lineHeight: 1.55 }}>
        <DetailRow label="imageId" value={detail.imageId} mono />
        <DetailRow label="userId" value={detail.userId} mono />
        <DetailRow label="nickname" value={detail.user?.nickname ?? "—"} />
        <DetailRow label="detectionStatus" value={detail.detectionStatus} />
        <DetailRow label="detectionReasonCodes" value={formatCodes(detail.detectionReasonCodes)} mono />
        <DetailRow label="detectionRulesVersion" value={detail.detectionRulesVersion || "—"} />
        <DetailRow label="detectedAt" value={formatDt(detail.detectedAt)} />
        <DetailRow label="reviewStatus" value={detail.reviewStatus} />
        <DetailRow label="reviewReasonCodes" value={formatCodes(detail.reviewReasonCodes)} mono />
        <DetailRow label="reviewedAt" value={formatDt(detail.reviewedAt)} />
        <DetailRow label="reviewedByUserId" value={detail.reviewedByUserId || "—"} mono />
        <DetailRow label="reviewNote" value={detail.reviewNote || "—"} />
        <DetailRow
          label="detectionSummary"
          value={
            summary
              ? `faceCount=${summary.faceCount ?? "—"}, warnings=${warningsLabel(summary)}`
              : "—"
          }
        />
        {summary?.quality ? (
          <DetailRow
            label="quality"
            value={`luma=${summary.quality.meanLuma}, lap=${summary.quality.laplacianVariance}, ${summary.quality.width}x${summary.quality.height}`}
          />
        ) : null}
        <details
          open={showScoreJson}
          onToggle={(e) => setShowScoreJson(e.target.open)}
          style={{ marginTop: "0.5rem" }}
        >
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>detectionScoreJson（完整）</summary>
          <pre
            style={{
              marginTop: "0.35rem",
              padding: "0.5rem",
              background: "#f1f5f9",
              borderRadius: 6,
              fontSize: "0.68rem",
              overflow: "auto",
              maxHeight: 240,
            }}
          >
            {JSON.stringify(detail.detectionScoreJson, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }) {
  return (
    <p style={{ margin: "0.2rem 0" }}>
      <strong>{label}：</strong>
      {mono ? <code style={{ fontSize: "0.72rem" }}>{value}</code> : <span>{value}</span>}
    </p>
  );
}

function ActionPanel(props) {
  const {
    approveNote,
    setApproveNote,
    rejectReasonCodes,
    rejectNote,
    setRejectNote,
    reuploadReasonCodes,
    reuploadNote,
    setReuploadNote,
    actionBusy,
    onApprove,
    onReject,
    onNeedsReupload,
    toggleReject,
    toggleReupload,
  } = props;

  return (
    <section style={{ marginTop: "1rem", paddingTop: "0.85rem", borderTop: "1px solid #e2e8f0" }}>
      <h3 style={{ margin: "0 0 0.65rem", fontSize: "0.95rem" }}>审核操作</h3>

      <div style={{ marginBottom: "0.85rem" }}>
        <strong style={{ fontSize: "0.82rem" }}>Approve</strong>
        <textarea
          value={approveNote}
          onChange={(e) => setApproveNote(e.target.value)}
          maxLength={500}
          placeholder="备注（可选，最多 500 字）"
          rows={2}
          style={textareaStyle}
          disabled={!!actionBusy}
        />
        <button
          type="button"
          disabled={!!actionBusy}
          onClick={onApprove}
          style={{ ...btnPrimary, marginTop: "0.35rem" }}
        >
          {actionBusy === "approve" ? "提交中…" : "通过 Approve"}
        </button>
      </div>

      <ReasonActionBlock
        title="Reject"
        reasonCodes={rejectReasonCodes}
        note={rejectNote}
        setNote={setRejectNote}
        busy={actionBusy === "reject"}
        disabled={!!actionBusy}
        onToggle={toggleReject}
        onSubmit={onReject}
        submitLabel="拒绝 Reject"
      />

      <ReasonActionBlock
        title="Needs reupload"
        reasonCodes={reuploadReasonCodes}
        note={reuploadNote}
        setNote={setReuploadNote}
        busy={actionBusy === "needs-reupload"}
        disabled={!!actionBusy}
        onToggle={toggleReupload}
        onSubmit={onNeedsReupload}
        submitLabel="要求重传 Needs reupload"
      />
    </section>
  );
}

function ReasonActionBlock({
  title,
  reasonCodes,
  note,
  setNote,
  busy,
  disabled,
  onToggle,
  onSubmit,
  submitLabel,
}) {
  return (
    <div style={{ marginBottom: "0.85rem" }}>
      <strong style={{ fontSize: "0.82rem" }}>{title}</strong>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem 0.65rem", margin: "0.35rem 0" }}>
        {PHOTO_REVIEW_REASON_CODES.map((code) => (
          <label key={`${title}-${code}`} style={{ fontSize: "0.75rem" }}>
            <input
              type="checkbox"
              checked={reasonCodes.includes(code)}
              onChange={() => onToggle(code)}
              disabled={disabled}
            />{" "}
            {code}
          </label>
        ))}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        placeholder="备注（可选）"
        rows={2}
        style={textareaStyle}
        disabled={disabled}
      />
      <button
        type="button"
        disabled={disabled || !reasonCodes.length}
        onClick={onSubmit}
        style={{ ...btnDanger, marginTop: "0.35rem" }}
      >
        {busy ? "提交中…" : submitLabel}
      </button>
    </div>
  );
}
