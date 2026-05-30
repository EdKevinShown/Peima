import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import LoadingState from "../components/common/LoadingState";
import UserIdWithName from "../components/common/UserIdWithName";
import { getQuestionnaireProfile } from "../api/questionnaire";
import { resolveUserId } from "../utils/resolveUserId";
import { useAdminAccess } from "../hooks/useAdminAccess";
import { toFriendlyUserMessage } from "../utils/friendlyErrors";
import {
  getBranchCopyLine,
  summarizeMatchedAxes,
} from "../utils/questionnaireProfileCopy";

const G1R_AXIS_KEYS = [
  "attachmentStyle",
  "emotionalExpression",
  "communicationStyle",
  "conflictHandling",
  "loveLanguage",
  "securityNeed",
  "controlNeed",
  "independence",
  "loyaltyView",
  "jealousyTendency",
  "moneyAttitude",
  "careerPriority",
  "lifePace",
  "socialNeed",
  "emotionalStability",
  "sexualValues",
  "familyView",
  "marriageExpectation",
  "childrenIntent",
  "riskPreference",
];

const BRANCH_LETTERS = ["A", "B", "C", "D", "E"];

const AXIS_LABELS = {
  attachmentStyle: "依恋风格",
  emotionalExpression: "情绪表达",
  communicationStyle: "沟通风格",
  conflictHandling: "冲突处理",
  loveLanguage: "爱的语言",
  securityNeed: "安全感需求",
  controlNeed: "控制需求",
  independence: "独立性",
  loyaltyView: "忠诚观",
  jealousyTendency: "嫉妒倾向",
  moneyAttitude: "金钱观",
  careerPriority: "事业优先级",
  lifePace: "生活节奏",
  socialNeed: "社交需求",
  emotionalStability: "情绪稳定性",
  sexualValues: "性价值观",
  familyView: "家庭观",
  marriageExpectation: "婚姻期待",
  childrenIntent: "生育意愿",
  riskPreference: "风险偏好",
};

