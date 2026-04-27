import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  getAdminCapabilities,
  runAdminBatchMatchOnce,
  runAdminPostPoolOrchestrationMvp,
} from "../api/admin";
import { getAdminAiSimulationV1Job, postAdminAiSimulationV1RunJob } from "../api/ai-simulation-v1";
import { enqueueMatching, getMatchingStatus } from "../api/matching";
import { getLatestPreviewPool } from "../api/previewPool";
import {
  getTestMatchingCapabilities,
  runTestBatchMatchOnce,
} from "../api/testMatch";
import LoadingState from "../components/common/LoadingState";
import {
  minimalPayloadFromOrchestrationEnvelope,
  storeFinalMatchConsumptionHintForJob,
} from "../utils/finalMatchConsumptionHintStorage";
import { resolveUserId } from "../utils/resolveUserId";

const primaryBtn = {
  display: "inline-block",
  marginTop: "0.75rem",
  padding: "0.65rem 1.25rem",
  fontSize: "0.95rem",
  fontWeight: 600,
  border: "none",
  borderRadius: 8,
  background: "#1e293b",
  color: "#fff",
  cursor: "pointer",
  textAlign: "center",
  textDecoration: "none",
};

/** 与 PreviewPool 页一致：编排后是否串联 `POST .../jobs/:id/run`。 */
const PREVIEW_POOL_ORCH_CHAIN_RUN_JOB = import.meta.env.VITE_PREVIEW_POOL_ORCH_CHAIN_RUN_JOB === "1";
const PREVIEW_POOL_ORCH_RUN_JOB_TIMEOUT_MS = (() => {
  const n = Number(import.meta.env.VITE_PREVIEW_POOL_ORCH_RUN_JOB_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 30_000;
})();

function ssOrchAttempted(userId, poolId) {
  return `peima:g02:orchAttempted:${userId}:${poolId}`;
}

/** React Strict Mode 下双 mount 时合并为单次 orchestration POST。 */
const g02OrchestrationChainByViewerPool = new Map();
function ssLastJob(userId, poolId) {
  return `peima:g02:lastJobId:${userId}:${poolId}`;
}
function ssRunPosted(jobId) {
  return `peima:g02:runPosted:${jobId}`;
}

function bindingPreviewPoolId(shortlistBinding) {
  if (shortlistBinding == null || typeof shortlistBinding !== "object" || Array.isArray(shortlistBinding)) {
    return null;
  }
  const p = shortlistBinding.previewPoolId;
  return typeof p === "string" && p.trim() ? p.trim() : null;
}

function jobMatchesViewerPool(job, userId, poolId) {
  if (!job || job.viewerUserId !== userId || job.poolId !== poolId) return false;
  const bind = bindingPreviewPoolId(job.shortlistBinding);
  if (bind && bind !== poolId) return false;
  return true;
}

function isJobConsumableForFinalMatch(job) {
  return (
    job.jobStatus === "completed" &&
    job.jobAuditV0 != null &&
    typeof job.jobAuditV0 === "object" &&
    !Array.isArray(job.jobAuditV0) &&
    job.jobAuditV0.sidecarTrioPresent === true
  );
}

export default function MatchingWaitingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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

  /** Phase G v0.2：ready 分支下预览池与 AI 衔接 UI */
  const [readyPoolLoading, setReadyPoolLoading] = useState(false);
  const [readyPoolMissing, setReadyPoolMissing] = useState(false);
  const [readyPoolId, setReadyPoolId] = useState(null);
  const [readyAiGenerating, setReadyAiGenerating] = useState(false);
  const [readyAiJobId, setReadyAiJobId] = useState(null);
  const [readyAiFallback, setReadyAiFallback] = useState(false);
  const [readyAiError, setReadyAiError] = useState("");
  const navigatedToFinalRef = useRef(false);

  const load = useCallback(async () => {
    if (!userId) {
      setError(new Error("缺少当前账号信息：请先登录，或使用首页「继续匹配流程」。"));
      setStatusPayload(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getMatchingStatus(userId);
      setStatusPayload(data);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setStatusPayload(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

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

  const tryAutoRunJobOnce = useCallback(async (jobId) => {
    const id = String(jobId).trim();
    if (!id || !PREVIEW_POOL_ORCH_CHAIN_RUN_JOB) return;
    const rk = ssRunPosted(id);
    if (sessionStorage.getItem(rk)) return;
    sessionStorage.setItem(rk, "1");
    try {
      await postAdminAiSimulationV1RunJob(id, { timeoutMs: PREVIEW_POOL_ORCH_RUN_JOB_TIMEOUT_MS });
    } catch {
      /* 与 Preview Pool 一致：run 失败不阻塞，仅依赖后续 GET */
    }
  }, []);

  const navigateFinalWithJob = useCallback(
    (uid, jobId) => {
      if (navigatedToFinalRef.current) return;
      navigatedToFinalRef.current = true;
      navigate(
        `/final-match?userId=${encodeURIComponent(uid)}&aiSimJobId=${encodeURIComponent(jobId)}`,
        { replace: true },
      );
    },
    [navigate],
  );

  /** ready + 有池：编排 / GET job / run（带 session 防重），不离开本页直至 completed 可消费后 navigate */
  useEffect(() => {
    if (!userId || statusPayload?.status !== "ready") {
      navigatedToFinalRef.current = false;
      setReadyPoolLoading(false);
      setReadyPoolMissing(false);
      setReadyPoolId(null);
      setReadyAiGenerating(false);
      setReadyAiJobId(null);
      setReadyAiFallback(false);
      setReadyAiError("");
      return;
    }

    let cancelled = false;

    const setFallback = (msg = "") => {
      if (cancelled) return;
      setReadyAiGenerating(false);
      setReadyAiJobId(null);
      setReadyAiFallback(true);
      if (msg) setReadyAiError(msg);
    };

    const processJob = async (job, uid, poolId) => {
      if (!jobMatchesViewerPool(job, uid, poolId)) {
        try {
          sessionStorage.removeItem(ssLastJob(uid, poolId));
        } catch {
          /* ignore */
        }
        return "mismatch";
      }
      const stJob = job.jobStatus;
      if (stJob === "queued" || stJob === "running") {
        await tryAutoRunJobOnce(job.simulationJobId);
        if (cancelled) return "stop";
        setReadyAiGenerating(true);
        setReadyAiJobId(job.simulationJobId);
        setReadyAiFallback(false);
        setReadyAiError("");
        return "generating";
      }
      if (stJob === "completed") {
        if (isJobConsumableForFinalMatch(job)) {
          navigateFinalWithJob(uid, job.simulationJobId);
          return "done";
        }
        setFallback("匹配说明暂不可用，请直接查看匹配结果。");
        return "stop";
      }
      setFallback("匹配说明状态异常，请直接查看匹配结果。");
      return "stop";
    };

    (async () => {
      setReadyPoolLoading(true);
      setReadyPoolMissing(false);
      setReadyPoolId(null);
      setReadyAiGenerating(false);
      setReadyAiJobId(null);
      setReadyAiFallback(false);
      setReadyAiError("");

      let poolId = "";
      try {
        const bundle = await getLatestPreviewPool(userId);
        poolId = bundle.previewPool?.id?.trim() || "";
      } catch {
        if (cancelled) return;
        setReadyPoolLoading(false);
        setReadyPoolMissing(true);
        setReadyPoolId(null);
        return;
      }
      if (cancelled || !poolId) {
        if (!cancelled) {
          setReadyPoolLoading(false);
          setReadyPoolMissing(true);
          setReadyPoolId(null);
        }
        return;
      }
      setReadyPoolLoading(false);
      setReadyPoolMissing(false);
      setReadyPoolId(poolId);

      const uid = userId;
      let lastJobId = "";
      try {
        lastJobId = (sessionStorage.getItem(ssLastJob(uid, poolId)) || "").trim();
      } catch {
        lastJobId = "";
      }

      if (lastJobId) {
        try {
          const job = await getAdminAiSimulationV1Job(lastJobId);
          const r = await processJob(job, uid, poolId);
          if (cancelled || r === "done" || r === "stop" || r === "generating") return;
          if (r === "mismatch") {
            lastJobId = "";
          }
        } catch {
          try {
            sessionStorage.removeItem(ssLastJob(uid, poolId));
          } catch {
            /* ignore */
          }
          lastJobId = "";
        }
      }

      if (cancelled) return;

      if (!lastJobId) {
        let attempted = false;
        try {
          attempted = sessionStorage.getItem(ssOrchAttempted(uid, poolId)) === "1";
        } catch {
          attempted = false;
        }
        if (attempted) {
          setFallback("已尝试过自动生成说明，请直接查看匹配结果或稍后再试。");
          return;
        }

        const gate = `${uid}:${poolId}`;
        let chain = g02OrchestrationChainByViewerPool.get(gate);
        if (!chain) {
          chain = (async () => {
            const envelope = await runAdminPostPoolOrchestrationMvp({
              viewerUserId: uid,
              poolId,
              runMode: "mvp",
            });
            try {
              sessionStorage.setItem(ssOrchAttempted(uid, poolId), "1");
            } catch {
              /* ignore */
            }

            const rawJobId =
              envelope.finalMatchConsumptionHint?.aiSimulation?.simulationJobId ??
              envelope.deeplink?.query?.aiSimJobId ??
              "";
            const simulationJobId = typeof rawJobId === "string" ? rawJobId.trim() : "";
            const picked = minimalPayloadFromOrchestrationEnvelope(envelope);
            if (picked) {
              storeFinalMatchConsumptionHintForJob(picked.simulationJobId, picked.payload);
            }
            if (!simulationJobId) {
              return { kind: "no_job_id" };
            }
            try {
              sessionStorage.setItem(ssLastJob(uid, poolId), simulationJobId);
            } catch {
              /* ignore */
            }

            await tryAutoRunJobOnce(simulationJobId);
            const job = await getAdminAiSimulationV1Job(simulationJobId);
            return { kind: "ok", job };
          })();
          chain = chain.finally(() => {
            g02OrchestrationChainByViewerPool.delete(gate);
          });
          g02OrchestrationChainByViewerPool.set(gate, chain);
        }

        try {
          const out = await chain;
          if (cancelled) return;
          if (out && typeof out === "object" && "kind" in out) {
            if (out.kind === "no_job_id") {
              setFallback("说明生成未就绪，可直接查看匹配结果。");
              return;
            }
            if (out.kind === "ok" && "job" in out && out.job) {
              await processJob(out.job, uid, poolId);
            }
          }
        } catch (e) {
          if (cancelled) return;
          const msg = e instanceof Error ? e.message : String(e);
          setReadyAiError(msg);
          setReadyAiGenerating(false);
          setReadyAiJobId(null);
          setReadyAiFallback(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, statusPayload?.status, tryAutoRunJobOnce, navigateFinalWithJob]);

  /** queued / running：轮询 GET，不重复 orchestration / run */
  useEffect(() => {
    if (!userId || !readyPoolId || !readyAiJobId || !readyAiGenerating) return;

    const uid = userId;
    const poolId = readyPoolId;
    const jobId = readyAiJobId;

    const tick = async () => {
      try {
        const job = await getAdminAiSimulationV1Job(jobId);
        if (!jobMatchesViewerPool(job, uid, poolId)) {
          setReadyAiGenerating(false);
          setReadyAiJobId(null);
          setReadyAiFallback(true);
          setReadyAiError("说明与当前匹配池不一致，请刷新本页。");
          return;
        }
        if (isJobConsumableForFinalMatch(job)) {
          navigateFinalWithJob(uid, job.simulationJobId);
          return;
        }
        if (job.jobStatus === "completed") {
          setReadyAiGenerating(false);
          setReadyAiJobId(null);
          setReadyAiFallback(true);
          setReadyAiError("匹配说明暂不可用。");
          return;
        }
        if (job.jobStatus !== "queued" && job.jobStatus !== "running") {
          setReadyAiGenerating(false);
          setReadyAiJobId(null);
          setReadyAiFallback(true);
          setReadyAiError("说明生成已结束（未成功）。");
        }
      } catch {
        /* 忽略单次轮询错误 */
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), 2500);
    return () => window.clearInterval(id);
  }, [userId, readyPoolId, readyAiJobId, readyAiGenerating, navigateFinalWithJob]);

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

  const refreshAiJobStatus = useCallback(async () => {
    if (!userId || !readyPoolId || !readyAiJobId) return;
    try {
      const job = await getAdminAiSimulationV1Job(readyAiJobId);
      if (!jobMatchesViewerPool(job, userId, readyPoolId)) return;
      if (isJobConsumableForFinalMatch(job)) {
        navigateFinalWithJob(userId, job.simulationJobId);
      }
    } catch {
      /* ignore */
    }
  }, [userId, readyPoolId, readyAiJobId, navigateFinalWithJob]);

  const messageForStatus = (s) => {
    switch (s) {
      case "waiting":
        return "正在等待本轮匹配";
      case "processing":
        return "系统正在处理中";
      case "ready":
        return "匹配已完成，正在为你准备查看结果";
      case "not_queued":
        return "你还没有进入匹配队列";
      default:
        return `未知状态：${s}`;
    }
  };

  const st = statusPayload?.status;

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.25rem", color: "#0f172a" }}>匹配与说明</h1>
      <p style={{ fontSize: "0.88rem", marginBottom: "0.65rem", color: "#64748b", lineHeight: 1.5 }}>
        在这里查看<strong>排队与处理进度</strong>。结果就绪后，若你已有预览池，本页会自动准备<strong>匹配说明</strong>，完成后会打开
        <strong>最终结果</strong>页；你也可以在说明生成中留在本页，或稍后手动刷新。
      </p>
      {userId ? (
        <p style={{ color: "#94a3b8", fontSize: "0.8rem", marginTop: 0, marginBottom: "0.35rem" }}>
          当前流程已绑定到你的账号。
        </p>
      ) : null}

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

      <div style={{ marginTop: "1.5rem" }}>
        {userId && statusPayload && st === "ready" && readyPoolLoading ? (
          <LoadingState label="正在加载匹配池并准备说明…" />
        ) : null}

        {userId && statusPayload && st === "ready" && !readyPoolLoading && readyPoolMissing ? (
          <>
            <p style={{ fontSize: "0.88rem", color: "#64748b", marginTop: 0, marginBottom: "0.5rem", lineHeight: 1.5 }}>
              要生成<strong>匹配说明</strong>，需要先有<strong>预览池</strong>。请到预览池页<strong>手动创建一次</strong>（本页不会自动创建）；完成后返回本页即可继续。
            </p>
            <Link
              to={`/preview-pool?userId=${encodeURIComponent(userId)}`}
              style={primaryBtn}
            >
              去预览池创建匹配池
            </Link>
          </>
        ) : null}

        {userId && statusPayload && st === "ready" && !readyPoolLoading && !readyPoolMissing && readyAiGenerating ? (
          <>
            <p style={{ fontSize: "0.9rem", color: "#334155", marginTop: 0, marginBottom: "0.65rem", lineHeight: 1.5 }}>
              <strong>匹配说明</strong>正在生成，请留在本页。完成后将<strong>自动打开</strong>最终结果页（已带上说明引用）。
            </p>
            <button type="button" onClick={() => void refreshAiJobStatus()} style={primaryBtn}>
              刷新说明生成状态
            </button>
          </>
        ) : null}

        {userId && statusPayload && st === "ready" && !readyPoolLoading && !readyPoolMissing && readyAiFallback ? (
          <>
            {readyAiError ? (
              <p style={{ fontSize: "0.85rem", color: "#64748b", marginTop: 0, marginBottom: "0.5rem" }}>
                {readyAiError}
              </p>
            ) : null}
            <Link to={`/final-match?userId=${encodeURIComponent(userId)}`} style={primaryBtn}>
              查看匹配结果
            </Link>
          </>
        ) : null}

        {userId &&
        statusPayload &&
        st === "ready" &&
        !readyPoolLoading &&
        !readyPoolMissing &&
        !readyAiGenerating &&
        !readyAiFallback ? (
          <LoadingState label="正在准备匹配说明…" />
        ) : null}

        {userId && statusPayload && st === "not_queued" ? (
          <button
            type="button"
            onClick={onEnqueue}
            disabled={enqueueing || !userId}
            style={primaryBtn}
          >
            {enqueueing ? "入队中…" : "加入匹配队列"}
          </button>
        ) : null}
        {userId && statusPayload && st !== "ready" && st !== "not_queued" ? (
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || !userId}
            style={primaryBtn}
          >
            {loading ? "刷新中…" : "刷新匹配进度"}
          </button>
        ) : null}
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
          {userId ? (
            <p style={{ fontSize: "0.78rem", color: "#78350f", margin: "0 0 0.65rem", lineHeight: 1.5 }}>
              <Link
                to={`/preview-pool?userId=${encodeURIComponent(userId)}`}
                style={{ color: "#1d4ed8", textDecoration: "underline" }}
              >
                Round 2 编排（内部）
              </Link>
              — 跳转预览池页，使用 admin 内部编排链（非 C 端正式功能）。
            </p>
          ) : null}
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
