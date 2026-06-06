import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PHOTO_REVIEW_REASON_CODES,
  approveAdminPhotoReviewItem,
  getAdminPhotoReviewItem,
  listAdminPhotoReviewItems,
  needsReuploadAdminPhotoReviewItem,
  rejectAdminPhotoReviewItem,
} from "../api/adminPhotoReview";
import AuthenticatedUserImage from "../components/common/AuthenticatedUserImage";
import AdminPageShell from "../components/admin/AdminPageShell";
import AdminNotice from "../components/admin/AdminNotice";
import AdminFilterPanel from "../components/admin/AdminFilterPanel";
import AdminJsonBlock from "../components/admin/AdminJsonBlock";
import AdminSection from "../components/admin/AdminSection";
import {
  adminTh,
  adminTd,
  adminBtnPrimary,
  adminBtnSecondary,
  adminBtnDanger,
  adminLabel,
  adminSelect,
  adminInput,
  adminModalOverlay,
  adminModalPanel,
  adminMuted,
} from "../components/admin/adminTheme";

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
    <AdminPageShell
      maxWidth="max-w-6xl"
      title="照片审核"
      subtitle="运营 / 管理员审核用户上传照片。需 manage_photo_review 权限。"
    >
      <AdminNotice variant="internal" title="内部 / Admin">
        仅运营与管理员；普通用户页面不展示 reviewNote。
      </AdminNotice>

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
        <AdminNotice variant="danger" title="列表加载失败">
          {listError}
        </AdminNotice>
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
    </AdminPageShell>
  );
}

