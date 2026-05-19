import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getP76CanonicalSidecarApplyPreview,
  getP76CanonicalSidecarDetail,
} from "../api/p76CanonicalSidecarAdmin";
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
  getRollbackTokenDisplay,
  getSafetyFlagRows,
  isNoWriteSafetyVerified,
  proposedChangeLabel,
} from "../utils/p76CanonicalApplyReviewLabels.mjs";

const th = {
  textAlign: "left",
  borderBottom: "1px solid #e2e8f0",
  padding: "0.35rem 0.4rem",
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
const sectionStyle = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  background: "#fff",
  padding: "0.65rem 0.75rem",
  marginBottom: "0.75rem",
};

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

function badgeStyle(tone) {
  const map = {
    p0: { bg: "#fef2f2", color: "#b91c1c", border: "#fecaca" },
    warning: { bg: "#fffbeb", color: "#b45309", border: "#fde68a" },
    blocked: { bg: "#f1f5f9", color: "#475569", border: "#cbd5e1" },
    ok: { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
    muted: { bg: "#f8fafc", color: "#64748b", border: "#e2e8f0" },
    neutral: { bg: "#f8fafc", color: "#475569", border: "#e2e8f0" },
  };
  return map[tone] ?? map.neutral;
}

function StatusChip({ label, tone = "neutral" }) {
  const s = badgeStyle(tone);
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.12rem 0.4rem",
        borderRadius: 4,
        fontSize: "0.68rem",
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        marginRight: "0.35rem",
        marginBottom: "0.25rem",
      }}
    >
      {label}
    </span>
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
        <DetailRow key={k} label={k} value={v} />
      ))}
    </dl>
  );
}

function DetailRow({ label, value }) {
  return (
    <>
      <dt style={{ margin: 0, color: "#64748b" }}>{label}</dt>
      <dd style={{ margin: 0, wordBreak: "break-all" }}>{value}</dd>
    </>
  );
}

function Section({ title, children }) {
  return (
    <section style={sectionStyle}>
      <h2 style={{ margin: "0 0 0.5rem", fontSize: "0.9rem", color: "#0f172a" }}>
        {title}
      </h2>
      {children}
    </section>
  );
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
      }}
    >
      {getCanonicalSidecarAppliedFlagLabel(value, context, promotionStatus)}
    </span>
  );
}

function SafetyBanner() {
  return (
    <BannerRoot>
      <strong>PREVIEW ONLY — NO MATCHRESULT WRITE</strong>
      <BannerLine>
        Apply blocked until Gate 12 PASS, Grafana import, and PM/Ops signoff (P7.10-r8).
      </BannerLine>
      <BannerLine>This page does not change user-visible matching results.</BannerLine>
    </BannerRoot>
  );
}

function BannerRoot({ children }) {
  return (
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
        fontSize: "0.78rem",
        color: "#991b1b",
      }}
    >
      {children}
    </div>
  );
}

function BannerLine({ children }) {
  return <div style={{ marginTop: "0.2rem" }}>{children}</div>;
}

function PreviewErrorAlert({ previewError, apiDisabled }) {
  return (
    <div
      role="alert"
      style={{
        padding: "0.65rem 0.75rem",
        borderRadius: 8,
        marginBottom: "0.75rem",
        fontSize: "0.85rem",
        background: "#f8fafc",
        border: "1px solid #cbd5e1",
        color: "#475569",
      }}
    >
      <strong>Apply preview error.</strong> {previewError}
      {!apiDisabled ? (
        <div style={{ marginTop: "0.25rem", fontSize: "0.72rem" }}>
          Sidecar detail may still be shown when available.
        </div>
      ) : null}
    </div>
  );
}

