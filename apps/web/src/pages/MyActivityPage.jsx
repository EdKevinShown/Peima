import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import LoadingState from "../components/common/LoadingState";
import UserIdWithName from "../components/common/UserIdWithName";
import { getP2OverviewGlobal, getP2OverviewMine } from "../api/analytics";
import {
  createBehaviorSignal,
  listMyBehaviorSignals,
  P2_SOURCE_TYPE_OPTIONS,
} from "../api/behaviorSignal";
import { listMyFeedback } from "../api/feedback";
import { resolveUserId } from "../utils/resolveUserId";
import { useAdminAccess } from "../hooks/useAdminAccess";
import { toFriendlyUserMessage } from "../utils/friendlyErrors";

const MOOD_BY_RATING = {
  5: "挺开心",
  4: "还不错",
  3: "一般",
  2: "有点别扭",
  1: "不太想聊了",
};

const CONTINUE_BY_RATING = {
  5: "想继续聊",
  3: "再看看",
  1: "先缓缓",
};

const MY_ACTIVITY_SCOPED_CSS = `
.my-activity-page {
  max-width: 560px;
  margin: 0 auto;
  padding: 1.5rem 1rem 2.5rem;
}
.my-activity-page__title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #fff;
  margin: 0 0 0.35rem;
}
.my-activity-page__lead {
  margin: 0 0 1rem;
  font-size: 0.86rem;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.52);
}
.my-activity-page__nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.65rem;
  margin-bottom: 1.25rem;
  font-size: 0.85rem;
}
.my-activity-page__nav a {
  color: rgba(255, 255, 255, 0.72);
  text-decoration: none;
}
.my-activity-page__nav a:hover {
  color: #fff;
}
.my-activity-page__section {
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
.my-activity-page__section h2 {
  margin: 0 0 0.75rem;
  font-size: 1.05rem;
  font-weight: 600;
  color: #fff;
}
.my-activity-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem;
}
.my-activity-stat {
  padding: 0.65rem 0.75rem;
  border-radius: 0.85rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.12);
}
.my-activity-stat__value {
  font-size: 1.15rem;
  font-weight: 600;
  color: #fff;
}
.my-activity-stat__label {
  margin-top: 0.15rem;
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.5);
}
.my-activity-empty {
  margin: 0;
  font-size: 0.88rem;
  color: rgba(255, 255, 255, 0.45);
}
.my-activity-list {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
.my-activity-card {
  padding: 0.75rem 0.85rem;
  border-radius: 0.85rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.14);
}
.my-activity-card__title {
  margin: 0 0 0.35rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: #fff;
}
.my-activity-card__meta {
  margin: 0 0 0.35rem;
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.45);
}
.my-activity-card__lines {
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.86rem;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.78);
}
.my-activity-card__lines li + li {
  margin-top: 0.2rem;
}
.my-activity-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.45rem;
}
.my-activity-tag {
  padding: 0.2rem 0.55rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.72);
}
.my-activity-page .account-input,
.my-activity-page .account-select {
  box-sizing: border-box;
  display: block;
  width: 100%;
  height: 44px;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 0.75rem;
  font-size: 0.9rem;
  color: #fff;
  background: rgba(255, 255, 255, 0.07);
}
.my-activity-page .account-field-label {
  display: block;
  margin-bottom: 0.65rem;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.72);
}
.my-activity-page .account-field-control-slot {
  margin-top: 0.35rem;
}
.my-activity-pre {
  margin: 0.5rem 0 0;
  padding: 0.65rem 0.75rem;
  max-height: 220px;
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
.my-activity-admin-details {
  margin-top: 0.75rem;
  border-radius: 0.85rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.12);
}
.my-activity-admin-details > summary {
  padding: 0.6rem 0.75rem;
  cursor: pointer;
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.55);
  list-style: none;
}
.my-activity-admin-details > summary::-webkit-details-marker {
  display: none;
}
.my-activity-admin-details__body {
  padding: 0 0.75rem 0.75rem;
}
.my-activity-page .account-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-top: 0.5rem;
}
.my-activity-tech-id {
  margin: 0 0 0.75rem;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.38);
  font-family: ui-monospace, monospace;
}
`;