function FilterSection({ filters, setFilters, onQuery, onReset, listLoading }) {
  return (
    <AdminFilterPanel
      title="筛选"
      actions={
        <FilterActions onQuery={onQuery} onReset={onReset} listLoading={listLoading} />
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 w-full">
        <label className={adminLabel}>
          reviewStatus{" "}
          <select
            className={adminSelect}
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
        <label className={adminLabel}>
          detectionStatus{" "}
          <select
            className={adminSelect}
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
        <label className={adminLabel}>
          reasonCode{" "}
          <input
            className={adminInput}
            value={filters.reasonCode}
            onChange={(e) => setFilters((f) => ({ ...f, reasonCode: e.target.value }))}
            placeholder="如 FACE_NOT_FOUND"
          />
        </label>
        <label className={adminLabel}>
          hasWarnings{" "}
          <select
            className={adminSelect}
            value={filters.hasWarnings}
            onChange={(e) => setFilters((f) => ({ ...f, hasWarnings: e.target.value }))}
          >
            <option value="">全部</option>
            <option value="true">有 warning</option>
            <option value="false">无 warning</option>
          </select>
        </label>
        <label className={adminLabel}>
          userId{" "}
          <input
            className={adminInput}
            value={filters.userId}
            onChange={(e) => setFilters((f) => ({ ...f, userId: e.target.value }))}
            placeholder="用户 ID"
          />
        </label>
      </div>
    </AdminFilterPanel>
  );
}

function FilterActions({ onQuery, onReset, listLoading }) {
  return (
    <>
      <button type="button" onClick={onQuery} disabled={listLoading} className={adminBtnPrimary}>
        查询
      </button>
      <button type="button" onClick={onReset} disabled={listLoading} className={adminBtnSecondary}>
        重置
      </button>
    </>
  );
}

function ListSection({ items, listLoading, openDetail, nextCursor, onLoadMore }) {
  return (
    <AdminSection className="mb-0">
      {items.length === 0 && !listLoading ? (
        <p className={`m-0 ${adminMuted}`}>无匹配记录。</p>
      ) : (
        <div className="admin-table-wrap overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={adminTh}>缩略图</th>
                <th className={adminTh}>userId</th>
                <th className={adminTh}>detection</th>
                <th className={adminTh}>detection codes</th>
                <th className={adminTh}>review</th>
                <th className={adminTh}>review codes</th>
                <th className={adminTh}>warnings</th>
                <th className={adminTh}>detectedAt</th>
                <th className={adminTh}>createdAt</th>
                <th className={adminTh}>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.imageId} className="hover:bg-white/5">
                  <td className={adminTd}>
                    <AuthenticatedUserImage
                      imageId={row.imageId}
                      alt=""
                      className="w-14 h-14 object-cover rounded-lg border border-white/15"
                    />
                  </td>
                  <td className={adminTd}>
                    <code className="text-[0.7rem] text-white/75">{row.userId}</code>
                  </td>
                  <td className={adminTd}>{row.detectionStatus}</td>
                  <td className={adminTd}>
                    <code className="text-[0.68rem] text-white/70">{formatCodes(row.detectionReasonCodes)}</code>
                  </td>
                  <td className={adminTd}>{row.reviewStatus}</td>
                  <td className={adminTd}>
                    <code className="text-[0.68rem] text-white/70">{formatCodes(row.reviewReasonCodes)}</code>
                  </td>
                  <td className={adminTd}>{warningsLabel(row.detectionSummary)}</td>
                  <td className={adminTd}>{formatDt(row.detectedAt)}</td>
                  <td className={adminTd}>{formatDt(row.createdAt)}</td>
                  <td className={adminTd}>
                    <button
                      type="button"
                      onClick={() => void openDetail(row.imageId)}
                      className={adminBtnSecondary}
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
    </AdminSection>
  );
}

function LoadMoreButton({ listLoading, onLoadMore }) {
  return (
    <div className="mt-3">
      <button type="button" disabled={listLoading} onClick={onLoadMore} className={adminBtnSecondary}>
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
      className={adminModalOverlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`${adminModalPanel} max-w-[920px]`} onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center gap-2">
          <h2 id="photo-review-detail-title" className="m-0 text-base font-semibold text-white">
            照片详情
          </h2>
          <button type="button" onClick={onClose} className={adminBtnSecondary}>
            关闭
          </button>
        </div>

        {detailLoading ? <LoadingState label="加载详情…" /> : null}
        {detailError ? (
          <AdminNotice variant="danger" className="mt-3 mb-0">
            {detailError}
          </AdminNotice>
        ) : null}

        {detail && !detailLoading ? (
          <>
            <DetailBody detail={detail} showScoreJson={showScoreJson} setShowScoreJson={setShowScoreJson} />
            {actionMessage ? (
              <AdminNotice
                variant={actionMessage.includes("成功") ? "success" : "danger"}
                className="mt-3 mb-0"
              >
                {actionMessage}
              </AdminNotice>
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
    <div className="mt-3 grid grid-cols-1 sm:grid-cols-[minmax(140px,220px)_1fr] gap-4">
      <AuthenticatedUserImage
        imageId={detail.imageId}
        alt=""
        className="w-full max-h-[280px] object-contain rounded-xl border border-white/15 bg-white/5"
      />
      <div className="text-sm leading-relaxed text-white/85">
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
          className="mt-2"
        >
          <summary className="cursor-pointer font-semibold text-white/90">detectionScoreJson（完整）</summary>
          <AdminJsonBlock value={detail.detectionScoreJson} maxHeightClass="max-h-60" className="mt-2" />
        </details>
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }) {
  return (
    <p className="my-0.5">
      <strong className="text-white/60">{label}：</strong>
      {mono ? <code className="text-[0.72rem] text-white/80">{value}</code> : <span>{value}</span>}
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
    <section className="mt-4 pt-4 border-t border-white/10">
      <h3 className="m-0 mb-3 text-sm font-semibold text-white">审核操作</h3>

      <div className="mb-3">
        <strong className="text-xs text-white/70">Approve</strong>
        <textarea
          value={approveNote}
          onChange={(e) => setApproveNote(e.target.value)}
          maxLength={500}
          placeholder="备注（可选，最多 500 字）"
          rows={2}
          className="admin-input block w-full mt-1.5"
          disabled={!!actionBusy}
        />
        <button
          type="button"
          disabled={!!actionBusy}
          onClick={onApprove}
          className={`${adminBtnPrimary} mt-1.5`}
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
    <div className="mb-3">
      <strong className="text-xs text-white/70">{title}</strong>
      <div className="flex flex-wrap gap-x-3 gap-y-1 my-1.5">
        {PHOTO_REVIEW_REASON_CODES.map((code) => (
          <label key={`${title}-${code}`} className="text-xs text-white/75">
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
        className="admin-input block w-full mt-1"
        disabled={disabled}
      />
      <button
        type="button"
        disabled={disabled || !reasonCodes.length}
        onClick={onSubmit}
        className={`${adminBtnDanger} mt-1.5`}
      >
        {busy ? "提交中…" : submitLabel}
      </button>
    </div>
  );
}
