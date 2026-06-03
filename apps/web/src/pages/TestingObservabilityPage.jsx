import { useCallback, useEffect, useMemo, useState } from "react";
import { getMatchingObservabilitySummary } from "../api/admin";
import {
  fetchTestingObservabilityMatches,
  fetchTestingObservabilityUserDetail,
  fetchTestingObservabilityUsers,
  getTestingObservabilityToken,
  setTestingObservabilityToken,
  submitTestingMatchFeedback,
} from "../api/testingObservability";
import AdminDataTable from "../components/admin/AdminDataTable";
import AdminEmptyState from "../components/admin/AdminEmptyState";
import AdminFilterPanel from "../components/admin/AdminFilterPanel";
import AdminIdPill from "../components/admin/AdminIdPill";
import AdminJsonBlock from "../components/admin/AdminJsonBlock";
import AdminKpiGrid from "../components/admin/AdminKpiGrid";
import AdminNotice from "../components/admin/AdminNotice";
import AdminPageShell from "../components/admin/AdminPageShell";
import AdminSection from "../components/admin/AdminSection";
import AdminStatusBadge from "../components/admin/AdminStatusBadge";
import TestingMatchUserCell from "../components/admin/TestingMatchUserCell";
import { adminBtnPrimary, adminInput, adminLabel, adminMuted } from "../components/admin/adminTheme";
import LoadingState from "../components/common/LoadingState";

function fmtMatchScore(n) {
  return typeof n === "number" && Number.isFinite(n) ? n.toFixed(4) : "—";
}

const FEEDBACK_RATINGS = [
  "accurate",
  "okay",
  "inaccurate",
  "confusing",
  "photo_pool_inaccurate",
  "profile_inaccurate",
  "explanation_helpful",
  "explanation_not_helpful",
  "want_to_continue",
  "do_not_want_to_continue",
];

function timelineTone(status) {
  if (status === "success") return "success";
  if (status === "failed") return "failed";
  if (status === "pending") return "pending";
  return "muted";
}

