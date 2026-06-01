import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { runAdminPostPoolOrchestrationMvp } from "../api/admin";
import {
  createPairwiseDecisionJob,
  getPairwiseDecisionJob,
  runPairwiseDecisionJob,
} from "../api/ai-pairwise-decision";
import { getViewerAiSimulationV1Job, postAdminAiSimulationV1RunJob } from "../api/ai-simulation-v1";
import { getToken } from "../api/auth";
import {
  enqueueMatching,
  finalizeWithPairwise,
  getMatchingResult,
  getMatchingStatus,
} from "../api/matching";
import { getLatestPreviewPool } from "../api/previewPool";
import AdminMatchTools from "../components/matching/AdminMatchTools";
import LoadingState from "../components/common/LoadingState";
import AppContent from "../components/layout/AppContent";
import AlertBanner from "../components/ui/AlertBanner";
import GlassCard from "../components/ui/GlassCard";
import { useAdminAccess } from "../hooks/useAdminAccess";
import { matchingWaitProgressLine, toFriendlyUserMessage } from "../utils/friendlyErrors";
import {
  minimalPayloadFromOrchestrationEnvelope,
  storeFinalMatchConsumptionHintForJob,
} from "../utils/finalMatchConsumptionHintStorage";
import { resolveUserId } from "../utils/resolveUserId";

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

/** M3.8-M6: dedupe pairwise create+run per viewer+pool (StrictMode / remount). */
const m38PairwiseBootstrapByGate = new Map();

/** M3.8-M12A: dedupe finalize POST per viewer+pool+pairwiseJob (StrictMode). */
const m38FinalizePromiseByGate = new Map();

function ssPairwiseJobId(userId, poolId) {
  return `peima:m38:pairwiseJobId:${userId}:${poolId}`;
}

const PAIRWISE_POLL_MS = 5000;
const PAIRWISE_DEADLINE_MS = 90_000;

