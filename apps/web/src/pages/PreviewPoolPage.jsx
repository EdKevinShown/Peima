import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getLatestPreviewPool, seedLatestPreviewPoolForTest } from "../api/previewPool";
import { getTestMatchingCapabilities } from "../api/testMatch";
import { resolveUserId } from "../utils/resolveUserId";

const card = {
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  background: "#fff",
  padding: "1rem",
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
};

const pill = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  padding: "0.16rem 0.55rem",
  fontSize: "0.76rem",
  border: "1px solid #cbd5e1",
  color: "#475569",
  background: "#f8fafc",
};

function fmtScore(n) {
  return typeof n === "number" && Number.isFinite(n) ? n.toFixed(3) : "-";
}

export default function PreviewPoolPage() {
  const [searchParams] = useSearchParams();
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedAllowed, setSeedAllowed] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!userId) {
      setBundle(null);
      setError("缺少 userId：请先登录，或在 URL 里带上 ?userId=...");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const next = await getLatestPreviewPool(userId);
      setBundle(next);
    } catch (e) {
      setBundle(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const capabilities = await getTestMatchingCapabilities();
        if (!cancelled) {
          setSeedAllowed(Boolean(capabilities.testPreviewPoolSeed));
        }
      } catch {
        if (!cancelled) {
          setSeedAllowed(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const seedForTest = useCallback(async () => {
    if (!userId) {
      setError("缺少 userId：请先登录，或在 URL 里带上 ?userId=...");
      return;
    }
    setSeeding(true);
    setError("");
    try {
      const next = await seedLatestPreviewPoolForTest();
      setBundle(next);
    } catch (e) {
      setBundle(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSeeding(false);
    }
  }, [userId]);

  const q = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  const shortlistIds = bundle?.shortlistContract?.shortlist?.candidateUserIds ?? [];
  const evidence = bundle?.shortlistContract?.staticEvidence ?? {};

  return (
    <main style={{ maxWidth: 980, margin: "2rem auto", padding: "0 1rem 3rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, color: "#0f172a", fontSize: "1.55rem" }}>第一印象预览池</h1>
          <p style={{ margin: "0.45rem 0 0", color: "#64748b", lineHeight: 1.6 }}>
            只读查看 latest active preview pool。生成 / writer 路径仍保持下线，不会写 MatchResult。
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={loading || !userId}
            onClick={() => void load()}
            style={{
              border: "none",
              borderRadius: 8,
              padding: "0.6rem 1rem",
              fontWeight: 600,
              background: "#1e293b",
              color: "#fff",
              cursor: loading || !userId ? "not-allowed" : "pointer",
              opacity: loading || !userId ? 0.72 : 1,
            }}
          >
            {loading ? "刷新中…" : "刷新"}
          </button>
          {seedAllowed ? (
            <button
              type="button"
              disabled={seeding || !userId}
              onClick={() => void seedForTest()}
              style={{
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                padding: "0.6rem 1rem",
                fontWeight: 600,
                background: "#fff",
                color: "#334155",
                cursor: seeding || !userId ? "not-allowed" : "pointer",
                opacity: seeding || !userId ? 0.72 : 1,
              }}
            >
              {seeding ? "生成中…" : "生成本地测试预览池"}
            </button>
          ) : null}
          <Link to={`/matching-waiting${q}`} style={{ color: "#475569", fontWeight: 600 }}>
            去匹配等待
          </Link>
        </div>
      </div>

      <section style={{ ...card, marginTop: "1rem", background: "#f8fafc" }}>
        <div style={{ color: "#475569", fontSize: "0.92rem", lineHeight: 1.7 }}>
          当前 userId：<code>{userId || "-"}</code>
          <br />
          API：<code>GET /preview-pool/user/:userId/latest</code>
        </div>
      </section>

      {error ? (
        <section style={{ ...card, marginTop: "1rem", borderColor: "#fecaca", background: "#fff7ed" }}>
          <h2 style={{ margin: "0 0 0.45rem", color: "#9a3412", fontSize: "1rem" }}>暂时没有可用预览池</h2>
          <p style={{ margin: 0, color: "#9a3412", lineHeight: 1.65 }}>{error}</p>
          <p style={{ margin: "0.7rem 0 0", color: "#7c2d12", fontSize: "0.86rem", lineHeight: 1.6 }}>
            如果是 <code>No active preview pool</code>
            {seedAllowed
              ? "，可以点击「生成本地测试预览池」创建一组只读 smoke 数据；该路径不写 MatchResult。"
              : "，需要先走 onboarding 照片/偏好流程，或让当前账号进入本地测试白名单后再生成 smoke 数据。"}
          </p>
        </section>
      ) : null}

      {bundle ? (
        <>
          <section style={{ ...card, marginTop: "1rem" }}>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
              <span style={pill}>status: {bundle.previewPool.status}</span>
              <span style={pill}>poolId: {bundle.previewPool.id}</span>
              <span style={pill}>items: {bundle.items.length}</span>
              <span style={pill}>shortlist: {shortlistIds.length}</span>
            </div>
            <p style={{ margin: "0.75rem 0 0", color: "#64748b", fontSize: "0.86rem" }}>
              createdAt: {bundle.previewPool.createdAt} · updatedAt: {bundle.previewPool.updatedAt}
            </p>
          </section>

          <section style={{ ...card, marginTop: "1rem" }}>
            <h2 style={{ margin: "0 0 0.75rem", color: "#0f172a", fontSize: "1.05rem" }}>
              Shortlist Contract v0
            </h2>
            {bundle.shortlistContract ? (
              <>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                  {shortlistIds.map((id) => (
                    <span key={id} style={{ ...pill, borderColor: "#86efac", background: "#f0fdf4", color: "#166534" }}>
                      {id}
                    </span>
                  ))}
                </div>
                {bundle.shortlistContract.exclusionReport.length > 0 ? (
                  <details>
                    <summary style={{ cursor: "pointer", color: "#475569", fontWeight: 600 }}>
                      未入 shortlist 原因（{bundle.shortlistContract.exclusionReport.length}）
                    </summary>
                    <ul style={{ margin: "0.65rem 0 0", paddingLeft: "1.1rem", color: "#64748b", lineHeight: 1.6 }}>
                      {bundle.shortlistContract.exclusionReport.map((row) => (
                        <li key={`${row.candidateUserId}:${row.reasonCode}`}>
                          <code>{row.candidateUserId}</code> · {row.reasonCode} · {row.detail}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </>
            ) : (
              <p style={{ margin: 0, color: "#64748b" }}>当前池无法派生 shortlistContract。</p>
            )}
          </section>

          <section style={{ ...card, marginTop: "1rem" }}>
            <h2 style={{ margin: "0 0 0.75rem", color: "#0f172a", fontSize: "1.05rem" }}>候选列表</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ padding: "0.5rem" }}>Rank</th>
                    <th style={{ padding: "0.5rem" }}>Candidate</th>
                    <th style={{ padding: "0.5rem" }}>Mode</th>
                    <th style={{ padding: "0.5rem" }}>Base</th>
                    <th style={{ padding: "0.5rem" }}>Preference</th>
                    <th style={{ padding: "0.5rem" }}>Profile</th>
                    <th style={{ padding: "0.5rem" }}>Style</th>
                    <th style={{ padding: "0.5rem" }}>Meta</th>
                  </tr>
                </thead>
                <tbody>
                  {bundle.items.map((item) => {
                    const ev = evidence[item.candidateUserId];
                    const inShortlist = shortlistIds.includes(item.candidateUserId);
                    return (
                      <tr key={item.id} style={{ borderBottom: "1px solid #f1f5f9", background: inShortlist ? "#f0fdf4" : "#fff" }}>
                        <td style={{ padding: "0.55rem" }}>{item.rankInPool}</td>
                        <td style={{ padding: "0.55rem" }}>
                          <code>{item.candidateUserId}</code>
                          {inShortlist ? <span style={{ marginLeft: 6, ...pill }}>shortlist</span> : null}
                        </td>
                        <td style={{ padding: "0.55rem" }}>{item.displayMode}</td>
                        <td style={{ padding: "0.55rem" }}>{fmtScore(item.baseScore)}</td>
                        <td style={{ padding: "0.55rem" }}>{fmtScore(ev?.preferenceScore)}</td>
                        <td style={{ padding: "0.55rem" }}>{fmtScore(ev?.profileScalar)}</td>
                        <td style={{ padding: "0.55rem" }}>{fmtScore(ev?.styleScore)}</td>
                        <td style={{ padding: "0.55rem", color: "#64748b" }}>
                          {item.itemMeta?.slotReason || item.itemMeta?.shortHint || "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