export default function TestingObservabilityPage() {
  const [token, setToken] = useState(() => getTestingObservabilityToken());
  const [users, setUsers] = useState([]);
  const [recentMatches, setRecentMatches] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [detail, setDetail] = useState(null);
  const [matchSummary, setMatchSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [feedbackRating, setFeedbackRating] = useState("accurate");
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackMsg, setFeedbackMsg] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setTestingObservabilityToken(token);
      const data = await fetchTestingObservabilityUsers(token);
      setUsers(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      setUsers([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadDetail = useCallback(
    async (userId) => {
      if (!userId) {
        setDetail(null);
        return;
      }
      setDetailLoading(true);
      setError("");
      try {
        setTestingObservabilityToken(token);
        const data = await fetchTestingObservabilityUserDetail(token, userId);
        setDetail(data);
      } catch (e) {
        setDetail(null);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setDetailLoading(false);
      }
    },
    [token],
  );

  const loadRecentMatches = useCallback(async () => {
    try {
      setTestingObservabilityToken(token);
      const data = await fetchTestingObservabilityMatches(token, 50);
      setRecentMatches(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setRecentMatches([]);
    }
  }, [token]);

  const loadMatchObsSummary = useCallback(async () => {
    try {
      const data = await getMatchingObservabilitySummary({ limit: 500, sinceDays: 30 });
      setMatchSummary(data);
    } catch {
      setMatchSummary(null);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
    void loadRecentMatches();
    void loadMatchObsSummary();
  }, [loadUsers, loadRecentMatches, loadMatchObsSummary]);

  useEffect(() => {
    if (selectedUserId) {
      void loadDetail(selectedUserId);
    }
  }, [selectedUserId, loadDetail]);

  const userColumns = useMemo(
    () => [
      {
        key: "userId",
        label: "userId",
        render: (row) => (
          <button
            type="button"
            className="text-left"
            onClick={() => setSelectedUserId(row.userId)}
          >
            <AdminIdPill id={row.userId} />
          </button>
        ),
      },
      { key: "displayName", label: "昵称" },
      {
        key: "onboardingStatus",
        label: "流程",
        render: (row) => <AdminStatusBadge status={row.onboardingStatus} tone="pending" />,
      },
      {
        key: "latestDisplaySourceType",
        label: "displaySource",
        render: (row) =>
          row.latestDisplaySourceType ? (
            <AdminStatusBadge status={row.latestDisplaySourceType} tone="applied" />
          ) : (
            "—"
          ),
      },
      {
        key: "flags",
        label: "标志",
        render: (row) => (
          <span className="text-xs text-white/60">
            {row.hasPreviewPool ? "池 " : ""}
            {row.hasQuestionnaireProfile ? "问卷 " : ""}
            {row.hasMatchResult ? "匹配" : ""}
          </span>
        ),
      },
    ],
    [],
  );

  const sections = detail?.sections;
  const onboarding = sections?.onboarding;
  const questionnaire = sections?.questionnaire;
  const match = sections?.match?.latest;
  const matchHistory = sections?.match?.history ?? [];
  const timeline = sections?.timeline ?? [];

  const matchDetailColumns = useMemo(
    () => [
      {
        key: "pairing",
        label: "配对",
        render: (row) => (
          <div className="min-w-[200px]">
            <p className="text-sm text-white/90 font-medium">
              {row.pairingSummary ?? `${row.viewerUserId} → ${row.candidateUserId}`}
            </p>
            {row.pairingDetail && row.pairingDetail !== row.pairingSummary ? (
              <p className="text-xs text-white/55 mt-0.5">{row.pairingDetail}</p>
            ) : null}
            {row.isMutualMatch ? (
              <span className="inline-block mt-1 text-[0.65rem] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-400/30">
                双向匹配
              </span>
            ) : (
              <span className="inline-block mt-1 text-[0.65rem] text-white/40">单向</span>
            )}
          </div>
        ),
      },
      {
        key: "viewer",
        label: "viewer（看谁）",
        render: (row) => (
          <TestingMatchUserCell
            brief={row.viewer ?? { userId: row.viewerUserId, nickname: null }}
            role="viewer"
            onSelectUserId={setSelectedUserId}
          />
        ),
      },
      {
        key: "candidate",
        label: "candidate（配到谁）",
        render: (row) => (
          <TestingMatchUserCell
            brief={row.candidate ?? { userId: row.candidateUserId, nickname: null }}
            role="candidate"
            onSelectUserId={setSelectedUserId}
          />
        ),
      },
      {
        key: "display",
        label: "展示",
        render: (row) => (
          <div className="text-xs text-white/70 max-w-[160px]">
            <AdminStatusBadge status={row.displaySourceType} tone="applied" />
            {row.displayCandidateDiffers && row.displayCandidate ? (
              <p className="mt-1 text-amber-200/90">
                展示对象 ≠ 库内 candidate：
                <span className="block mt-0.5 text-white/80">
                  {row.displayCandidate.nickname || row.displayCandidate.userId}
                </span>
              </p>
            ) : null}
            {row.fallbackUsed === true ? (
              <p className="mt-1 text-amber-200/80">fallback</p>
            ) : null}
          </div>
        ),
      },
      {
        key: "finalScore",
        label: "score",
        render: (row) => fmtMatchScore(row.finalScore),
      },
      {
        key: "matchResultId",
        label: "结果 ID",
        render: (row) => (
          <AdminIdPill id={row.matchResultId} truncate={14} title={row.matchResultId} />
        ),
      },
      { key: "createdAt", label: "created" },
    ],
    [],
  );

  const matchColumns = matchDetailColumns;

  const submitFeedback = async () => {
    if (!selectedUserId) return;
    setFeedbackMsg("");
    try {
      await submitTestingMatchFeedback(token, {
        userId: selectedUserId,
        matchResultId: match?.matchResultId,
        rating: feedbackRating,
        freeText: feedbackText.trim() || undefined,
        source: "testing_monitor_ui",
      });
      setFeedbackMsg("反馈已记录（仅测试表，不改 MatchResult）");
      setFeedbackText("");
      void loadDetail(selectedUserId);
    } catch (e) {
      setFeedbackMsg(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <AdminPageShell
      title="测试监视器"
      subtitle="管理员 · 流程状态 · 匹配结果 · 测试反馈（只读 + 测试反馈写入）"
      actions={
        <>
          <button
            type="button"
            className="btn-ghost text-sm"
            onClick={() => {
              void loadUsers();
              void loadRecentMatches();
            }}
            disabled={loading}
          >
            {loading ? "刷新中…" : "刷新"}
          </button>
        </>
      }
      maxWidth="max-w-7xl"
    >
      <AdminNotice variant="internal" title="启用与登录">
        线上需在 API 容器设置 <code className="text-white/80">PEIMA_TEST_OBSERVABILITY_ENABLED=1</code> 并重启。
        用管理员账号登录即可（<code className="text-white/80">PEIMA_ADMIN_USER_IDS</code>）；本地可选{" "}
        <code className="text-white/80">PEIMA_TEST_OBSERVABILITY_TOKEN</code> + 下方 debug token。
      </AdminNotice>

      <AdminNotice variant="warning" title="「测试跑一轮」≠ 你一定会有匹配">
        该按钮只处理<strong>已在队列里 waiting</strong> 的用户；须先在自己的匹配页点「开始匹配」入队。
        若预览池未 3-2-1、问卷未收敛、或 worker 未写入 MatchResult，这里会显示「尚无 MatchResult」。
        测试环境写入结果还需 <code className="text-white/80">PEIMA_TEST_MATCH_RESULT_WRITER_USER_IDS</code> 包含你的 userId。
      </AdminNotice>

      <AdminFilterPanel title="Debug Token（可选）">
        <label className={adminLabel}>
          x-peima-debug-token
          <input
            className={`${adminInput} min-w-[240px]`}
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="local-dev-only"
          />
        </label>
        <button type="button" className={adminBtnPrimary} onClick={() => void loadUsers()}>
          应用并刷新
        </button>
      </AdminFilterPanel>

      {error ? (
        <AdminNotice variant="warning">{error}</AdminNotice>
      ) : null}

      {loading ? <LoadingState label="加载测试用户…" /> : null}

      <AdminSection title="最近匹配结果（全站）">
        <AdminDataTable
          columns={matchColumns}
          rows={recentMatches}
          rowKey="matchResultId"
          emptyMessage="暂无 MatchResult，或监视器未启用 / 未登录管理员"
        />
      </AdminSection>

      <AdminSection title="最近测试用户">
        <AdminDataTable
          columns={userColumns}
          rows={users}
          rowKey="userId"
          emptyMessage="暂无用户或 API 未启用"
        />
      </AdminSection>

      {selectedUserId ? (
        <>
          {detailLoading ? <LoadingState label="加载用户详情…" /> : null}
          {sections ? (
            <>
              <AdminSection title={`用户详情 · ${selectedUserId}`}>
                <p className={adminMuted}>
                  选中用户：<AdminIdPill id={selectedUserId} truncate={24} />
                </p>
              </AdminSection>

              <AdminSection title="流程 Timeline">
                <div className="grid gap-2 sm:grid-cols-2">
                  {timeline.map((item) => (
                    <div key={item.key} className="glass rounded-xl p-3 border border-white/10">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-white/85">{item.label}</span>
                        <AdminStatusBadge status={item.status} tone={timelineTone(item.status)} />
                      </div>
                      <p className={`${adminMuted} mt-1`}>
                        {item.createdAt ?? "—"}
                        {item.sourceVersion ? ` · ${item.sourceVersion}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </AdminSection>

              <AdminSection title="Onboarding · 3-2-1 预览池">
                {onboarding ? (
                  <>
                    <AdminKpiGrid
                      items={[
                        { label: "upload", value: onboarding.uploadStatus },
                        { label: "preference", value: onboarding.preferenceStatus },
                        { label: "previewPool", value: onboarding.previewPoolStatus },
                        {
                          label: "3-2-1 valid",
                          value: onboarding.poolCounts?.isThreeTwoOneValid ? "yes" : "no",
                          danger: onboarding.poolCounts && !onboarding.poolCounts.isThreeTwoOneValid,
                        },
                      ]}
                    />
                    {onboarding.poolCounts ? (
                      <AdminKpiGrid
                        className="mt-2"
                        items={[
                          { label: "aesthetic (3)", value: onboarding.poolCounts.aestheticMatchCount },
                          { label: "similar (2)", value: onboarding.poolCounts.similarStyleCount },
                          { label: "exploration (1)", value: onboarding.poolCounts.explorationCount },
                          { label: "total", value: onboarding.poolCounts.totalCount },
                        ]}
                      />
                    ) : (
                      <AdminEmptyState message="尚无 active 预览池" />
                    )}
                    {onboarding.selfMatchDetected ? (
                      <AdminNotice variant="warning" className="mt-2">
                        检测到 self-match（候选含 viewer 自身）
                      </AdminNotice>
                    ) : null}
                    <p className={`${adminMuted} mt-2`}>
                      候选 ID（安全）：{" "}
                      {onboarding.safeCandidateUserIds.map((id) => (
                        <AdminIdPill key={id} id={id} className="mr-1" />
                      ))}
                    </p>
                  </>
                ) : null}
              </AdminSection>

              <AdminSection title="问卷收敛">
                {questionnaire ? (
                  <AdminKpiGrid
                    items={[
                      { label: "answered", value: `${questionnaire.answeredCount}/${questionnaire.requiredCount}` },
                      { label: "convergence", value: questionnaire.convergenceStatus },
                      {
                        label: "profile completeness",
                        value: questionnaire.profileDimensionCompleteness,
                      },
                      {
                        label: "confidence",
                        value: questionnaire.safeProfileSummary?.confidence ?? "—",
                      },
                    ]}
                  />
                ) : null}
              </AdminSection>

              <AdminSection title="Match · 来源与 Sidecar">
                {match ? (
                  <>
                    {match.pairingSummary ? (
                      <p className="text-sm text-white/90 mb-3">
                        <span className="font-medium">{match.pairingSummary}</span>
                        {match.isMutualMatch ? (
                          <span className="ml-2 text-xs text-emerald-300">（双向匹配）</span>
                        ) : null}
                        {match.pairingDetail ? (
                          <span className={`${adminMuted} block mt-1`}>{match.pairingDetail}</span>
                        ) : null}
                      </p>
                    ) : null}
                    <div className="grid gap-4 sm:grid-cols-2 mb-4">
                      <TestingMatchUserCell
                        brief={match.viewer ?? { userId: match.viewerUserId, nickname: null }}
                        role="viewer"
                      />
                      <TestingMatchUserCell
                        brief={match.candidate ?? { userId: match.candidateUserId, nickname: null }}
                        role="candidate"
                      />
                    </div>
                    <AdminKpiGrid
                      items={[
                        { label: "displaySourceType", value: match.displaySourceType },
                        { label: "finalScore", value: fmtMatchScore(match.finalScore) },
                        {
                          label: "pairwise",
                          value: match.pairwiseAvailable ? "yes" : "no",
                        },
                        {
                          label: "fallback",
                          value: match.fallbackUsed == null ? "—" : String(match.fallbackUsed),
                        },
                      ]}
                    />
                    <p className={`${adminMuted} mt-2`}>
                      matchResultId: <AdminIdPill id={match.matchResultId} truncate={0} /> · display:{" "}
                      <AdminIdPill id={match.displayCandidateUserId} truncate={0} />
                    </p>
                    <p className={`${adminMuted} mt-1`}>
                      meta: finalize={String(match.finalMatchDecisionMetaPresent)} · insights=
                      {String(match.matchInsightsPresent)} · scoreShadowV2=
                      {String(match.scoreShadowV2Present)} · rrmShadow=
                      {String(match.rrmDecisionShadowPresent)}
                    </p>
                  </>
                ) : (
                  <AdminEmptyState message="该用户尚无 MatchResult" />
                )}
                {matchHistory.length > 1 ? (
                  <div className="mt-4">
                    <p className={`${adminMuted} mb-2`}>历史 MatchResult（最近 {matchHistory.length} 条）</p>
                    <AdminDataTable
                      columns={matchDetailColumns}
                      rows={matchHistory}
                      rowKey="matchResultId"
                      emptyMessage=""
                    />
                  </div>
                ) : null}
              </AdminSection>

              <AdminSection title="Recent Testing Events">
                <AdminDataTable
                  columns={[
                    { key: "eventType", label: "type" },
                    { key: "status", label: "status" },
                    { key: "source", label: "source" },
                    { key: "createdAt", label: "at" },
                  ]}
                  rows={sections.recentEvents ?? []}
                  rowKey="id"
                  emptyMessage="暂无测试事件"
                />
              </AdminSection>

              <AdminSection title="Recent Testing Feedback">
                <AdminDataTable
                  columns={[
                    { key: "rating", label: "rating" },
                    { key: "freeText", label: "note" },
                    { key: "createdAt", label: "at" },
                  ]}
                  rows={sections.recentFeedback ?? []}
                  rowKey="id"
                  emptyMessage="暂无测试反馈"
                />
              </AdminSection>

              <AdminSection title="提交测试反馈（仅写 TestingMatchFeedback）">
                <div className="flex flex-wrap gap-3 items-end">
                  <label className={adminLabel}>
                    rating
                    <select
                      className={adminInput}
                      value={feedbackRating}
                      onChange={(e) => setFeedbackRating(e.target.value)}
                    >
                      {FEEDBACK_RATINGS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={`${adminLabel} flex-1 min-w-[200px]`}>
                    note（可选，短）
                    <input
                      className={`${adminInput} w-full`}
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      maxLength={500}
                    />
                  </label>
                  <button type="button" className={adminBtnPrimary} onClick={() => void submitFeedback()}>
                    提交反馈
                  </button>
                </div>
                {feedbackMsg ? <p className={`${adminMuted} mt-2`}>{feedbackMsg}</p> : null}
              </AdminSection>
            </>
          ) : null}
        </>
      ) : (
        <AdminEmptyState message="点击上表 userId 查看详情" />
      )}

      <AdminSection title="匹配观测汇总（现有 Admin API · 只读）">
        {matchSummary ? (
          <AdminJsonBlock value={matchSummary} maxHeightClass="max-h-96" />
        ) : (
          <p className={adminMuted}>
            需管理员 JWT 权限；若未登录或无权限，此区块为空。
          </p>
        )}
      </AdminSection>
    </AdminPageShell>
  );
}