const QP_SCOPED_CSS = `
.qp-page {
  max-width: 560px;
  margin: 0 auto;
  padding: 1.5rem 1rem 2.5rem;
}
.qp-page__title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #fff;
  margin: 0 0 0.35rem;
}
.qp-page__lead {
  margin: 0 0 1rem;
  font-size: 0.86rem;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.52);
}
.qp-page__nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.65rem;
  margin-bottom: 1.25rem;
  font-size: 0.85rem;
}
.qp-page__nav a {
  color: rgba(255, 255, 255, 0.72);
  text-decoration: none;
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
  margin: 0 0 0.65rem;
  font-size: 1.05rem;
  font-weight: 600;
  color: #fff;
}
.qp-hero-name {
  margin: 0 0 0.35rem;
  font-size: 1.35rem;
  font-weight: 700;
  color: #fff;
  line-height: 1.3;
}
.qp-hero-sub {
  margin: 0 0 0.75rem;
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.48);
}
.qp-explain-title {
  margin: 0 0 0.45rem;
  font-size: 1rem;
  font-weight: 600;
  color: #fff;
}
.qp-explain-body {
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.78);
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
  padding: 0.35rem 0.7rem;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.82);
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
.qp-dim-list {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
.qp-dim-card {
  padding: 0.75rem 0.85rem;
  border-radius: 0.85rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.14);
}
.qp-dim-card--linked {
  border-color: rgba(255, 107, 157, 0.28);
  box-shadow: inset 0 0 0 1px rgba(255, 107, 157, 0.12);
}
.qp-dim-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
}
.qp-dim-card__name {
  font-size: 0.9rem;
  font-weight: 600;
  color: #fff;
}
.qp-dim-card__badge {
  flex-shrink: 0;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.72rem;
  font-weight: 600;
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.72);
  background: rgba(255, 255, 255, 0.06);
}
.qp-dim-card__badge--clear {
  border-color: rgba(255, 107, 157, 0.35);
  color: #ffd4e8;
  background: rgba(255, 107, 157, 0.15);
}
.qp-dim-card__badge--open {
  color: rgba(255, 255, 255, 0.5);
}
.qp-dim-card__summary {
  margin: 0 0 0.55rem;
  font-size: 0.82rem;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.68);
}
.qp-dim-bars {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.qp-dim-bar-row {
  display: grid;
  grid-template-columns: 1.25rem 1fr 2.25rem;
  gap: 0.4rem;
  align-items: center;
}
.qp-dim-bar-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.45);
  text-align: center;
}
.qp-dim-bar-label--on {
  color: #ffd4e8;
}
.qp-dim-bar-track {
  height: 6px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.qp-dim-bar-fill {
  height: 100%;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.22);
  min-width: 2px;
  transition: width 0.2s ease;
}
.qp-dim-bar-fill--dominant {
  background: linear-gradient(90deg, rgba(255, 107, 157, 0.85), rgba(196, 77, 255, 0.75));
}
.qp-dim-bar-fill--linked {
  background: linear-gradient(90deg, rgba(255, 180, 120, 0.75), rgba(255, 107, 157, 0.65));
}
.qp-dim-bar-pct {
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.42);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.qp-section-hint {
  margin: -0.35rem 0 0.75rem;
  font-size: 0.8rem;
  line-height: 1.45;
  color: rgba(255, 255, 255, 0.45);
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

function displayPrimarySubtitle(displayPrimary, candidates) {
  if (!displayPrimary) return "";
  if (displayPrimary.source === "primary") return "核心人格类型";
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

function matchedAxesFingerprint(axes) {
  return (axes ?? [])
    .map((m) => `${m.axisId}:${m.branch}`)
    .sort()
    .join("|");
}

function axesEvidenceSameAsPrimary(candidate, displayPrimary) {
  if (!displayPrimary?.matchedAxes?.length) return false;
  return (
    matchedAxesFingerprint(candidate.matchedAxes) ===
    matchedAxesFingerprint(displayPrimary.matchedAxes)
  );
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
    return {
      badge: `倾向 ${dom}`,
      badgeKind: "clear",
      summary: getBranchCopyLine(axisId, dom),
    };
  }
  if (unc.length) {
    const parts = unc.map((b) => getBranchCopyLine(axisId, b));
    return {
      badge: "尚在权衡",
      badgeKind: "open",
      summary:
        parts.length === 1
          ? parts[0]
          : `你在这一维上呈现多种可能：${parts.join("；")}`,
    };
  }
  return {
    badge: "待补充",
    badgeKind: "open",
    summary: "这一维的题目覆盖还不够，暂时无法给出明确倾向。",
  };
}

function DimensionCard({ axisId, axisKey, prof, uncertain, highlightSet }) {
  const summary = axisDimensionSummary(axisId, prof, uncertain);
  const dom = prof?.dominantBranch ?? null;
  const linked = BRANCH_LETTERS.some((L) => highlightSet.has(`${axisId}:${L}`));

  const barRows = BRANCH_LETTERS.map((L) => {
    const branch = prof?.branches?.[L];
    const opp = branch?.opportunities ?? 0;
    if (opp <= 0) return null;
    const rate = branch?.rate ?? 0;
    const pct = Math.round(Math.max(0, Math.min(1, rate)) * 100);
    const isDom = dom === L;
    const isLinked = highlightSet.has(`${axisId}:${L}`);
    let fillClass = "qp-dim-bar-fill";
    if (isDom) fillClass += " qp-dim-bar-fill--dominant";
    else if (isLinked) fillClass += " qp-dim-bar-fill--linked";
    return { L, pct, fillClass, isDom, isLinked };
  }).filter(Boolean);

  const maxPct = Math.max(1, ...barRows.map((r) => r.pct));

  return (
    <article className={`qp-dim-card${linked ? " qp-dim-card--linked" : ""}`}>
      <div className="qp-dim-card__head">
        <span className="qp-dim-card__name">{AXIS_LABELS[axisKey]}</span>
        <span
          className={`qp-dim-card__badge${summary.badgeKind === "clear" ? " qp-dim-card__badge--clear" : " qp-dim-card__badge--open"}`}
        >
          {summary.badge}
        </span>
      </div>
      <p className="qp-dim-card__summary">{summary.summary}</p>
      {barRows.length > 0 ? (
        <div className="qp-dim-bars" aria-label={`${AXIS_LABELS[axisKey]} 各倾向强度`}>
          {barRows.map(({ L, pct, fillClass, isDom, isLinked }) => (
            <div key={L} className="qp-dim-bar-row">
              <span
                className={`qp-dim-bar-label${isDom || isLinked ? " qp-dim-bar-label--on" : ""}`}
              >
                {L}
              </span>
              <div className="qp-dim-bar-track">
                <div
                  className={fillClass}
                  style={{ width: `${(pct / maxPct) * 100}%` }}
                />
              </div>
              <span className="qp-dim-bar-pct">{pct}%</span>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function LabelsSection({ displayPrimary, labels, showDebug }) {
  const styles = labels?.styleLabels ?? [];
  const candidates = labels?.candidates ?? [];
  const otherCandidates = otherCandidatesThanPrimary(displayPrimary, candidates);

  return (
    <section className="qp-section">
      <h2>你的关系画像</h2>
      {displayPrimary ? (
        <>
          <p className="qp-hero-name">{displayPrimary.name}</p>
          <p className="qp-hero-sub">
            {displayPrimarySubtitle(displayPrimary, candidates)}
            {showDebug ? ` · ${displayPrimary.id}` : ""}
          </p>
        </>
      ) : null}

      {displayPrimary?.matchedAxes?.length ? (
        <>
          <p className="qp-section-hint" style={{ marginTop: "0.5rem", marginBottom: "0.35rem" }}>
            主要依据
          </p>
          <ul className="qp-candidate-item__evidence" style={{ marginBottom: "0.65rem" }}>
            {summarizeMatchedAxes(displayPrimary.matchedAxes).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      ) : null}

      {otherCandidates.length > 0 ? (
        <>
          <p className="qp-section-hint" style={{ marginTop: 0 }}>
            {displayPrimary?.source === "primary"
              ? "你的回答里也能看到这些类型的影子："
              : "此外，这些类型也与你有部分重合："}
          </p>
          <ul className="qp-candidate-list">
            {otherCandidates.map((c) => {
              const sameEvidence = axesEvidenceSameAsPrimary(c, displayPrimary);
              return (
                <li key={c.id} className="qp-candidate-item">
                  <p className="qp-candidate-item__name">{c.name}</p>
                  <p className="qp-candidate-item__meta">
                    契合度 {fmtRatio(c.matchRatio) ?? "—"}
                    {showDebug ? ` · ${c.id}` : ""}
                  </p>
                  {sameEvidence ? (
                    <p className="qp-candidate-item__meta" style={{ marginTop: "0.25rem" }}>
                      依据维度与上方主类型相近
                    </p>
                  ) : c.matchedAxes?.length ? (
                    <ul className="qp-candidate-item__evidence">
                      {summarizeMatchedAxes(c.matchedAxes).map((line) => (
                        <li key={`${c.id}-${line}`}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      {styles.length > 0 ? (
        <>
          <p className="qp-section-hint">相处风格侧写</p>
          <div className="qp-chip-row" aria-label="风格侧写">
            {styles.map((s) => (
              <span key={s.id} className="qp-chip" title={showDebug ? s.id : undefined}>
                {s.name}
              </span>
            ))}
          </div>
        </>
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
        <Link to="/">首页</Link>
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
          {overallExplanation ? (
            <section className="qp-section">
              <h2>整体解读</h2>
              <p className="qp-explain-title">{overallExplanation.title}</p>
              <p className="qp-explain-body">{overallExplanation.paragraph}</p>
            </section>
          ) : null}

          {confidencePct != null ? (
            <section className="qp-section">
              <h2>问卷完成度</h2>
              <p className="qp-confidence">已覆盖 {confidencePct} 的正式题目</p>
            </section>
          ) : null}

          <LabelsSection
            displayPrimary={displayPrimary}
            labels={labels}
            showDebug={showDebug}
          />

          <section className="qp-section">
            <h2>二十个维度</h2>
            <p className="qp-section-hint">
              每一行代表问卷中的一个主题。条形表示该倾向在你答案中的相对强度；高亮卡片与上方画像标签相关。
            </p>
            <div className="qp-dim-list">
              {G1R_AXIS_KEYS.map((key, idx) => {
                const axisId = idx + 1;
                const sk = String(axisId);
                return (
                  <DimensionCard
                    key={key}
                    axisId={axisId}
                    axisKey={key}
                    prof={dimProfiles?.[sk]}
                    uncertain={uncertainByAxis?.[sk]}
                    highlightSet={highlightSet}
                  />
                );
              })}
            </div>
          </section>

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