function formatWhen(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function feedbackTitle(item) {
  const kind = String(item?.subjectKind ?? "").toLowerCase();
  if (kind === "conversation") return "对话感受";
  if (kind === "match" || kind === "matchresult") return "匹配反馈";
  return "你的反馈";
}

function feedbackSummaryLines(item) {
  const lines = [];
  const sp = item?.structuredPayload;
  const overall =
    sp && typeof sp === "object" && sp.overallRating != null
      ? Number(sp.overallRating)
      : item?.rating != null
        ? Number(item.rating)
        : null;
  if (overall != null && !Number.isNaN(overall)) {
    lines.push(`整体感受：${MOOD_BY_RATING[overall] ?? `${overall} 分`}`);
  }
  const cont =
    sp && typeof sp === "object" && sp.continueIntent != null
      ? Number(sp.continueIntent)
      : null;
  if (cont != null && !Number.isNaN(cont)) {
    lines.push(`还想聊吗：${CONTINUE_BY_RATING[cont] ?? `${cont} 分`}`);
  }
  const comment = String(item?.comment ?? "").trim();
  if (comment) lines.push(`留言：${comment}`);
  if (lines.length === 0 && item?.rating == null) {
    lines.push("已记录，感谢你的反馈。");
  }
  return lines;
}

function FeedbackCard({ item, showDebug }) {
  const when = formatWhen(item?.recordedAt ?? item?.createdAt);
  const tags = Array.isArray(item?.tags) ? item.tags.filter(Boolean) : [];

  return (
    <article className="my-activity-card">
      <h3 className="my-activity-card__title">{feedbackTitle(item)}</h3>
      {when ? <p className="my-activity-card__meta">{when}</p> : null}
      <ul className="my-activity-card__lines">
        {feedbackSummaryLines(item).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {tags.length > 0 ? (
        <div className="my-activity-tags" aria-label="标签">
          {tags.map((t) => (
            <span key={t} className="my-activity-tag">
              {t}
            </span>
          ))}
        </div>
      ) : null}
      {showDebug ? (
        <details className="my-activity-admin-details">
          <summary>原始数据</summary>
          <div className="my-activity-admin-details__body">
            <pre className="my-activity-pre">{JSON.stringify(item, null, 2)}</pre>
          </div>
        </details>
      ) : null}
    </article>
  );
}

function SignalCard({ item, showDebug }) {
  const when = formatWhen(item?.occurredAt ?? item?.createdAt);
  return (
    <article className="my-activity-card">
      <h3 className="my-activity-card__title">互动记录</h3>
      {when ? <p className="my-activity-card__meta">{when}</p> : null}
      {showDebug ? (
        <pre className="my-activity-pre">{JSON.stringify(item, null, 2)}</pre>
      ) : (
        <p className="my-activity-empty" style={{ marginTop: "0.35rem" }}>
          已记录一次互动。
        </p>
      )}
    </article>
  );
}

export default function MyActivityPage() {
  const [searchParams] = useSearchParams();
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);
  const isDebugMode = useMemo(() => searchParams.get("debug") === "1", [searchParams]);
  const { isAdmin } = useAdminAccess();
  const showDebug = isDebugMode && isAdmin;

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

  const statItems = mineStats
    ? [
        { label: "反馈", value: mineStats.myFeedbackCount },
        { label: "画像建议", value: mineStats.mySuggestionCount },
        { label: "待处理建议", value: mineStats.myPendingSuggestionCount },
        { label: "互动记录", value: mineStats.myBehaviorSignalCount },
        { label: "会话摘要", value: mineStats.myConversationSummaryCount },
      ]
    : [];

  return (
    <main className="app-themed-content my-activity-page">
      <style>{MY_ACTIVITY_SCOPED_CSS}</style>
      <h1 className="my-activity-page__title">我的动态</h1>
      <p className="my-activity-page__lead">
        这里汇总你在应用里的反馈与相关记录，方便你回顾自己的使用轨迹。
      </p>
      {showDebug ? (
        <p className="my-activity-tech-id">
          userId: <UserIdWithName userId={userId} />
        </p>
      ) : null}
      <nav className="my-activity-page__nav" aria-label="快捷入口">
        <Link to="/home">首页</Link>
        <span aria-hidden>·</span>
        <Link to={`/account?userId=${encodeURIComponent(userId || "")}`}>我的资料</Link>
      </nav>

      {loading && <LoadingState label="加载中…" />}
      {error && (
        <p className="chat-status-err" role="alert">
          {toFriendlyUserMessage(error.message)}
        </p>
      )}
      {appendOk ? (
        <p className="chat-status-ok mb-3" role="status">
          {appendOk}
        </p>
      ) : null}

      {!loading && mineStats ? (
        <section className="my-activity-page__section">
          <h2>概览</h2>
          <div className="my-activity-stats">
            {statItems.map((s) => (
              <div key={s.label} className="my-activity-stat">
                <div className="my-activity-stat__value">{s.value}</div>
                <div className="my-activity-stat__label">{s.label}</div>
              </div>
            ))}
          </div>
          {showDebug ? (
            <div className="account-actions" style={{ marginTop: "0.75rem" }}>
              <button
                type="button"
                className="btn-ghost text-sm py-2 px-4"
                onClick={onLoadGlobal}
                disabled={loadingGlobal}
              >
                {loadingGlobal ? "加载中…" : "加载全局统计（管理员）"}
              </button>
            </div>
          ) : null}
          {showDebug && globalError ? (
            <p className="chat-status-err" style={{ fontSize: "0.85rem", marginTop: "0.5rem" }} role="alert">
              {toFriendlyUserMessage(globalError)}
            </p>
          ) : null}
          {showDebug && globalStats ? (
            <pre className="my-activity-pre">{JSON.stringify(globalStats, null, 2)}</pre>
          ) : null}
        </section>
      ) : null}

      {showDebug && !loading && userId ? (
        <section className="my-activity-page__section">
          <h2>追加行为信号（调试）</h2>
          <label className="account-field-label">
            eventType
            <div className="account-field-control-slot">
              <input
                className="account-input"
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
              />
            </div>
          </label>
          <label className="account-field-label">
            sourceType
            <div className="account-field-control-slot">
              <select
                className="account-select"
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value)}
              >
                {P2_SOURCE_TYPE_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <label className="account-field-label">
            sourceVersion
            <div className="account-field-control-slot">
              <input
                className="account-input"
                value={sourceVersion}
                onChange={(e) => setSourceVersion(e.target.value)}
              />
            </div>
          </label>
          <label className="account-field-label">
            conversationId（可选）
            <div className="account-field-control-slot">
              <input
                className="account-input"
                value={convId}
                onChange={(e) => setConvId(e.target.value)}
              />
            </div>
          </label>
          <div className="account-actions">
            <button
              type="button"
              className="btn-primary text-sm py-2.5 px-5"
              onClick={onAppendSignal}
              disabled={appending}
            >
              {appending ? "提交中…" : "追加"}
            </button>
          </div>
        </section>
      ) : null}

      {!loading && userId ? (
        <section className="my-activity-page__section">
          <h2>我的反馈</h2>
          <p className="my-activity-page__section-hint" style={{ marginTop: 0 }}>
            提交反馈：进入
            {" "}
            <Link to={userId ? `/chat?userId=${encodeURIComponent(userId)}` : "/chat"}>
              聊天
            </Link>
            ，选好对话对象后，在输入框下方或顶栏点「聊后反馈」。
          </p>
          {feedbacks.length === 0 ? (
            <p className="my-activity-empty">还没有反馈记录。</p>
          ) : (
            <div className="my-activity-list">
              {feedbacks.map((fb) => (
                <FeedbackCard
                  key={String(fb?.id ?? JSON.stringify(fb))}
                  item={fb}
                  showDebug={showDebug}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {!loading && userId && (signals.length > 0 || showDebug) ? (
        <section className="my-activity-page__section">
          <h2>{showDebug ? "行为信号（调试）" : "互动记录"}</h2>
          {signals.length === 0 ? (
            <p className="my-activity-empty">暂无</p>
          ) : (
            <div className="my-activity-list">
              {signals.map((sig) => (
                <SignalCard
                  key={sig.id}
                  item={sig}
                  showDebug={showDebug}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}

      <div className="account-actions">
        <button
          type="button"
          className="btn-ghost text-sm py-2 px-4"
          onClick={load}
          disabled={loading || !userId}
        >
          刷新
        </button>
      </div>
    </main>
  );
}