/** M5.4-M1：rematch 模式下轮询新 MatchResult.id，避免旧 ready 直接跳 final。 */
const REMATCH_LATEST_POLL_MS = 2500;
const REMATCH_READY_MAX_MS = 5 * 60 * 1000;

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
  const baselineResultId = useMemo(
    () => (searchParams.get("baselineResultId") || "").trim(),
    [searchParams],
  );
  const isRematchMode = useMemo(
    () => searchParams.get("rematch") === "1" && baselineResultId.length > 0,
    [searchParams, baselineResultId],
  );
  const isDebugMode = useMemo(() => searchParams.get("debug") === "1", [searchParams]);
  const { isAdmin } = useAdminAccess();
  const showDebug = isDebugMode && isAdmin;

  const [statusPayload, setStatusPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [enqueueing, setEnqueueing] = useState(false);
  const [enqueueHint, setEnqueueHint] = useState("");
  /** Phase G v0.2：ready 分支下预览池与 AI 衔接 UI */
  const [readyPoolLoading, setReadyPoolLoading] = useState(false);
  const [readyPoolMissing, setReadyPoolMissing] = useState(false);
  const [readyPoolId, setReadyPoolId] = useState(null);
  const [readyAiFallback, setReadyAiFallback] = useState(false);
  const [readyAiError, setReadyAiError] = useState("");
  const navigatedToFinalRef = useRef(false);
  /** M5.4-M1：status 已是 ready 但 GET result 仍为 baseline 行时，禁止走自动跳转链。 */
  const [rematchAwaitingNewRow, setRematchAwaitingNewRow] = useState(false);
  const [rematchNewResultNonce, setRematchNewResultNonce] = useState(0);
  const [rematchReadyWaitError, setRematchReadyWaitError] = useState(
    /** @type {string | null} */
    (null),
  );
  const rematchStaleWaitStartedAtRef = useRef(null);

  /** M3.8-M6: viewer pairwise poll (no A/B UI; does not gate FinalMatch navigation). */
  const [pairwiseJobId, setPairwiseJobId] = useState(null);
  const [
    pairwiseStatus,
    setPairwiseStatus,
  ] = useState(
    /** @type {"idle"|"creating"|"queued"|"running"|"succeeded"|"failed"|"timeout"|"skipped"} */
    ("idle"),
  );
  const [pairwiseStartedAt, setPairwiseStartedAt] = useState(null);
  const [pairwiseProposalReady, setPairwiseProposalReady] = useState(false);
  const [pairwiseErrorMessage, setPairwiseErrorMessage] = useState("");
  const pairwisePollRef = useRef(null);
  const pairwiseDeadlineMsRef = useRef(null);

  /** M3.8-M12A: finalize sidecar — does not gate FinalMatch navigation or change displayed candidate. */
  const [pairwiseFinalizeStatus, setPairwiseFinalizeStatus] = useState(
    /** @type {"idle"|"finalizing"|"finalized"|"already_frozen"|"disabled"|"failed"|"skipped"} */
    ("idle"),
  );
  const [pairwiseFinalizeErrorMessage, setPairwiseFinalizeErrorMessage] = useState("");

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

  const tryAutoRunJobOnce = useCallback((jobId) => {
    const id = String(jobId).trim();
    if (!id || !PREVIEW_POOL_ORCH_CHAIN_RUN_JOB) return;
    const rk = ssRunPosted(id);
    if (sessionStorage.getItem(rk)) return;
    sessionStorage.setItem(rk, "1");
    void postAdminAiSimulationV1RunJob(id, { timeoutMs: PREVIEW_POOL_ORCH_RUN_JOB_TIMEOUT_MS }).catch(() => {
      /* 与 Preview Pool 一致：run 失败不阻塞，仅依赖后续 GET */
    });
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

  /** M5.4-M1：rematch 且仍卡在旧 result 时轮询 GET result，超时则提示错误。 */
  useEffect(() => {
    if (!userId || !isRematchMode || !baselineResultId) return;
    if (!rematchAwaitingNewRow) return;

    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      const started = rematchStaleWaitStartedAtRef.current;
      if (started != null && Date.now() - started > REMATCH_READY_MAX_MS) {
        setRematchReadyWaitError("等待新匹配结果超时，请返回最终结果页重试或使用「重新匹配」。");
        setRematchAwaitingNewRow(false);
        rematchStaleWaitStartedAtRef.current = null;
        return;
      }
      try {
        const latest = await getMatchingResult(userId);
        if (cancelled) return;
        if (latest?.id && latest.id !== baselineResultId) {
          rematchStaleWaitStartedAtRef.current = null;
          setRematchAwaitingNewRow(false);
          setRematchReadyWaitError(null);
          setRematchNewResultNonce((n) => n + 1);
        }
      } catch {
        /* 单次失败不阻塞；依赖下次 tick */
      }
    };

    const id = window.setInterval(() => void tick(), REMATCH_LATEST_POLL_MS);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [userId, isRematchMode, baselineResultId, rematchAwaitingNewRow]);

  /** ready + 有池：编排 / GET job / run（带 session 防重），不离开本页直至 completed 可消费后 navigate */
  useEffect(() => {
    if (!userId || statusPayload?.status !== "ready") {
      navigatedToFinalRef.current = false;
      setReadyPoolLoading(false);
      setReadyPoolMissing(false);
      setReadyPoolId(null);
      setReadyAiFallback(false);
      setReadyAiError("");
      setRematchAwaitingNewRow(false);
      setRematchReadyWaitError(null);
      rematchStaleWaitStartedAtRef.current = null;
      return;
    }

    let cancelled = false;

    const setFallback = (msg = "") => {
      if (cancelled) return;
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
        void tryAutoRunJobOnce(job.simulationJobId);
        if (cancelled) return "stop";
        navigateFinalWithJob(uid, job.simulationJobId);
        return "done";
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
      setReadyAiFallback(false);
      setReadyAiError("");

      if (isRematchMode && baselineResultId) {
        try {
          const latest = await getMatchingResult(userId);
          if (cancelled) return;
          if (latest?.id === baselineResultId) {
            setReadyPoolLoading(false);
            setReadyPoolMissing(false);
            setReadyPoolId(null);
            setRematchAwaitingNewRow(true);
            setRematchReadyWaitError(null);
            rematchStaleWaitStartedAtRef.current =
              rematchStaleWaitStartedAtRef.current ?? Date.now();
            return;
          }
        } catch (e) {
          if (!cancelled) {
            setReadyPoolLoading(false);
            setReadyPoolMissing(false);
            setReadyPoolId(null);
            setError(e instanceof Error ? e : new Error(String(e)));
          }
          return;
        }
        rematchStaleWaitStartedAtRef.current = null;
        setRematchAwaitingNewRow(false);
        setRematchReadyWaitError(null);
      } else {
        setRematchAwaitingNewRow(false);
        setRematchReadyWaitError(null);
        rematchStaleWaitStartedAtRef.current = null;
      }

      setReadyPoolLoading(true);
      setReadyPoolMissing(false);
      setReadyPoolId(null);

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
          const job = await getViewerAiSimulationV1Job(lastJobId);
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

            void tryAutoRunJobOnce(simulationJobId);
            const job = await getViewerAiSimulationV1Job(simulationJobId);
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
          setReadyAiFallback(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    userId,
    statusPayload?.status,
    tryAutoRunJobOnce,
    navigateFinalWithJob,
    isRematchMode,
    baselineResultId,
    rematchNewResultNonce,
  ]);

  /** M3.8-M6: pairwise create → run → poll (5s / 90s cap); does not block orchestration or FinalMatch. */
  useEffect(() => {
    if (
      !userId ||
      statusPayload?.status !== "ready" ||
      readyPoolMissing ||
      !readyPoolId ||
      readyPoolLoading
    ) {
      if (pairwisePollRef.current) {
        clearInterval(pairwisePollRef.current);
        pairwisePollRef.current = null;
      }
      setPairwiseJobId(null);
      setPairwiseStatus("idle");
      setPairwiseStartedAt(null);
      setPairwiseProposalReady(false);
      setPairwiseErrorMessage("");
      pairwiseDeadlineMsRef.current = null;
      setPairwiseFinalizeStatus("idle");
      setPairwiseFinalizeErrorMessage("");
      return undefined;
    }

    if (!getToken()) {
      setPairwiseStatus("skipped");
      setPairwiseFinalizeStatus("skipped");
      return undefined;
    }

    const poolId = readyPoolId;
    const uid = userId;
    let cancelled = false;

    const clearPoll = () => {
      if (pairwisePollRef.current) {
        clearInterval(pairwisePollRef.current);
        pairwisePollRef.current = null;
      }
    };

    const mapUiFromApiStatus = (st) => {
      if (st === "queued") return "queued";
      if (st === "running") return "running";
      if (st === "succeeded") return "succeeded";
      if (st === "failed") return "failed";
      return "queued";
    };

    let lastTerminal = false;

    (async () => {
      try {
        let jobId = "";
        try {
          jobId = (sessionStorage.getItem(ssPairwiseJobId(uid, poolId)) || "").trim();
        } catch {
          jobId = "";
        }

        const gate = `${uid}:${poolId}`;
        if (!jobId) {
          setPairwiseStatus("creating");
          let boot = m38PairwiseBootstrapByGate.get(gate);
          if (!boot) {
            const p = (async () => {
              const { job } = await createPairwiseDecisionJob(poolId);
              await runPairwiseDecisionJob(job.id);
              try {
                sessionStorage.setItem(ssPairwiseJobId(uid, poolId), job.id);
              } catch {
                /* ignore */
              }
              return job.id;
            })();
            m38PairwiseBootstrapByGate.set(gate, p);
            p.finally(() => {
              m38PairwiseBootstrapByGate.delete(gate);
            });
            boot = p;
          }
          jobId = await boot;
          if (cancelled) return;
        }

        setPairwiseJobId(jobId);
        const started = Date.now();
        setPairwiseStartedAt(started);
        pairwiseDeadlineMsRef.current = started + PAIRWISE_DEADLINE_MS;

        const tick = async () => {
          if (cancelled) return;
          const deadline = pairwiseDeadlineMsRef.current ?? started + PAIRWISE_DEADLINE_MS;
          if (Date.now() > deadline) {
            setPairwiseStatus("timeout");
            setPairwiseFinalizeStatus("skipped");
            lastTerminal = true;
            clearPoll();
            return;
          }
          try {
            const job = await getPairwiseDecisionJob(jobId);
            if (cancelled) return;
            const ui = mapUiFromApiStatus(job.status);
            setPairwiseStatus(ui);
            if (job.status === "succeeded") {
              setPairwiseProposalReady(true);
              lastTerminal = true;
              clearPoll();
              return;
            }
            if (job.status === "failed") {
              lastTerminal = true;
              clearPoll();
            }
          } catch (e) {
            if (cancelled) return;
            setPairwiseStatus("failed");
            setPairwiseErrorMessage(e instanceof Error ? e.message : String(e));
            lastTerminal = true;
            clearPoll();
          }
        };

        await tick();
        if (cancelled || lastTerminal) return;
        pairwisePollRef.current = window.setInterval(() => {
          void tick();
        }, PAIRWISE_POLL_MS);
      } catch (e) {
        if (!cancelled) {
          setPairwiseStatus("failed");
          setPairwiseErrorMessage(e instanceof Error ? e.message : String(e));
        }
      }
    })();

    return () => {
      cancelled = true;
      clearPoll();
    };
  }, [userId, statusPayload?.status, readyPoolId, readyPoolMissing, readyPoolLoading]);

  /** M3.8-M12A: POST finalize-with-pairwise after terminal pairwise (succeeded/failed); timeout skips; StrictMode-safe via shared promise map. */
  useEffect(() => {
    if (!userId || !readyPoolId || readyPoolMissing || readyPoolLoading) return;
    if (!pairwiseJobId) return;
    if (pairwiseStatus !== "succeeded" && pairwiseStatus !== "failed") return;
    if (!getToken()) return;

    let cancelled = false;
    const gate = `${userId}:${readyPoolId}:${pairwiseJobId}`;
    setPairwiseFinalizeStatus((prev) => (prev === "skipped" ? prev : "finalizing"));
    setPairwiseFinalizeErrorMessage("");

    let chain = m38FinalizePromiseByGate.get(gate);
    if (!chain) {
      chain = finalizeWithPairwise({ poolId: readyPoolId, pairwiseJobId }).finally(() => {
        m38FinalizePromiseByGate.delete(gate);
      });
      m38FinalizePromiseByGate.set(gate, chain);
    }

    void (async () => {
      try {
        const r = await chain;
        if (cancelled) return;
        if (r.status === "finalized" || r.status === "already_frozen") {
          setPairwiseFinalizeStatus(r.status === "already_frozen" ? "already_frozen" : "finalized");
          return;
        }
        if (r.status === "disabled") {
          setPairwiseFinalizeStatus("disabled");
          return;
        }
        if (r.status === "pending") {
          setPairwiseFinalizeStatus("skipped");
          return;
        }
        setPairwiseFinalizeStatus("skipped");
      } catch (e) {
        if (cancelled) return;
        setPairwiseFinalizeErrorMessage(e instanceof Error ? e.message : String(e));
        setPairwiseFinalizeStatus("failed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, readyPoolId, readyPoolMissing, readyPoolLoading, pairwiseJobId, pairwiseStatus]);

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
        return "已收到你的匹配请求，排队中…";
      case "processing":
        return "正在为你筛选合适的人选…";
      case "ready":
        return null;
      case "not_queued":
        return "还没有开始匹配，点下面按钮即可加入";
      default:
        return showDebug ? `未知状态：${s}` : "正在处理，请稍候";
    }
  };

  const st = statusPayload?.status;
  const primaryStatusLine =
    st === "ready" && isRematchMode && rematchAwaitingNewRow
      ? "上一轮结果仍显示为「已完成」；正在等待本轮新匹配写入…"
      : messageForStatus(st);

  const pairwisePrimaryLine = matchingWaitProgressLine(pairwiseStatus);

  const readyCanViewResults =
    Boolean(userId && statusPayload && st === "ready" && !readyPoolLoading && !readyPoolMissing);

  const showPairwiseProgress =
    readyCanViewResults &&
    !readyAiFallback &&
    (pairwiseStatus === "creating" || pairwiseStatus === "queued" || pairwiseStatus === "running");

  const showReadyHero = readyCanViewResults && readyAiFallback;

  return (
    <AppContent
      maxWidth="max-w-xl"
      title="匹配结果"
      subtitle={
        showReadyHero
          ? "人选已就绪，马上带你查看。"
          : st === "ready"
            ? "正在打开结果页，请稍候…"
            : "完成后会自动进入下一步。"
      }
    >
      {loading && <LoadingState />}
      {error && (
        <AlertBanner variant="error" className="mb-4">
          {toFriendlyUserMessage(error.message)}
        </AlertBanner>
      )}
      {rematchReadyWaitError ? (
        <p className="chat-status-err mt-2" role="alert">
          {toFriendlyUserMessage(rematchReadyWaitError)}
        </p>
      ) : null}
      {isRematchMode && rematchAwaitingNewRow && !rematchReadyWaitError ? (
        <p className="text-sm text-white/55 mt-2 leading-relaxed" role="status">
          新一轮匹配进行中，请稍候，准备好后会自动进入结果页。
        </p>
      ) : null}

      {!loading && statusPayload && primaryStatusLine && !showReadyHero ? (
        <p className="text-base text-white/90 mt-4">{primaryStatusLine}</p>
      ) : null}

      {showPairwiseProgress && pairwisePrimaryLine ? (
        <p className="matching-waiting-inline-progress mt-4" role="status">
          <span className="matching-waiting-spinner" aria-hidden />
          {pairwisePrimaryLine}
        </p>
      ) : null}

      {showReadyHero ? (
        <section className="matching-waiting-ready mt-5" aria-live="polite">
          <p className="matching-waiting-ready__emoji" aria-hidden>
            ✓
          </p>
          <p className="matching-waiting-ready__title">已经为你匹配好了</p>
          <p className="matching-waiting-ready__hint">
            若没有自动跳转，点下面按钮即可查看。
          </p>
          <Link
            to={`/final-match?userId=${encodeURIComponent(userId)}`}
            className="btn-primary inline-block text-sm py-3 px-6 no-underline mt-4"
          >
            去看匹配结果
          </Link>
        </section>
      ) : null}

      {enqueueHint ? (
        <p className="chat-status-ok mt-3" role="status">
          {enqueueHint}
        </p>
      ) : null}

      <div style={{ marginTop: "1.5rem" }}>
        {userId && statusPayload && st === "ready" && readyPoolLoading ? (
          <LoadingState label="正在加载匹配池并准备说明…" />
        ) : null}

        {showDebug && readyCanViewResults ? (
          <section
            className="matching-waiting-note__tech mt-3 p-3 rounded-xl"
            data-m38-pairwise-status={pairwiseStatus}
            data-m38-pairwise-finalize-status={pairwiseFinalizeStatus}
          >
            pairwise: {pairwiseStatus}
            {pairwiseErrorMessage ? ` · ${pairwiseErrorMessage}` : ""}
          </section>
        ) : null}

        {userId && statusPayload && st === "ready" && !readyPoolLoading && readyPoolMissing ? (
          <>
            <p className="text-sm text-white/55 mb-3 leading-relaxed">
              还需要一步预览准备。请先到预览页确认人选，再返回本页继续。
            </p>
            <Link
              to={`/preview-pool?userId=${encodeURIComponent(userId)}`}
              className="btn-primary inline-block text-sm py-2.5 px-5 no-underline mt-2"
            >
              前往预览
            </Link>
          </>
        ) : null}

        {showDebug && readyAiError ? (
          <p className="text-xs text-white/45 mt-2">{readyAiError}</p>
        ) : null}

        {readyCanViewResults && !readyAiFallback && !showReadyHero ? (
          <LoadingState label="正在打开结果页…" />
        ) : null}

        {userId && statusPayload && st === "not_queued" ? (
          <button
            type="button"
            onClick={onEnqueue}
            disabled={enqueueing || !userId}
            className="btn-primary text-sm py-2.5 px-5 mt-3"
          >
            {enqueueing ? "入队中…" : "开始匹配"}
          </button>
        ) : null}
        {userId && statusPayload && st !== "ready" && st !== "not_queued" ? (
          <button
            type="button"
            className="btn-ghost text-sm py-2 px-4 mt-3"
            onClick={() => void load()}
            disabled={loading || !userId}
          >
            {loading ? "刷新中…" : "刷新一下"}
          </button>
        ) : null}
      </div>

      {isAdmin ? (
        <GlassCard className="mt-8 p-4">
          <AdminMatchTools userId={userId} />
        </GlassCard>
      ) : null}

      {showDebug && userId ? (
        <GlassCard className="mt-4 p-4">
          <AlertBanner variant="admin" title="调试">
            <Link
              to={`/preview-pool?userId=${encodeURIComponent(userId)}`}
              className="text-amber-200 underline text-xs"
            >
              匹配预览池（Legacy）
            </Link>
          </AlertBanner>
        </GlassCard>
      ) : null}
    </AppContent>
  );
}
