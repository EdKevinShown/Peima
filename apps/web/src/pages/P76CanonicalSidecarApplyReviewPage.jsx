import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getP76CanonicalSidecarApplyPreview,
  getP76CanonicalSidecarDetail,
  getP76CanonicalSidecarRollbackSnapshotPreview,
} from "../api/p76CanonicalSidecarAdmin";
import AdminNotice from "../components/admin/AdminNotice";
import AdminPageShell from "../components/admin/AdminPageShell";
import AdminSection from "../components/admin/AdminSection";
import {
  adminBadgeToneClass,
  adminBtnSecondary,
  adminMuted,
  adminTd,
  adminTh,
} from "../components/admin/adminTheme";
import LoadingState from "../components/common/LoadingState";
import {
  appliedFlagTone,
  getCanonicalSidecarAppliedFlagLabel,
  getCanonicalSidecarModeLabel,
  getCanonicalSidecarPromotionStatusLabel,
  hasCanonicalSidecarRowP0Violation,
} from "../utils/p76CanonicalSidecarLabels.mjs";
import {
  canApplyTone,
  getBlockedReasonLabel,
  getCanApplySummaryLabel,
  getNoWriteSafetyLabel,
  getRollbackSnapshotDryRunBadge,
  getRollbackTokenDisplay,
  getSafetyFlagRows,
  getSnapshotReadyLabel,
  isNoWriteSafetyVerified,
  isRollbackSnapshotApiUnavailable,
  proposedChangeLabel,
} from "../utils/p76CanonicalApplyReviewLabels.mjs";

function formatDt(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString();
}

function truncateText(text, max = 240) {
  if (text == null || text === "") return "—";
  const s = String(text);
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
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
  const key = tone === "neutral" || tone === "blocked" ? "muted" : tone;
  return adminBadgeToneClass[key] ?? adminBadgeToneClass.muted;
}

function StatusChip({ label, tone = "neutral" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.68rem] mr-1.5 mb-1 ${badgeToneClass(tone)}`}
    >
      {label}
    </span>
  );
}

function DetailGrid({ items }) {
  return (
    <dl className="grid grid-cols-[minmax(140px,38%)_1fr] gap-x-2 gap-y-1 text-xs m-0">
      {items.map(([k, v]) => (
        <DetailRow key={k} label={k} value={v} />
      ))}
    </dl>
  );
}

function DetailRow({ label, value }) {
  return (
    <>
      <dt className="m-0 text-white/45">{label}</dt>
      <dd className="m-0 break-all text-white/85">{value}</dd>
    </>
  );
}

function AppliedFlagBadge({ value, context, promotionStatus }) {
  const tone = appliedFlagTone(value, promotionStatus);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[0.68rem] ${badgeToneClass(tone)}`}
    >
      {getCanonicalSidecarAppliedFlagLabel(value, context, promotionStatus)}
    </span>
  );
}

function SafetyBanner() {
  return (
    <AdminNotice variant="p0" sticky title="PREVIEW ONLY — NO MATCHRESULT WRITE">
      <div>Apply blocked until Gate 12 PASS, Grafana import, and PM/Ops signoff (P7.10-r8).</div>
      <div className="mt-1">This page does not change user-visible matching results.</div>
    </AdminNotice>
  );
}

function PreviewErrorAlert({ previewError, apiDisabled }) {
  return (
    <AdminNotice variant="disabled">
      <strong>Apply preview error.</strong> {previewError}
      {!apiDisabled ? (
        <div className={`${adminMuted} mt-1`}>
          Sidecar detail may still be shown when available.
        </div>
      ) : null}
    </AdminNotice>
  );
}

function ErrorAlerts({ detailError, previewError, apiDisabled, permissionDenied }) {
  return (
    <>
      {detailError ? (
        <AdminNotice
          variant={apiDisabled ? "disabled" : permissionDenied ? "warning" : "p0"}
        >
          {apiDisabled ? (
            <>
              <strong>API disabled.</strong> Enable{" "}
              <code>PEIMA_P76_CANONICAL_SIDECAR_ADMIN_ENABLED=1</code>.
            </>
          ) : permissionDenied ? (
            <>
              <strong>Permission denied (detail).</strong> {detailError}
            </>
          ) : (
            <>
              <strong>Sidecar detail error.</strong> {detailError}
            </>
          )}
        </AdminNotice>
      ) : null}
      {previewError ? (
        <PreviewErrorAlert previewError={previewError} apiDisabled={apiDisabled} />
      ) : null}
    </>
  );
}