function ErrorAlerts({ detailError, previewError, apiDisabled, permissionDenied }) {
  return (
    <>
      {detailError ? (
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
        </div>
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
  const [loading, setLoading] = useState(true);
  const [detailError, setDetailError] = useState("");
  const [previewError, setPreviewError] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setDetailError("");
    setPreviewError("");
    try {
      const [detailResult, previewResult] = await Promise.allSettled([
        getP76CanonicalSidecarDetail(id),
        getP76CanonicalSidecarApplyPreview(id),
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
  const noWriteOk = isNoWriteSafetyVerified(safety);

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
    <main
      style={{
        maxWidth: 960,
        margin: "1.1rem auto",
        padding: "0 1rem",
        color: "#334155",
      }}
    >
      <SafetyBanner />

      <div
        style={{
          background: "#fffbeb",
          border: "1px solid #fbbf24",
          borderRadius: 8,
          padding: "0.5rem 0.75rem",
          marginBottom: "0.85rem",
          fontSize: "0.78rem",
          color: "#92400e",
        }}
      >
        <strong>内部 / Admin</strong> — read-only apply review · VIEW_P76_CANONICAL_REHEARSAL ·
        GET only · No Apply · No Rollback · No Promote · No MatchResult write.
      </div>

      <HeaderRow>
        <h1 style={{ margin: 0, fontSize: "1.2rem", color: "#0f172a", flex: "1 1 auto" }}>
          Canonical Apply Review
        </h1>
        <button type="button" style={btnSecondary} disabled={loading} onClick={() => void load()}>
          Refresh
        </button>
        <Link to="/admin/p76/canonical-sidecar" style={{ fontSize: "0.78rem", color: "#2563eb" }}>
          Back to sidecar list
        </Link>
        {id ? (
          <span style={{ fontSize: "0.72rem", color: "#94a3b8", fontFamily: "monospace" }}>
            {id}
          </span>
        ) : null}
      </HeaderRow>

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
        <p
          role="alert"
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            padding: "0.5rem 0.65rem",
            borderRadius: 8,
            color: "#b91c1c",
            fontWeight: 600,
            fontSize: "0.82rem",
          }}
        >
          P0: applied* flag violation on sidecar — must not mutate MatchResult / finalScore /
          worker ranking.
        </p>
      ) : null}

      {!loading && preview ? (
        <>
          <Section title="Status">
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
          </Section>

          <Section title="Decision (read-only)">
            <p style={{ margin: "0 0 0.35rem", fontSize: "0.82rem" }}>
              <strong>canApply:</strong>{" "}
              <span style={{ color: applyTone === "blocked" ? "#64748b" : "#b45309" }}>
                {preview.canApply === true ? "true (preview only)" : "false"}
              </span>
            </p>
            <p style={{ margin: 0, fontSize: "0.78rem", color: "#64748b" }}>{canApplySummary}</p>
            {blockedReasons.length > 0 ? (
              <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.1rem", fontSize: "0.75rem" }}>
                {blockedReasons.map((r) => (
                  <li key={r}>{getBlockedReasonLabel(r)}</li>
                ))}
              </ul>
            ) : null}
            <p
              style={{
                margin: "0.65rem 0 0",
                padding: "0.45rem 0.55rem",
                background: "#f8fafc",
                border: "1px dashed #cbd5e1",
                borderRadius: 6,
                fontSize: "0.72rem",
                color: "#64748b",
              }}
            >
              Apply hidden until P7.10-r8 + signoff. This page performs GET requests only.
            </p>
          </Section>
        </>
      ) : null}

      {!loading && !detailError && row ? (
        <Section title="B. Sidecar summary">
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
        </Section>
      ) : null}

      {!loading && preview ? (
        <>
          <Section title="C. Current MatchResult">
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
              <p style={{ fontSize: "0.78rem", color: "#64748b", margin: 0 }}>
                No MatchResult baseline in preview (see gate: missing_match_result).
              </p>
            )}
          </Section>

          <Section title="D. Proposed change">
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
              <p style={{ margin: 0, fontSize: "0.78rem" }}>—</p>
            )}
          </Section>

          <Section title="E. Gate results">
            {gateResults.length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>gate</th>
                      <th style={th}>pass</th>
                      <th style={th}>blockedReason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gateResults.map((g) => (
                      <tr key={g.id}>
                        <td style={td}>{g.id}</td>
                        <td style={td}>{g.pass ? "pass" : "fail"}</td>
                        <td style={td}>
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
              <p style={{ margin: 0, fontSize: "0.78rem" }}>No gate results.</p>
            )}
          </Section>

          <Section title="F. Rollback preview">
            {rollback ? (
              <>
                <DetailGrid
                  items={[
                    [
                      "snapshotAvailable",
                      rollback.snapshotAvailable ? "yes" : "no",
                    ],
                    [
                      "rollbackTokenRequired",
                      rollback.rollbackTokenRequired ? "yes" : "no",
                    ],
                    [
                      "rollbackTokenPreview",
                      getRollbackTokenDisplay(rollback.rollbackTokenPreview),
                    ],
                    ["rollbackExpiresAt", "—"],
                    ["rollbackScope", "—"],
                  ]}
                />
                <p style={{ margin: "0.5rem 0 0", fontSize: "0.72rem", color: "#64748b" }}>
                  Rollback snapshot preview pending — dry-run snapshot GET not wired in r7i.
                </p>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: "0.78rem" }}>—</p>
            )}
          </Section>

          <Section title="G. No-write safety">
            {!noWriteOk ? (
              <p
                role="alert"
                style={{
                  margin: "0 0 0.5rem",
                  color: "#b91c1c",
                  fontWeight: 600,
                  fontSize: "0.8rem",
                }}
              >
                {getNoWriteSafetyLabel(safety)}
              </p>
            ) : (
              <StatusChip label={getNoWriteSafetyLabel(safety)} tone="ok" />
            )}
            <DetailGrid
              items={getSafetyFlagRows(safety).map(({ key, value, ok }) => [
                key,
                <span key={key} style={{ color: ok ? "#15803d" : "#b91c1c" }}>
                  {value === false ? "false ✓" : String(value)}
                </span>,
              ])}
            />
          </Section>
        </>
      ) : null}

      {!loading && !previewError && !preview && !detailError ? (
        <p style={{ fontSize: "0.82rem", color: "#64748b" }}>Apply preview unavailable.</p>
      ) : null}
    </main>
  );
}

function HeaderRow({ children }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "0.5rem",
        alignItems: "center",
        marginBottom: "0.75rem",
      }}
    >
      {children}
    </div>
  );
}
