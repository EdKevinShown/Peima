import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import LoadingState from "../components/common/LoadingState";
import { getP2OverviewGlobal, getP2OverviewMine } from "../api/analytics";
import {
  createBehaviorSignal,
  listMyBehaviorSignals,
  P2_SOURCE_TYPE_OPTIONS,
} from "../api/behaviorSignal";
import { listMyFeedback } from "../api/feedback";
import { resolveUserId } from "../utils/resolveUserId";

export default function MyActivityPage() {
  const [searchParams] = useSearchParams();
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [mineStats, setMineStats] = useState(null);
  const [feedbacks, setFeedbacks] = useState([]);
  const [signals, setSignals] = useState([]);

  const [globalStats, setGlobalStats] = useState(null);
  const [globalError, setGlobalError] = useState(null);
  const [loadingGlobal, setLoadingGlobal] = useState(false);

  const [eventType, setEventType] = useState("manual_dev_test");
  const [sourceType, setSourceType] = useState("rule_based");
  const [sourceVersion, setSourceVersion] = useState("web-my-activity-v1");
  const [convId, setConvId] = useState("");
  const [appending, setAppending] = useState(false);
  const [appendOk, setAppendOk] = useState("");

  const load = useCallback(async () => {
    if (!userId) {
      setError(new Error("缺少 userId：请先 /login 或 URL ?userId="));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [stats, fb, sig] = await Promise.all([
        getP2OverviewMine(),
        listMyFeedback(),
        listMyBehaviorSignals(),
      ]);
      setMineStats(stats);
      setFeedbacks(Array.isArray(fb) ? fb : []);
      setSignals(Array.isArray(sig) ? sig : []);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setMineStats(null);
      setFeedbacks([]);
      setSignals([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onLoadGlobal = useCallback(async () => {
    setGlobalError(null);
    setGlobalStats(null);
    setLoadingGlobal(true);
    try {
      const g = await getP2OverviewGlobal();
      setGlobalStats(g);
    } catch (e) {
      setGlobalError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingGlobal(false);
    }
  }, []);

  const onAppendSignal = useCallback(async () => {
    if (!userId) return;
    setAppending(true);
    setAppendOk("");
    setError(null);
    try {
      await createBehaviorSignal({
        userId,
        eventType: eventType.trim() || "manual_dev_test",
        sourceType,
        sourceVersion: sourceVersion.trim() || "web-my-activity-v1",
        ...(convId.trim() ? { conversationId: convId.trim() } : {}),
      });
      setAppendOk("已追加一条行为信号");
      window.setTimeout(() => setAppendOk(""), 3000);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setAppending(false);
    }
  }, [userId, eventType, sourceType, sourceVersion, convId, load]);

  return (
    <main style={{ maxWidth: 720, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.25rem" }}>P2 活动与统计</h1>
      <p style={{ color: "#666", fontSize: "0.9rem" }}>
        userId: <code>{userId || "（未设置）"}</code>
      </p>
      <p style={{ marginBottom: "1rem", fontSize: "0.85rem" }}>
        <Link to="/">首页</Link>
        {" · "}
        <Link to={`/account?userId=${encodeURIComponent(userId || "")}`}>
          账号与偏好
        </Link>
      </p>

      {loading && <LoadingState label="加载中…" />}
      {error && (
        <p style={{ color: "#b00020" }} role="alert">
          {error.message}
        </p>
      )}
      {appendOk ? (
        <p style={{ color: "#0d6832" }} role="status">
          {appendOk}
        </p>
      ) : null}

      {!loading && mineStats ? (
        <section style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.05rem" }}>我的 P2 计数</h2>
          <p style={{ fontSize: "0.88rem", color: "#444" }}>
            反馈 {mineStats.myFeedbackCount} · 画像建议 {mineStats.mySuggestionCount}{" "}
            （待处理 {mineStats.myPendingSuggestionCount}）· 行为信号{" "}
            {mineStats.myBehaviorSignalCount} · 会话摘要快照{" "}
            {mineStats.myConversationSummaryCount}
          </p>
          <button
            type="button"
            onClick={onLoadGlobal}
            disabled={loadingGlobal}
            style={{ marginTop: "0.35rem" }}
          >
            {loadingGlobal ? "加载中…" : "尝试加载全局统计（需 env 白名单）"}
          </button>
          {globalError ? (
            <p style={{ color: "#b00020", fontSize: "0.85rem" }} role="alert">
              全局统计：{globalError}
            </p>
          ) : null}
          {globalStats ? (
            <pre
              style={{
                fontSize: "0.78rem",
                background: "#f5f5f5",
                padding: "0.5rem",
                borderRadius: 6,
                overflow: "auto",
              }}
            >
              {JSON.stringify(globalStats, null, 2)}
            </pre>
          ) : null}
        </section>
      ) : null}

      {!loading && userId ? (
        <section style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.05rem" }}>追加行为信号（联调用）</h2>
          <p style={{ fontSize: "0.78rem", color: "#666" }}>
            <code>POST /behavior-signals</code>，sourceType 须为 P2 枚举之一。
          </p>
          <label style={{ display: "block", marginBottom: "0.45rem", fontSize: "0.85rem" }}>
            eventType
            <input
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              style={{ display: "block", width: "100%", marginTop: 4 }}
            />
          </label>
          <label style={{ display: "block", marginBottom: "0.45rem", fontSize: "0.85rem" }}>
            sourceType
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              style={{ display: "block", width: "100%", marginTop: 4 }}
            >
              {P2_SOURCE_TYPE_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "block", marginBottom: "0.45rem", fontSize: "0.85rem" }}>
            sourceVersion
            <input
              value={sourceVersion}
              onChange={(e) => setSourceVersion(e.target.value)}
              style={{ display: "block", width: "100%", marginTop: 4 }}
            />
          </label>
          <label style={{ display: "block", marginBottom: "0.45rem", fontSize: "0.85rem" }}>
            conversationId（可选）
            <input
              value={convId}
              onChange={(e) => setConvId(e.target.value)}
              style={{ display: "block", width: "100%", marginTop: 4 }}
            />
          </label>
          <button type="button" onClick={onAppendSignal} disabled={appending}>
            {appending ? "提交中…" : "追加"}
          </button>
        </section>
      ) : null}

      {!loading && userId ? (
        <section style={{ marginBottom: "1rem" }}>
          <h2 style={{ fontSize: "1.05rem" }}>我的反馈（GET /feedback/mine）</h2>
          {feedbacks.length === 0 ? (
            <p style={{ color: "#666", fontSize: "0.88rem" }}>暂无</p>
          ) : (
            <pre
              style={{
                fontSize: "0.72rem",
                background: "#fafafa",
                padding: "0.5rem",
                maxHeight: 220,
                overflow: "auto",
              }}
            >
              {JSON.stringify(feedbacks, null, 2)}
            </pre>
          )}
        </section>
      ) : null}

      {!loading && userId ? (
        <section>
          <h2 style={{ fontSize: "1.05rem" }}>我的行为信号（GET /behavior-signals/mine）</h2>
          {signals.length === 0 ? (
            <p style={{ color: "#666", fontSize: "0.88rem" }}>暂无</p>
          ) : (
            <pre
              style={{
                fontSize: "0.72rem",
                background: "#fafafa",
                padding: "0.5rem",
                maxHeight: 280,
                overflow: "auto",
              }}
            >
              {JSON.stringify(signals, null, 2)}
            </pre>
          )}
        </section>
      ) : null}

      <div style={{ marginTop: "1.25rem" }}>
        <button type="button" onClick={load} disabled={loading || !userId}>
          刷新
        </button>
      </div>
    </main>
  );
}
