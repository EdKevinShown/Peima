import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  getAdminCapabilities,
  runAdminBatchMatchOnce,
} from "../api/admin";
import { enqueueMatching, getMatchingStatus } from "../api/matching";
import {
  getTestMatchingCapabilities,
  runTestBatchMatchOnce,
} from "../api/testMatch";
import LoadingState from "../components/common/LoadingState";
import { resolveUserId } from "../utils/resolveUserId";

export default function MatchingWaitingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);

  const [statusPayload, setStatusPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [enqueueing, setEnqueueing] = useState(false);
  const [enqueueHint, setEnqueueHint] = useState("");
  const [adminBatchMatch, setAdminBatchMatch] = useState(false);
  const [adminBatchRunning, setAdminBatchRunning] = useState(false);
  const [adminBatchHint, setAdminBatchHint] = useState("");
  const [testBatchMatch, setTestBatchMatch] = useState(false);
  const [testBatchRunning, setTestBatchRunning] = useState(false);
  const [testBatchHint, setTestBatchHint] = useState("");

  const load = useCallback(async () => {
    if (!userId) {
      setError(new Error("缺少 userId：请在 URL 加 ?userId=xxx 或设置 localStorage.peimaUserId"));
      setStatusPayload(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getMatchingStatus(userId);
      setStatusPayload(data);
      if (data.status === "ready") {
        navigate(`/final-match?userId=${encodeURIComponent(userId)}`, {
          replace: true,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setStatusPayload(null);
    } finally {
      setLoading(false);
    }
  }, [userId, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [adminCap, testCap] = await Promise.all([
          getAdminCapabilities(),
          getTestMatchingCapabilities(),
        ]);
        if (!cancelled) {
          setAdminBatchMatch(Boolean(adminCap.batchMatchTrigger));
          setTestBatchMatch(Boolean(testCap.testBatchMatchTrigger));
        }
      } catch {
        if (!cancelled) {
          setAdminBatchMatch(false);
          setTestBatchMatch(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const onAdminRunBatchMatch = useCallback(async () => {
    if (
      !window.confirm(
        "【管理员】将立刻在本机/服务器上执行一轮 worker batch-match（处理所有 waiting 队列）。确定？",
      )
    ) {
      return;
    }
    setAdminBatchRunning(true);
    setAdminBatchHint("");
    setError(null);
    try {
      await runAdminBatchMatchOnce();
      setAdminBatchHint("batch-match 已执行，正在刷新状态…");
      await load();
      setAdminBatchHint("batch-match 已完成，状态已刷新");
      window.setTimeout(() => setAdminBatchHint(""), 5000);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setAdminBatchRunning(false);
    }
  }, [load]);

  const onTestRunBatchMatch = useCallback(async () => {
    if (
      !window.confirm(
        "【测试】将立刻执行一轮 batch-match（与管理员操作相同，处理当前 waiting 队列）。确定？",
      )
    ) {
      return;
    }
    setTestBatchRunning(true);
    setTestBatchHint("");
    setError(null);
    try {
      await runTestBatchMatchOnce();
      setTestBatchHint("batch-match 已执行，正在刷新状态…");
      await load();
      setTestBatchHint("batch-match 已完成，状态已刷新");
      window.setTimeout(() => setTestBatchHint(""), 5000);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setTestBatchRunning(false);
    }
  }, [load]);

  const onEnqueue = useCallback(async () => {
    if (!userId) return;
    setEnqueueing(true);
    setEnqueueHint("");
    setError(null);
    try {
      await enqueueMatching(userId);
      setEnqueueHint("已加入匹配队列");
      window.setTimeout(() => setEnqueueHint(""), 4000);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setEnqueueing(false);
    }
  }, [userId, load]);

  const messageForStatus = (s) => {
    switch (s) {
      case "waiting":
        return "正在等待本轮匹配";
      case "processing":
        return "系统正在处理中";
      case "ready":
        return "匹配已完成，正在跳转…";
      case "not_queued":
        return "你还没有进入匹配队列";
      default:
        return `未知状态：${s}`;
    }
  };

  return (
    <main style={{ maxWidth: 520, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.25rem" }}>匹配状态</h1>
      <p style={{ fontSize: "0.85rem", marginBottom: "0.75rem" }}>
        <Link to="/">首页</Link>
      </p>
      <p style={{ color: "#666", fontSize: "0.9rem" }}>
        current userId:{" "}
        <code>{userId || "（未设置）"}</code>
      </p>

      {loading && <LoadingState />}
      {error && (
        <p style={{ color: "#b00020" }} role="alert">
          {error.message}
        </p>
      )}

      {!loading && statusPayload && (
        <p style={{ fontSize: "1.05rem", marginTop: "1rem" }}>
          {messageForStatus(statusPayload.status)}
        </p>
      )}

      {enqueueHint ? (
        <p style={{ color: "#0d6832", marginTop: "0.75rem" }} role="status">
          {enqueueHint}
        </p>
      ) : null}

      <div style={{ marginTop: "1.5rem", display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        <button type="button" onClick={onEnqueue} disabled={enqueueing || !userId}>
          {enqueueing ? "入队中…" : "加入匹配队列"}
        </button>
        <button type="button" onClick={load} disabled={loading || !userId}>
          刷新状态
        </button>
      </div>

      {testBatchMatch ? (
        <section
          style={{
            marginTop: "2rem",
            padding: "1rem",
            border: "1px solid #38bdf8",
            borderRadius: 8,
            background: "#f0f9ff",
          }}
        >
          <h2 style={{ fontSize: "0.95rem", margin: "0 0 0.5rem", color: "#0369a1" }}>
            测试专用
          </h2>
          <p style={{ fontSize: "0.8rem", color: "#0c4a6e", margin: "0 0 0.75rem", lineHeight: 1.5 }}>
            在 <code style={{ fontSize: "0.75rem" }}>.env</code> 中设置{" "}
            <code style={{ fontSize: "0.75rem" }}>PEIMA_TEST_MATCH_ENABLED=1</code> 与{" "}
            <code style={{ fontSize: "0.75rem" }}>PEIMA_TEST_MATCH_USER_IDS</code>（你的 userId）后可见。
            与管理员功能相同：在 API 所在机器上执行一轮 batch-match。勿在生产开启给全员。
          </p>
          <button
            type="button"
            onClick={onTestRunBatchMatch}
            disabled={testBatchRunning || adminBatchRunning}
            style={{
              background: "#0284c7",
              color: "#fff",
              border: "none",
              padding: "0.45rem 0.75rem",
              borderRadius: 6,
            }}
          >
            {testBatchRunning ? "正在执行 batch-match…" : "立即做一次匹配（测试）"}
          </button>
          {testBatchHint ? (
            <p style={{ marginTop: "0.65rem", fontSize: "0.85rem", color: "#166534" }} role="status">
              {testBatchHint}
            </p>
          ) : null}
        </section>
      ) : null}

      {adminBatchMatch ? (
        <section
          style={{
            marginTop: "2rem",
            padding: "1rem",
            border: "1px solid #c9a227",
            borderRadius: 8,
            background: "#fffbeb",
          }}
        >
          <h2 style={{ fontSize: "0.95rem", margin: "0 0 0.5rem", color: "#92400e" }}>
            管理员专用
          </h2>
          <p style={{ fontSize: "0.8rem", color: "#78350f", margin: "0 0 0.75rem", lineHeight: 1.5 }}>
            以下操作会在<strong>运行 API 的机器</strong>上启动 worker，等价于命令行{" "}
            <code style={{ fontSize: "0.75rem" }}>pnpm --filter @peima/worker run batch-match</code>
            （若已 build 则优先用 <code>dist/main.js --batch-match</code>）。
            生产环境若 API 容器内无 worker / pnpm，会失败——仅建议在本地或可控环境使用。
          </p>
          <button
            type="button"
            onClick={onAdminRunBatchMatch}
            disabled={adminBatchRunning || testBatchRunning}
            style={{ background: "#b45309", color: "#fff", border: "none", padding: "0.45rem 0.75rem", borderRadius: 6 }}
          >
            {adminBatchRunning ? "正在执行 batch-match…" : "立刻执行本轮 batch-match"}
          </button>
          {adminBatchHint ? (
            <p style={{ marginTop: "0.65rem", fontSize: "0.85rem", color: "#166534" }} role="status">
              {adminBatchHint}
            </p>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
