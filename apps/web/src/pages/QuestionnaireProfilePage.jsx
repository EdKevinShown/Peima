import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import LoadingState from "../components/common/LoadingState";
import { getQuestionnaireProfile } from "../api/questionnaire";
import { resolveUserId } from "../utils/resolveUserId";

/** 与后端 G1R_PROFILE_KEYS 顺序一致 */
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

function fmtVal(v) {
  if (v == null || Number.isNaN(v)) return "暂无";
  return String(v);
}

function fmtNum(v) {
  if (v == null || Number.isNaN(v)) return "—";
  if (typeof v === "number" && !Number.isInteger(v)) return v.toFixed(3);
  return String(v);
}

function fmtRatio(r) {
  if (r == null || Number.isNaN(r)) return "—";
  return `${(r * 100).toFixed(0)}%`;
}

function buildMatchedAxisHighlightSet(labels) {
  const s = new Set();
  if (!labels) return s;
  const add = (axes) => {
    if (!axes) return;
    for (const m of axes) {
      s.add(`${m.axisId}:${m.branch}`);
    }
  };
  add(labels.primary?.matchedAxes);
  for (const c of labels.candidates ?? []) {
    add(c.matchedAxes);
  }
  for (const st of labels.styleLabels ?? []) {
    add(st.matchedAxes);
  }
  return s;
}

function branchCellStyle(axisId, letter, highlightSet) {
  const k = `${axisId}:${letter}`;
  if (!highlightSet.has(k)) return {};
  return {
    backgroundColor: "#fff3cd",
    boxShadow: "inset 0 0 0 2px #e65100",
    fontWeight: 700,
    color: "#1a1a1a",
  };
}