export default function P76CanonicalSidecarApplyReviewPage() {
  const { id } = useParams();
  const [detail, setDetail] = useState(null);
  const [preview, setPreview] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailError, setDetailError] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [snapshotError, setSnapshotError] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setDetailError("");
    setPreviewError("");
    setSnapshotError("");
    try {
      const [detailResult, previewResult, snapshotResult] = await Promise.allSettled([
        getP76CanonicalSidecarDetail(id),
        getP76CanonicalSidecarApplyPreview(id),
        getP76CanonicalSidecarRollbackSnapshotPreview(id),
      ]);

      if (detailResult.status === "fulfilled") {
        setDetail(detailResult.value);
      } else {
        setDetail(null);
        setDetailError(
          detailResult.reason instanceof Error
            ? detailResult.reason.message
            : String(detailResult.reason),
        );
      }

      if (previewResult.status === "fulfilled") {
        setPreview(previewResult.value);
      } else {
        setPreview(null);
        setPreviewError(
          previewResult.reason instanceof Error
            ? previewResult.reason.message
            : String(previewResult.reason),
        );
      }

      if (snapshotResult.status === "fulfilled") {
        setSnapshot(snapshotResult.value);
      } else {
        setSnapshot(null);
        setSnapshotError(
          snapshotResult.reason instanceof Error
            ? snapshotResult.reason.message
            : String(snapshotResult.reason),
        );
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const row = detail?.row;
  const sidecar = preview?.sidecar ?? row;
  const promotionStatus = sidecar?.promotionStatus ?? row?.promotionStatus;
  const blockedReasons = Array.isArray(preview?.blockedReasons)
    ? preview.blockedReasons
    : [];
  const gateResults = Array.isArray(preview?.gateResults) ? preview.gateResults : [];
  const proposed = preview?.proposedChange;
  const currentMr = preview?.currentMatchResult;
  const rollback = preview?.rollbackPreview;
  const safety = preview?.safety;
  const snapshotRollback = snapshot?.rollback;
  const snapshotSafety = snapshot?.safety;
  const snapshotBlocked = Array.isArray(snapshot?.blockedReasons)
    ? snapshot.blockedReasons
    : [];
  const snapshotUnavailable = isRollbackSnapshotApiUnavailable(snapshotError);
  const noWriteOk = isNoWriteSafetyVerified(safety);
  const snapshotNoWriteOk = isNoWriteSafetyVerified(snapshotSafety);

  const apiDisabled =
    isApiDisabledError(detailError) || isApiDisabledError(previewError);
  const permissionDenied =
    isPermissionError(detailError) || isPermissionError(previewError);

  const hasGate12 = blockedReasons.includes("gate12_not_final");
  const hasGrafana = blockedReasons.includes("grafana_blocked");
  const hasProdWrite = blockedReasons.includes("production_write_blocked");
  const hasPercent = blockedReasons.includes("percent_rollout_active");
  const hasWorker = blockedReasons.includes("worker_deploy_active");

  const canApplySummary = getCanApplySummaryLabel(
    preview?.canApply === true,
    blockedReasons,
  );
  const applyTone = canApplyTone(preview?.canApply === true);

  return (
    <AdminPageShell
      title="Canonical Apply Review"
      subtitle={id ? `Sidecar id: ${id}` : undefined}
      backTo="/admin/p76/canonical-sidecar"
      backLabel="← Back to sidecar list"
      maxWidth="max-w-4xl"
      actions={
        <button
          type="button"
          className={adminBtnSecondary}
          disabled={loading}
          onClick={() => void load()}
        >
          Refresh
        </button>
      }
    >
      <SafetyBanner />

      <AdminNotice variant="internal">
        <strong>内部 / Admin</strong> — read-only apply review · VIEW_P76_CANONICAL_REHEARSAL ·
        GET only · No Apply · No Rollback · No Promote · No MatchResult write.
      </AdminNotice>

      {loading ? <LoadingState label="加载 apply review…" /> : null}

      {!loading && (detailError || previewError) ? (
        <ErrorAlerts
          detailError={detailError}
          previewError={previewError}
          apiDisabled={apiDisabled}
          permissionDenied={permissionDenied}
        />
      ) : null}

      {!loading && !detailError && row && hasCanonicalSidecarRowP0Violation(row) ? (
        <AdminNotice variant="p0">
          P0: applied* flag violation on sidecar — must not mutate MatchResult / finalScore /
          worker ranking.
        </AdminNotice>
      ) : null}

      {!loading && preview ? (
        <>
          <AdminSection title="Status">
            <StatusChip label="Preview only" tone="blocked" />
            <StatusChip label="Promotion blocked" tone="muted" />
            {noWriteOk ? <StatusChip label="No-write verified" tone="ok" /> : null}
            {hasGate12 ? <StatusChip label="Blocked by Gate 12" tone="blocked" /> : null}
            {hasGrafana ? <StatusChip label="Grafana pending" tone="warning" /> : null}
            {hasProdWrite ? (
              <StatusChip label="Production write blocked" tone="blocked" />
            ) : null}
            {hasPercent ? <StatusChip label="Percent rollout active" tone="warning" /> : null}
            {hasWorker ? <StatusChip label="Worker deploy active" tone="warning" /> : null}
            {sidecar?.rolledBack ? <StatusChip label="Sidecar rolled back" tone="warning" /> : null}
            {promotionStatus === "promoted" ? (
              <StatusChip label="Already promoted" tone="warning" />
            ) : null}
          </AdminSection>

          <AdminSection title="Decision (read-only)">
            <p className="text-sm text-white/85 mb-1">
              <strong>canApply:</strong>{" "}
              <span className={applyTone === "blocked" ? "text-white/45" : "text-amber-200"}>
                {preview.canApply === true ? "true (preview only)" : "false"}
              </span>
            </p>
            <p className={`${adminMuted} m-0`}>{canApplySummary}</p>
            {blockedReasons.length > 0 ? (
              <ul className="mt-2 pl-4 text-xs list-disc text-white/70">
                {blockedReasons.map((r) => (
                  <li key={r}>{getBlockedReasonLabel(r)}</li>
                ))}
              </ul>
            ) : null}
            <p className={`${adminMuted} mt-3 p-2 border border-dashed border-white/15 rounded-lg`}>
              Apply hidden until P7.10-r8 + signoff. This page performs GET requests only.
            </p>
          </AdminSection>
        </>
      ) : null}

      {!loading && !detailError && row ? (
        <AdminSection title="B. Sidecar summary">
          <DetailGrid
            items={[
              ["sidecar id", row.id ?? id ?? "—"],
              ["viewerUserId", row.viewerUserId ?? sidecar?.viewerUserId ?? "—"],
              [
                "selectedCandidateId",
                row.selectedCandidateId ?? sidecar?.selectedCandidateId ?? "—",
              ],
              ["sourceVersion", row.sourceVersion ?? sidecar?.sourceVersion ?? "—"],
              ["mode", getCanonicalSidecarModeLabel(row.mode)],
              [
                "promotionStatus",
                getCanonicalSidecarPromotionStatusLabel(promotionStatus),
              ],
              ["rolledBack", row.rolledBack || sidecar?.rolledBack ? "yes" : "no"],
              [
                "appliedToMatchResult",
                <AppliedFlagBadge
                  key="amr"
                  value={row.appliedToMatchResult ?? sidecar?.appliedToMatchResult}
                  context="matchResult"
                  promotionStatus={promotionStatus}
                />,
              ],
              [
                "appliedToFinalScore",
                <AppliedFlagBadge
                  key="afs"
                  value={row.appliedToFinalScore ?? sidecar?.appliedToFinalScore}
                  context="finalScore"
                  promotionStatus={promotionStatus}
                />,
              ],
              [
                "appliedToWorkerRanking",
                <AppliedFlagBadge
                  key="awr"
                  value={row.appliedToWorkerRanking ?? sidecar?.appliedToWorkerRanking}
                  context="workerRanking"
                  promotionStatus={promotionStatus}
                />,
              ],
            ]}
          />
        </AdminSection>
      ) : null}

      {!loading && preview ? (
        <>
          <AdminSection title="C. Current MatchResult">
            {currentMr ? (
              <DetailGrid
                items={[
                  ["candidateUserId", currentMr.candidateUserId ?? "—"],
                  [
                    "finalScore",
                    currentMr.finalScore != null ? String(currentMr.finalScore) : "—",
                  ],
                  ["reasonSummary", truncateText(currentMr.reasonSummary)],
                  ["hasMatchInsights", currentMr.hasMatchInsights ? "yes" : "no"],
                  ["previewedAt", formatDt(preview.previewedAt)],
                ]}
              />
            ) : (
              <p className={`${adminMuted} m-0`}>
                No MatchResult baseline in preview (see gate: missing_match_result).
              </p>
            )}
          </AdminSection>

          <AdminSection title="D. Proposed change">
            {proposed ? (
              <DetailGrid
                items={[
                  ["candidateWouldChange", proposedChangeLabel(proposed.candidateWouldChange)],
                  ["scoreWouldChange", proposedChangeLabel(proposed.scoreWouldChange)],
                  [
                    "reasonSummaryWouldChange",
                    proposedChangeLabel(proposed.reasonSummaryWouldChange),
                  ],
                  ["displayWouldChange", proposedChangeLabel(proposed.displayWouldChange)],
                ]}
              />
            ) : (
              <p className={`${adminMuted} m-0`}>—</p>
            )}
          </AdminSection>

          <AdminSection title="E. Gate results">
            {gateResults.length > 0 ? (
              <div className="admin-table-wrap overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className={adminTh}>gate</th>
                      <th className={adminTh}>pass</th>
                      <th className={adminTh}>blockedReason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gateResults.map((g) => (
                      <tr key={g.id}>
                        <td className={adminTd}>{g.id}</td>
                        <td className={adminTd}>{g.pass ? "pass" : "fail"}</td>
                        <td className={adminTd}>
                          {g.blockedReason
                            ? getBlockedReasonLabel(g.blockedReason)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={`${adminMuted} m-0`}>No gate results.</p>
            )}
          </AdminSection>

          <AdminSection title="F. Rollback snapshot preview (dry-run)">
            <div className="flex flex-wrap gap-2 items-center mb-2">
              <StatusChip label={getRollbackSnapshotDryRunBadge()} tone="muted" />
              {snapshot ? (
                <StatusChip
                  label={getSnapshotReadyLabel(snapshot.snapshotReady === true)}
                  tone={snapshot.snapshotReady === true ? "ok" : "blocked"}
                />
              ) : null}
            </div>
            {snapshotError ? (
              <p className={`${adminMuted} mb-2 ${snapshotUnavailable ? "" : "text-amber-200"}`}>
                {snapshotUnavailable
                  ? "Rollback snapshot preview unavailable — apply preview above remains authoritative."
                  : snapshotError}
              </p>
            ) : null}
            {snapshot ? (
              <>
                {snapshotBlocked.length > 0 ? (
                  <ul className="mb-2 pl-4 text-xs list-disc text-amber-200">
                    {snapshotBlocked.map((r) => (
                      <li key={r}>{getBlockedReasonLabel(r)}</li>
                    ))}
                  </ul>
                ) : null}
                <DetailGrid
                  items={[
                    ["mode", snapshot.mode ?? "dry_run"],
                    ["sourceVersion", snapshot.sourceVersion ?? "—"],
                    [
                      "before.candidateUserId",
                      snapshot.before?.candidateUserId ?? "—",
                    ],
                    [
                      "before.finalScore",
                      snapshot.before?.finalScore != null
                        ? String(snapshot.before.finalScore)
                        : "—",
                    ],
                    [
                      "proposedAfter.candidateUserId",
                      snapshot.proposedAfter?.candidateUserId ?? "—",
                    ],
                    [
                      "proposedAfter.finalScore",
                      snapshot.proposedAfter?.finalScore != null
                        ? String(snapshot.proposedAfter.finalScore)
                        : "—",
                    ],
                    [
                      "rollbackTokenPreview",
                      getRollbackTokenDisplay(snapshotRollback?.rollbackTokenPreview),
                    ],
                    [
                      "rollbackExpiresAt",
                      formatDt(snapshotRollback?.rollbackExpiresAt),
                    ],
                    [
                      "rollbackScope",
                      snapshotRollback?.rollbackScope ?? "—",
                    ],
                  ]}
                />
                <p className={`${adminMuted} mt-1`}>
                  Snapshot safety:{" "}
                  {snapshotNoWriteOk ? "no-write verified" : "check flags"}
                </p>
                <DetailGrid
                  items={getSafetyFlagRows(snapshotSafety).map(({ key, value, ok }) => [
                    `snapshot.${key}`,
                    <span key={key} className={ok ? "text-emerald-300" : "text-red-200"}>
                      {value === false ? "false ✓" : String(value)}
                    </span>,
                  ])}
                />
              </>
            ) : !snapshotError && rollback ? (
              <DetailGrid
                items={[
                  [
                    "rollbackTokenPreview (apply-preview)",
                    getRollbackTokenDisplay(rollback.rollbackTokenPreview),
                  ],
                ]}
              />
            ) : !snapshotError ? (
              <p className={`${adminMuted} m-0`}>
                Rollback snapshot preview pending.
              </p>
            ) : null}
          </AdminSection>

          <AdminSection title="G. No-write safety">
            {!noWriteOk ? (
              <AdminNotice variant="p0">
                {getNoWriteSafetyLabel(safety)}
              </AdminNotice>
            ) : (
              <StatusChip label={getNoWriteSafetyLabel(safety)} tone="ok" />
            )}
            <DetailGrid
              items={getSafetyFlagRows(safety).map(({ key, value, ok }) => [
                key,
                <span key={key} className={ok ? "text-emerald-300" : "text-red-200"}>
                  {value === false ? "false ✓" : String(value)}
                </span>,
              ])}
            />
          </AdminSection>
        </>
      ) : null}

      {!loading && !previewError && !preview && !detailError ? (
        <p className={adminMuted}>Apply preview unavailable.</p>
      ) : null}
    </AdminPageShell>
  );
}
