import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import LoadingState from "../components/common/LoadingState";
import UserIdWithName from "../components/common/UserIdWithName";
import { getQuestionnaireProfile } from "../api/questionnaire";
import { resolveUserId } from "../utils/resolveUserId";
import { useAdminAccess } from "../hooks/useAdminAccess";
import { toFriendlyUserMessage } from "../utils/friendlyErrors";
import DimensionVisualRow, {
  DimensionGroupSummary,
} from "../components/questionnaire/DimensionVisualRow";
import { getBranchCopyLine } from "../utils/questionnaireProfileCopy";
import {
  AXIS_LABELS,
  G1R_AXIS_KEYS,
  buildDimensionRows,
  groupDimensionRows,
  pickNotableRows,
} from "../utils/questionnaireProfileDisplay";

const BRANCH_LETTERS = ["A", "B", "C", "D", "E"];

const QP_SCOPED_CSS = `
.qp-page {
  max-width: 560px;
  margin: 0 auto;
  padding: 1.5rem 1rem 2.5rem;
}
.qp-page__title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #fff;
  margin: 0 0 0.4rem;
  letter-spacing: 0.02em;
}
.qp-page__lead {
  margin: 0 0 1rem;
  font-size: 0.95rem;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.72);
}
.qp-page__nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.65rem;
  margin-bottom: 1.25rem;
  font-size: 0.85rem;
}
.qp-page__nav a {
  color: rgba(255, 255, 255, 0.8);
  text-decoration: none;
  font-weight: 500;
}
.qp-page__nav a:hover {
  color: #fff;
}
.qp-section {
  margin-bottom: 1.25rem;
  padding: 1.1rem 1rem 1.2rem;
  border-radius: 1.25rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: linear-gradient(
    165deg,
    rgba(255, 255, 255, 0.055) 0%,
    rgba(255, 255, 255, 0.02) 55%,
    rgba(0, 0, 0, 0.08) 100%
  );
}
.qp-section h2 {
  margin: 0 0 0.75rem;
  font-size: 1.2rem;
  font-weight: 700;
  color: #fff;
}
.qp-hero-badge {
  display: inline-block;
  margin: 0 0 0.45rem;
  padding: 0.2rem 0.55rem;
  border-radius: 9999px;
  border: 1px solid rgba(196, 181, 253, 0.45);
  background: rgba(139, 92, 246, 0.18);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: rgba(233, 213, 255, 0.95);
}
.qp-section--rare {
  border-radius: 0.85rem;
  padding: 0.15rem 0 0;
}
.qp-hero-name {
  margin: 0 0 0.4rem;
  font-size: 1.65rem;
  font-weight: 800;
  color: #fff;
  line-height: 1.25;
}
.qp-hero-sub {
  margin: 0 0 0.65rem;
  font-size: 0.95rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.72);
}
.qp-explain-title {
  margin: 0 0 0.5rem;
  font-size: 1.08rem;
  font-weight: 700;
  color: #fff;
}
.qp-explain-body {
  margin: 0;
  font-size: 1rem;
  line-height: 1.75;
  color: rgba(255, 255, 255, 0.92);
}
.qp-confidence {
  margin: 0;
  font-size: 0.88rem;
  color: rgba(255, 255, 255, 0.65);
}
.qp-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.5rem;
}
.qp-chip {
  padding: 0.4rem 0.8rem;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
  font-size: 0.88rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.92);
}
.qp-candidate-list {
  margin: 0.65rem 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}
.qp-candidate-item {
  padding: 0.65rem 0.75rem;
  border-radius: 0.85rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.12);
}
.qp-candidate-item__name {
  margin: 0 0 0.2rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: #fff;
}
.qp-candidate-item__meta {
  margin: 0;
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.45);
}
.qp-candidate-item__evidence {
  margin: 0.35rem 0 0;
  padding: 0;
  list-style: none;
  font-size: 0.8rem;
  line-height: 1.45;
  color: rgba(255, 255, 255, 0.62);
}
.qp-candidate-item__evidence li + li {
  margin-top: 0.15rem;
}
.qp-hero-meta {
  margin: 0 0 0.85rem;
  font-size: 0.9rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.62);
}
.qp-shadow-line {
  margin: 0.65rem 0 0;
  font-size: 0.92rem;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.75);
}
.qp-dim-group {
  margin-bottom: 0.85rem;
  border-radius: 0.85rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.1);
  overflow: hidden;
}
.qp-dim-group--highlight {
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
}
.qp-dim-group__title {
  margin: 0;
  padding: 0.65rem 0.85rem 0.45rem;
  font-size: 0.92rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.88);
}
.qp-dim-group > summary {
  padding: 0.65rem 0.85rem;
  cursor: pointer;
  list-style: none;
}
.qp-dim-group > summary::-webkit-details-marker {
  display: none;
}
.qp-dim-group__summary-inner {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  width: 100%;
}
.qp-dim-group__summary-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 0.55rem;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.92);
  flex-shrink: 0;
}
.qp-dim-group__summary-text {
  flex: 1;
  font-size: 0.95rem;
  font-weight: 700;
  color: #fff;
}
.qp-dim-group__summary-count {
  font-size: 0.8rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.5);
}
.qp-dim-group__body {
  padding: 0 0.85rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.qp-dim-row--visual {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  padding: 0.75rem 0.8rem;
  border-radius: 0.85rem;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.qp-dim-row--linked {
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 255, 255, 0.14);
}
.qp-dim-row__icon-wrap {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 0.75rem;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.12);
}
.qp-dim-row__icon {
  color: rgba(255, 255, 255, 0.95);
}
.qp-dim-row__content {
  flex: 1;
  min-width: 0;
}
.qp-dim-row__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
}
.qp-dim-row__name {
  font-size: 1rem;
  font-weight: 700;
  color: #fff;
}
.qp-dim-row__badge {
  flex-shrink: 0;
  padding: 0.2rem 0.55rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
}
.qp-dim-row__badge--open {
  border-style: dashed;
  color: rgba(255, 255, 255, 0.65);
}
.qp-strength-meter {
  display: flex;
  gap: 0.3rem;
  margin-bottom: 0.45rem;
  align-items: flex-end;
  height: 1.35rem;
  max-width: 8.5rem;
}
.qp-strength-meter__bar {
  flex: 1;
  width: 0.55rem;
  min-height: 0.28rem;
  border-radius: 0.2rem 0.2rem 0.1rem 0.1rem;
  background: rgba(255, 255, 255, 0.14);
}
.qp-strength-meter__bar:nth-child(1) { height: 28%; }
.qp-strength-meter__bar:nth-child(2) { height: 46%; }
.qp-strength-meter__bar:nth-child(3) { height: 64%; }
.qp-strength-meter__bar:nth-child(4) { height: 82%; }
.qp-strength-meter__bar:nth-child(5) { height: 100%; }
.qp-strength-meter__bar--on {
  background: rgba(255, 255, 255, 0.88);
}
.qp-strength-meter--uncertain .qp-strength-meter__bar--on {
  background: rgba(255, 255, 255, 0.45);
}
.qp-strength-meter--uncertain .qp-strength-meter__bar:nth-child(n + 3) {
  background: rgba(255, 255, 255, 0.2);
}
.qp-dim-row__text {
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.88);
}
.qp-dim-expand {
  display: block;
  width: 100%;
  margin-top: 0.35rem;
  padding: 0.65rem 0.85rem;
  border-radius: 0.65rem;
  border: 1px dashed rgba(255, 255, 255, 0.22);
  background: transparent;
  color: rgba(255, 255, 255, 0.78);
  font-size: 0.92rem;
  font-weight: 500;
  cursor: pointer;
}
.qp-dim-expand:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
}
.qp-section-hint {
  margin: -0.35rem 0 0.85rem;
  font-size: 0.88rem;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.58);
}
.qp-tech-id {
  margin: 0 0 0.75rem;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.38);
  font-family: ui-monospace, monospace;
}
.qp-admin-details {
  margin-top: 0.75rem;
  border-radius: 0.85rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.12);
}
.qp-admin-details > summary {
  padding: 0.6rem 0.75rem;
  cursor: pointer;
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.55);
  list-style: none;
}
.qp-admin-details > summary::-webkit-details-marker {
  display: none;
}
.qp-admin-details__body {
  padding: 0 0.75rem 0.75rem;
}
.qp-pre {
  margin: 0;
  padding: 0.65rem 0.75rem;
  max-height: 240px;
  overflow: auto;
  border-radius: 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.2);
  font-size: 0.72rem;
  line-height: 1.45;
  color: rgba(255, 255, 255, 0.72);
  white-space: pre-wrap;
  word-break: break-word;
}
.qp-debug-table-wrap {
  overflow-x: auto;
  margin-top: 0.5rem;
}
.qp-debug-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.68rem;
  color: rgba(255, 255, 255, 0.72);
}
.qp-debug-table th,
.qp-debug-table td {
  padding: 0.25rem 0.3rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  text-align: right;
}
.qp-debug-table th:first-child,
.qp-debug-table td:first-child {
  text-align: left;
  white-space: nowrap;
}
.qp-updated {
  margin: 1rem 0 0;
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.38);
}
.qp-actions {
  margin-top: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
`;