export default function QuestionnaireProfilePage() {
  const [searchParams] = useSearchParams();
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);

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
    () => buildMatchedAxisHighlightSet(payload?.labels),
    [payload],
  );

  const profile = payload?.profile ?? null;
  const dimProfiles = payload?.dimensionBranchProfiles ?? null;
  const uncertainByAxis = payload?.uncertainBranchesByAxis ?? null;
  const labels = payload?.labels ?? null;

  const emptyNoRow = userId && !loading && !error && payload === null;

  return (
    <main style={{ maxWidth: 1100, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.25rem" }}>问卷画像（G1-R · v3）</h1>
      <p style={{ color: "#666", fontSize: "0.88rem", marginBottom: "0.75rem" }}>
        只读 <code>GET /questionnaire/profile/:userId</code>。主区为<strong>分支累计（公平机会）</strong>与
        <strong>主标签 / 候选 / 风格</strong>；二十轴 float 在文末折叠区，仅作连续强度展示，
        <strong>不参与任何标签判定</strong>。
      </p>
      <p style={{ marginBottom: "1rem" }}>
        <Link to="/">首页</Link>
        {" · "}
        <Link to="/questionnaire">去填问卷</Link>
      </p>

      <p style={{ color: "#666", fontSize: "0.9rem", marginBottom: "0.75rem" }}>
        userId：<code>{userId || "（未设置）"}</code>
      </p>

      {!userId ? (
        <p style={{ color: "#856404", marginTop: "0.5rem" }} role="alert">
          缺少 userId：请在 URL 加 <code>?userId=...</code> 或先登录并写入{" "}
          <code>localStorage.peimaUserId</code>。
        </p>
      ) : null}

      {loading ? <LoadingState label="加载画像中…" /> : null}

      {error ? (
        <p style={{ color: "#b00020", marginTop: "0.5rem" }} role="alert">
          {error.message}
        </p>
      ) : null}

      {emptyNoRow ? (
        <p style={{ color: "#555", marginTop: "0.75rem" }} role="status">
          当前尚无问卷画像，请先完成问卷（<Link to="/questionnaire">/questionnaire</Link>
          ）。
        </p>
      ) : null}

      {userId && !loading && !error && profile && payload ? (
        <>
          <section style={{ marginTop: "1rem" }}>
            <h2 style={{ fontSize: "1.02rem", margin: "0 0 0.5rem" }}>置信度</h2>
            <p style={{ margin: 0, fontSize: "0.95rem" }}>
              <code>confidence</code>：{fmtVal(profile.confidence)}
            </p>
          </section>

          <section style={{ marginTop: "1.25rem" }}>
            <h2 style={{ fontSize: "1.02rem", margin: "0 0 0.5rem" }}>
              主标签 / 候选 / 风格
            </h2>
            <div
              style={{
                border: "1px solid #e0e0e0",
                borderRadius: 6,
                padding: "0.65rem 0.75rem",
                fontSize: "0.9rem",
              }}
            >
              <p style={{ margin: "0 0 0.5rem" }}>
                <strong>主标签</strong> <code>labels.primary</code>
                {labels?.primary ? (
                  <>
                    ：<strong>{labels.primary.name}</strong>{" "}
                    <span style={{ color: "#666" }}>({labels.primary.id})</span>
                  </>
                ) : (
                  <span style={{ color: "#666" }}>：暂无强命中（需各维高确定性 dominant 全匹配）</span>
                )}
              </p>
              {labels?.primary?.matchedAxes?.length ? (
                <p style={{ margin: "0 0 0.35rem", fontSize: "0.85rem", color: "#555" }}>
                  依据维度分支：
                  {labels.primary.matchedAxes.map((m) => (
                    <code key={`${m.axisId}-${m.branch}`} style={{ marginLeft: 6 }}>
                      {m.axisId}
                      {m.branch}
                    </code>
                  ))}
                </p>
              ) : null}

              <p style={{ margin: "0.6rem 0 0.35rem" }}>
                <strong>候选</strong> <code>labels.candidates</code>（弱命中与并列维等；阈值与条数由后端集中常量控制）
              </p>
              {!labels?.candidates?.length ? (
                <p style={{ margin: 0, color: "#666" }}>暂无</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                  {labels.candidates.map((c) => (
                    <li key={c.id} style={{ marginBottom: "0.35rem" }}>
                      <strong>{c.name}</strong>{" "}
                      <span style={{ color: "#666" }}>
                        ({c.id}) 匹配度 {fmtRatio(c.matchRatio)} · {c.matchedCount}/
                        {c.requiredCount}
                      </span>
                      {c.matchedAxes?.length ? (
                        <span style={{ fontSize: "0.82rem", display: "block", color: "#555" }}>
                          依据：
                          {c.matchedAxes.map((m) => (
                            <code key={`${c.id}-${m.axisId}-${m.branch}`} style={{ marginLeft: 4 }}>
                              {m.axisId}
                              {m.branch}
                            </code>
                          ))}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}

              <p style={{ margin: "0.6rem 0 0.35rem" }}>
                <strong>风格</strong> <code>labels.styleLabels</code>
              </p>
              {!labels?.styleLabels?.length ? (
                <p style={{ margin: 0, color: "#666" }}>
                  暂无（风格规则表与核心规则同源扩充；当前仅六条核心规则时为空）
                </p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                  {labels.styleLabels.map((s) => (
                    <li key={s.id} style={{ marginBottom: "0.35rem" }}>
                      <strong>{s.name}</strong>{" "}
                      <span style={{ color: "#666" }}>({s.id})</span>
                      {s.matchedAxes?.length ? (
                        <span style={{ fontSize: "0.82rem", display: "block", color: "#555" }}>
                          依据：
                          {s.matchedAxes.map((m) => (
                            <code key={`${s.id}-${m.axisId}-${m.branch}`} style={{ marginLeft: 4 }}>
                              {m.axisId}
                              {m.branch}
                            </code>
                          ))}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p
              style={{
                margin: "0.5rem 0 0",
                fontSize: "0.82rem",
                color: "#b45309",
                fontWeight: 600,
              }}
            >
              下方「分支明细」中，与上述标签依据（matchedAxes）一致的轴×档格已高亮。
            </p>
          </section>

          <section style={{ marginTop: "1.25rem" }}>
            <h2 style={{ fontSize: "1.02rem", margin: "0 0 0.5rem" }}>
              各维分支明细（hits / opportunities / rate / adjustedScore）与判定
            </h2>
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.72rem",
                  border: "1px solid #e0e0e0",
                }}
              >
                <thead>
                  <tr style={{ background: "#fafafa" }}>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "0.3rem",
                        borderBottom: "1px solid #ddd",
                      }}
                    >
                      维
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "0.3rem",
                        borderBottom: "1px solid #ddd",
                      }}
                    >
                      结果
                    </th>
                    {BRANCH_LETTERS.map((L) => (
                      <th
                        key={`h-${L}`}
                        style={{ padding: "0.2rem", borderBottom: "1px solid #ddd" }}
                      >
                        {L}:h
                      </th>
                    ))}
                    {BRANCH_LETTERS.map((L) => (
                      <th
                        key={`o-${L}`}
                        style={{ padding: "0.2rem", borderBottom: "1px solid #ddd" }}
                      >
                        {L}:o
                      </th>
                    ))}
                    {BRANCH_LETTERS.map((L) => (
                      <th
                        key={`r-${L}`}
                        style={{ padding: "0.2rem", borderBottom: "1px solid #ddd" }}
                      >
                        {L}:r
                      </th>
                    ))}
                    {BRANCH_LETTERS.map((L) => (
                      <th
                        key={`a-${L}`}
                        style={{ padding: "0.2rem", borderBottom: "1px solid #ddd" }}
                      >
                        {L}:adj
                      </th>
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
                    const rowHasHighlight = BRANCH_LETTERS.some((L) =>
                      highlightSet.has(`${axisId}:${L}`),
                    );
                    let resultCell = "—";
                    if (dom) resultCell = `dominant ${dom}`;
                    else if (unc.length) resultCell = `uncertain ${unc.join(",")}`;

                    return (
                      <tr
                        key={key}
                        style={{
                          background: rowHasHighlight ? "#fffbf0" : undefined,
                        }}
                      >
                        <td
                          style={{
                            padding: "0.3rem",
                            borderBottom: "1px solid #eee",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <code>{axisId}</code> {AXIS_LABELS[key]}
                        </td>
                        <td
                          style={{
                            padding: "0.3rem",
                            borderBottom: "1px solid #eee",
                            fontWeight: 600,
                          }}
                        >
                          {resultCell}
                        </td>
                        {BRANCH_LETTERS.map((L) => (
                          <td
                            key={`${L}-h`}
                            style={{
                              padding: "0.2rem",
                              borderBottom: "1px solid #eee",
                              textAlign: "right",
                              fontVariantNumeric: "tabular-nums",
                              ...branchCellStyle(axisId, L, highlightSet),
                            }}
                          >
                            {prof?.branches?.[L]?.hits ?? 0}
                          </td>
                        ))}
                        {BRANCH_LETTERS.map((L) => (
                          <td
                            key={`${L}-o`}
                            style={{
                              padding: "0.2rem",
                              borderBottom: "1px solid #eee",
                              textAlign: "right",
                              fontVariantNumeric: "tabular-nums",
                              ...branchCellStyle(axisId, L, highlightSet),
                            }}
                          >
                            {prof?.branches?.[L]?.opportunities ?? 0}
                          </td>
                        ))}
                        {BRANCH_LETTERS.map((L) => (
                          <td
                            key={`${L}-r`}
                            style={{
                              padding: "0.2rem",
                              borderBottom: "1px solid #eee",
                              textAlign: "right",
                              fontVariantNumeric: "tabular-nums",
                              ...branchCellStyle(axisId, L, highlightSet),
                            }}
                          >
                            {fmtRatio(prof?.branches?.[L]?.rate ?? null)}
                          </td>
                        ))}
                        {BRANCH_LETTERS.map((L) => (
                          <td
                            key={`${L}-a`}
                            style={{
                              padding: "0.2rem",
                              borderBottom: "1px solid #eee",
                              textAlign: "right",
                              fontVariantNumeric: "tabular-nums",
                              ...branchCellStyle(axisId, L, highlightSet),
                            }}
                          >
                            {fmtNum(prof?.branches?.[L]?.adjustedScore ?? null)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p style={{ margin: "0.4rem 0 0", fontSize: "0.78rem", color: "#666" }}>
              列含义：h=hits，o=opportunities（按题计），r=rate，adj=adjustedScore；dominant 与 uncertain
              由后端集中阈值比较 adjustedScore 得出。
            </p>
          </section>

          <details
            style={{
              marginTop: "1.5rem",
              padding: "0.5rem 0",
              borderTop: "1px solid #e8e8e8",
            }}
          >
            <summary
              style={{
                cursor: "pointer",
                fontSize: "0.95rem",
                color: "#555",
                fontWeight: 600,
              }}
            >
              二十轴连续分数（float，次级展示）
            </summary>
            <p style={{ color: "#888", fontSize: "0.82rem", margin: "0.5rem 0" }}>
              下列数值来自 <code>user_profile</code> 聚合结果，仅作连续强度参考，
              <strong>不参与主标签、候选标签、风格标签的判定</strong>。
            </p>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                border: "1px solid #e8e8e8",
                borderRadius: 4,
              }}
            >
              {G1R_AXIS_KEYS.map((k) => (
                <li
                  key={k}
                  style={{
                    padding: "0.4rem 0.55rem",
                    borderBottom: "1px solid #f0f0f0",
                    fontSize: "0.85rem",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                  }}
                >
                  <span>
                    <code>{k}</code>
                    <span style={{ color: "#888", marginLeft: "0.35rem" }}>
                      {AXIS_LABELS[k]}
                    </span>
                  </span>
                  <span style={{ fontVariantNumeric: "tabular-nums", color: "#666" }}>
                    {fmtVal(profile[k])}
                  </span>
                </li>
              ))}
            </ul>
          </details>

          <p style={{ color: "#888", fontSize: "0.78rem", marginTop: "1rem" }}>
            更新于 {profile.updatedAt ? String(profile.updatedAt) : "—"}
          </p>
        </>
      ) : null}
    </main>
  );
}
