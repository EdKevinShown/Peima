import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAdminCapabilities, runAdminBatchMatchOnce } from "../../api/admin";
import { runTestBatchMatchOnce } from "../../api/testMatch";
import { useAdminAccess } from "../../hooks/useAdminAccess";
import { toFriendlyUserMessage } from "../../utils/friendlyErrors";

/**
 * 管理员：立即执行 batch-match（无需 debug=1）。
 * @param {{ userId?: string; compact?: boolean; className?: string }} props
 */
export default function AdminMatchTools({ userId = "", compact = false, className = "" }) {
  const { isAdmin, testBatchMatchTrigger } = useAdminAccess();
  const [batchAllowed, setBatchAllowed] = useState(false);
  const [running, setRunning] = useState(false);
  const [hint, setHint] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isAdmin) return;
    getAdminCapabilities()
      .then((c) => setBatchAllowed(Boolean(c?.batchMatchTrigger)))
      .catch(() => setBatchAllowed(false));
  }, [isAdmin]);

  const onRunBatch = useCallback(async (fn) => {
    if (
      !window.confirm(
        "将立刻处理当前所有「等待中」的匹配队列（等同 worker 跑一轮）。确定？",
      )
    ) {
      return;
    }
    setRunning(true);
    setHint("");
    setError(null);
    try {
      await fn();
      setHint("匹配任务已执行");
      window.setTimeout(() => setHint(""), 4000);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setRunning(false);
    }
  }, []);

  if (!isAdmin || (!batchAllowed && !testBatchMatchTrigger)) return null;

  const uidQs = userId ? `?userId=${encodeURIComponent(userId)}` : "";

  return (
    <div className={`admin-match-tools${compact ? " admin-match-tools--compact" : ""}${className ? ` ${className}` : ""}`}>
      <p className="admin-match-tools__title">管理员 · 匹配</p>
      {!compact ? (
        <p className="admin-match-tools__hint">
          用户点「开始匹配」会入队；你也可以直接触发后台跑一轮（处理全部 waiting）。
        </p>
      ) : null}
      <div className="admin-match-tools__actions">
        {batchAllowed ? (
          <button
            type="button"
            className="btn-primary text-sm py-2 px-4"
            disabled={running}
            onClick={() => void onRunBatch(runAdminBatchMatchOnce)}
          >
            {running ? "执行中…" : "立即跑一轮匹配"}
          </button>
        ) : null}
        {testBatchMatchTrigger ? (
          <button
            type="button"
            className="btn-ghost text-sm py-2 px-3"
            disabled={running}
            onClick={() => void onRunBatch(runTestBatchMatchOnce)}
          >
            测试跑一轮
          </button>
        ) : null}
        <Link to={`/matching-waiting${uidQs}`} className="admin-match-tools__link">
          匹配页
        </Link>
        <Link to="/admin/testing-observability" className="admin-match-tools__link">
          匹配监视器
        </Link>
      </div>
      {hint ? (
        <p className="chat-status-ok admin-match-tools__msg" role="status">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="chat-status-err admin-match-tools__msg" role="alert">
          {toFriendlyUserMessage(error.message)}
        </p>
      ) : null}
    </div>
  );
}