function fmtRatio(r) {
  if (r == null || Number.isNaN(r)) return null;
  return `${(r * 100).toFixed(0)}%`;
}

function fmtConfidence(c) {
  if (c == null || Number.isNaN(c)) return null;
  return `${Math.round(Math.min(1, Math.max(0, c)) * 100)}%`;
}

function formatUpdatedAt(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function candidateForDisplayPrimary(displayPrimary, candidates) {
  if (!displayPrimary?.id) return null;
  return (candidates ?? []).find((c) => c.id === displayPrimary.id) ?? null;
}

function displayPrimarySubtitle(displayPrimary, candidates, rareLabel) {
  if (!displayPrimary) return "";
  if (displayPrimary.source === "primary") return "核心人格类型";
  if (displayPrimary.source === "rare") {
    const ratio =
      rareLabel?.matchRatio != null
        ? fmtRatio(rareLabel.matchRatio)
        : null;
    return ratio
      ? `隐藏款 · 主池外稀有人格 · 呼应度 ${ratio}`
      : "隐藏款 · 主池外稀有人格";
  }
  if (displayPrimary.source === "fallback") {
    return "各维度倾向仍较分散，以下为对照线索";
  }
  const meta = candidateForDisplayPrimary(displayPrimary, candidates);
  if (meta?.matchRatio != null) {
    return `与你当前的回答最接近 · 契合度 ${fmtRatio(meta.matchRatio) ?? "—"}`;
  }
  return "与你当前的回答最接近的类型";
}

function otherCandidatesThanPrimary(displayPrimary, candidates) {
  if (!displayPrimary?.id) return candidates ?? [];
  return (candidates ?? []).filter((c) => c.id !== displayPrimary.id);
}

function buildMatchedAxisHighlightSet(labels, displayPrimary) {
  const s = new Set();
  if (!labels) return s;
  const add = (axes) => {
    if (!axes) return;
    for (const m of axes) {
      s.add(`${m.axisId}:${m.branch}`);
    }
  };
  add(labels.primary?.matchedAxes);
  add(displayPrimary?.matchedAxes);
  for (const c of labels.candidates ?? []) {
    add(c.matchedAxes);
  }
  for (const st of labels.styleLabels ?? []) {
    add(st.matchedAxes);
  }
  return s;
}

function axisDimensionSummary(axisId, prof, uncertain) {
  const dom = prof?.dominantBranch ?? null;
  const unc = uncertain ?? prof?.uncertainBranches ?? [];
  if (dom) {
    return { summary: getBranchCopyLine(axisId, dom) };
  }
  if (unc.length) {
    const parts = unc.map((b) => getBranchCopyLine(axisId, b));
    return {
      summary:
        parts.length === 1
          ? parts[0]
          : `多种可能并存：${parts.join("；")}`,
    };
  }
  return { summary: "题目覆盖不足，暂时无法判断。" };
}

function DimensionRowVisual({ row }) {
  const summary = axisDimensionSummary(row.axisId, row.prof, row.uncertain);
  return <DimensionVisualRow row={row} summary={summary} />;
}

function ProfileHeroSection({
  displayPrimary,
  labels,
  overallExplanation,
  confidencePct,
  showDebug,
}) {
  const styles = labels?.styleLabels ?? [];
  const candidates = labels?.candidates ?? [];
  const otherCandidates = otherCandidatesThanPrimary(displayPrimary, candidates);
  const explainPara = overallExplanation?.paragraph?.trim() || null;
  const explainTitle = overallExplanation?.title?.trim() || null;
  const showExplainTitle =
    explainTitle &&
    displayPrimary?.name &&
    explainTitle !== displayPrimary.name &&
    !explainTitle.includes(displayPrimary.name);

  const isRare = displayPrimary?.source === "rare";

  return (
    <section className={`qp-section${isRare ? " qp-section--rare" : ""}`}>
      <h2>你的关系画像</h2>
      {displayPrimary ? (
        <>
          {isRare ? (
            <p className="qp-hero-badge" aria-label="隐藏款人格">
              隐藏款
            </p>
          ) : null}
          <p className="qp-hero-name">{displayPrimary.name}</p>
          <p className="qp-hero-sub">
            {displayPrimarySubtitle(
              displayPrimary,
              candidates,
              labels?.rareLabel,
            )}
            {showDebug ? ` · ${displayPrimary.id}` : ""}
          </p>
        </>
      ) : null}
      {confidencePct != null ? (
        <p className="qp-hero-meta">问卷完成度 {confidencePct}</p>
      ) : null}
      {showExplainTitle ? (
        <p className="qp-explain-title" style={{ marginTop: "0.65rem" }}>
          {explainTitle}
        </p>
      ) : null}
      {explainPara ? <p className="qp-explain-body">{explainPara}</p> : null}
      {otherCandidates.length > 0 ? (
        <p className="qp-shadow-line">
          也有点像：
          {otherCandidates.map((c) => c.name).join("、")}
        </p>
      ) : null}
      {styles.length > 0 ? (
        <div className="qp-chip-row" aria-label="相处风格">
          {styles.map((s) => (
            <span key={s.id} className="qp-chip" title={showDebug ? s.id : undefined}>
              {s.name}
            </span>
          ))}
        </div>
      ) : null}
      {showDebug && labels?.primary ? (
        <details className="qp-admin-details">
          <summary>强主标签（调试）</summary>
          <div className="qp-admin-details__body">
            <pre className="qp-pre">{JSON.stringify(labels.primary, null, 2)}</pre>
          </div>
        </details>
      ) : null}
    </section>
  );
}

function DimensionsOverviewSection({
  dimProfiles,
  uncertainByAxis,
  highlightSet,
  displayPrimaryName,
}) {
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(
    () => buildDimensionRows({ dimProfiles, uncertainByAxis, highlightSet }),
    [dimProfiles, uncertainByAxis, highlightSet],
  );
  const notable = useMemo(() => pickNotableRows(rows, { max: 8 }), [rows]);
  const grouped = useMemo(() => groupDimensionRows(rows), [rows]);
  const linkedNotable = notable.filter((r) => r.linked);
  const otherNotable = notable.filter((r) => !r.linked);

  if (rows.length === 0) return null;

  return (
    <section className="qp-section">
      <h2>关键倾向</h2>
      <p className="qp-section-hint">
        左侧图标代表主题，下方五格表示强度（满格 = 较明显）。
      </p>

      {!showAll ? (
        <>
          {displayPrimaryName && linkedNotable.length > 0 ? (
            <div className="qp-dim-group qp-dim-group--highlight">
              <p className="qp-dim-group__title">和「{displayPrimaryName}」最呼应</p>
              <div className="qp-dim-group__body">
                {linkedNotable.map((row) => (
                  <DimensionRowVisual key={row.axisKey} row={row} />
                ))}
              </div>
            </div>
          ) : null}
          {otherNotable.length > 0 ? (
            <div className="qp-dim-group__body" style={{ marginBottom: "0.5rem" }}>
              {otherNotable.map((row) => (
                <DimensionRowVisual key={row.axisKey} row={row} />
              ))}
            </div>
          ) : null}
          {rows.length > notable.length ? (
            <button
              type="button"
              className="qp-dim-expand"
              onClick={() => setShowAll(true)}
            >
              查看全部分组（共 {rows.length} 项）
            </button>
          ) : null}
        </>
      ) : (
        <>
          {grouped.map((g) => (
            <details key={g.id} className="qp-dim-group" open>
              <summary>
                <DimensionGroupSummary
                  groupId={g.id}
                  title={g.title}
                  count={g.items.length}
                />
              </summary>
              <div className="qp-dim-group__body">
                {g.items.map((row) => (
                  <DimensionRowVisual key={row.axisKey} row={row} />
                ))}
              </div>
            </details>
          ))}
          <button
            type="button"
            className="qp-dim-expand"
            onClick={() => setShowAll(false)}
          >
            收起，只看要点
          </button>
        </>
      )}
    </section>
  );
}

function DebugBranchTable({ dimProfiles, uncertainByAxis, highlightSet }) {
  return (
    <div className="qp-debug-table-wrap">
      <table className="qp-debug-table">
        <thead>
          <tr>
            <th>维</th>
            <th>判定</th>
            {BRANCH_LETTERS.map((L) => (
              <th key={L}>{L}:r</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {G1R_AXIS_KEYS.map((key, idx) => {
            const axisId = idx + 1;
            const sk = String(axisId);
            const prof = dimProfiles?.[sk];
            const dom = prof?.dominantBranch ?? null;
            const unc = uncertainByAxis?.[sk] ?? [];
            let resultCell = "—";
            if (dom) resultCell = `dominant ${dom}`;
            else if (unc.length) resultCell = `uncertain ${unc.join(",")}`;
            return (
              <tr key={key}>
                <td>
                  {axisId} {AXIS_LABELS[key]}
                </td>
                <td>{resultCell}</td>
                {BRANCH_LETTERS.map((L) => {
                  const rate = prof?.branches?.[L]?.rate ?? null;
                  const hi = highlightSet.has(`${axisId}:${L}`);
                  return (
                    <td
                      key={L}
                      style={
                        hi
                          ? { background: "rgba(255, 107, 157, 0.2)", fontWeight: 700 }
                          : undefined
                      }
                    >
                      {fmtRatio(rate) ?? "—"}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function QuestionnaireProfilePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);
  const isDebugMode = useMemo(() => searchParams.get("debug") === "1", [searchParams]);
  const { isAdmin } = useAdminAccess();
  const showDebug = isDebugMode && isAdmin;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [payload, setPayload] = useState(null);

  const load = useCallback(async () => {
    if (!userId) {
      setPayload(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    setPayload(null);
    try {
      const row = await getQuestionnaireProfile(userId);
      setPayload(row);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const highlightSet = useMemo(
    () => buildMatchedAxisHighlightSet(payload?.labels, payload?.displayPrimary),
    [payload],
  );

  const profile = payload?.profile ?? null;
  const dimProfiles = payload?.dimensionBranchProfiles ?? null;
  const uncertainByAxis = payload?.uncertainBranchesByAxis ?? null;
  const labels = payload?.labels ?? null;
  const displayPrimary = payload?.displayPrimary ?? null;
  const overallExplanation = payload?.overallExplanation ?? null;

  const emptyNoRow = userId && !loading && !error && payload === null;
  const confidencePct = fmtConfidence(profile?.confidence);

  return (
    <main className="app-themed-content qp-page">
      <style>{QP_SCOPED_CSS}</style>
      <h1 className="qp-page__title">关系画像</h1>
      <p className="qp-page__lead">
        根据你的问卷回答整理而成，帮助你理解自己在亲密关系中的倾向与风格。
      </p>
      {showDebug ? (
        <p className="qp-tech-id">
          userId: <UserIdWithName userId={userId} />
        </p>
      ) : null}
      <nav className="qp-page__nav" aria-label="快捷入口">
        <Link to="/home">首页</Link>
        <span aria-hidden>·</span>
        <Link to={userId ? `/questionnaire?userId=${encodeURIComponent(userId)}` : "/questionnaire"}>
          问卷
        </Link>
        <span aria-hidden>·</span>
        <Link to={userId ? `/account?userId=${encodeURIComponent(userId)}` : "/account"}>
          我的资料
        </Link>
      </nav>

      {!userId ? (
        <p className="chat-status-err" role="alert">
          {toFriendlyUserMessage("缺少 userId")}
        </p>
      ) : null}

      {loading ? <LoadingState label="加载画像中…" /> : null}

      {error ? (
        <p className="chat-status-err" role="alert">
          {toFriendlyUserMessage(error.message)}
        </p>
      ) : null}

      {emptyNoRow ? (
        <section className="qp-section">
          <p className="qp-explain-body" role="status">
            还没有生成关系画像，先完成问卷吧。
          </p>
          <div className="account-actions" style={{ marginTop: "0.75rem" }}>
            <Link
              to={userId ? `/questionnaire?userId=${encodeURIComponent(userId)}` : "/questionnaire"}
              className="btn-primary text-sm py-2.5 px-5 inline-block no-underline"
            >
              去填问卷
            </Link>
          </div>
        </section>
      ) : null}

      {userId && !loading && !error && profile && payload ? (
        <>
          <ProfileHeroSection
            displayPrimary={displayPrimary}
            labels={labels}
            overallExplanation={overallExplanation}
            confidencePct={confidencePct}
            showDebug={showDebug}
          />

          <DimensionsOverviewSection
            dimProfiles={dimProfiles}
            uncertainByAxis={uncertainByAxis}
            highlightSet={highlightSet}
            displayPrimaryName={displayPrimary?.name ?? null}
          />

          {showDebug ? (
            <>
              <details className="qp-admin-details">
                <summary>分支命中率表（管理员调试）</summary>
                <div className="qp-admin-details__body">
                  <DebugBranchTable
                    dimProfiles={dimProfiles}
                    uncertainByAxis={uncertainByAxis}
                    highlightSet={highlightSet}
                  />
                </div>
              </details>
              <details className="qp-admin-details" style={{ marginTop: "0.65rem" }}>
                <summary>二十轴连续分数（管理员调试）</summary>
                <div className="qp-admin-details__body">
                  <pre className="qp-pre">
                    {JSON.stringify(
                      Object.fromEntries(
                        G1R_AXIS_KEYS.map((k) => [k, profile[k] ?? null]),
                      ),
                      null,
                      2,
                    )}
                  </pre>
                </div>
              </details>
              <details className="qp-admin-details" style={{ marginTop: "0.65rem" }}>
                <summary>完整 API 载荷（管理员调试）</summary>
                <div className="qp-admin-details__body">
                  <pre className="qp-pre">{JSON.stringify(payload, null, 2)}</pre>
                </div>
              </details>
            </>
          ) : null}

          <div className="qp-actions">
            <button
              type="button"
              className="btn-primary text-sm py-2.5 px-5"
              onClick={() =>
                navigate(`/matching-waiting?userId=${encodeURIComponent(userId)}`)
              }
            >
              前往匹配
            </button>
          </div>

          {profile.updatedAt ? (
            <p className="qp-updated">更新于 {formatUpdatedAt(profile.updatedAt)}</p>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
