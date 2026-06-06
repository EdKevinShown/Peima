import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  acknowledgeOnboardingPhotoPreviewPool,
  generateOnboardingPhotoPreviewPool,
  getLatestOnboardingPhotoPreviewPool,
} from "../api/onboardingPhotoPreviewPool";
import { getLatestPreviewPool, seedLatestPreviewPoolForTest } from "../api/previewPool";
import { getTestMatchingCapabilities } from "../api/testMatch";
import AdminOnly from "../components/admin/AdminOnly";
import AdminPageShell from "../components/admin/AdminPageShell";
import AdminNotice from "../components/admin/AdminNotice";
import OnboardingPreviewPoolGallery from "../components/onboarding/OnboardingPreviewPoolGallery";
import QuestionnairePanel from "../components/questionnaire/QuestionnairePanel";
import AppContent from "../components/layout/AppContent";
import AlertBanner from "../components/ui/AlertBanner";
import DataTable from "../components/ui/DataTable";
import GlassCard from "../components/ui/GlassCard";
import { useAdminAccess } from "../hooks/useAdminAccess";
import AuthenticatedUserImage from "../components/common/AuthenticatedUserImage";
import { parseUserImageContentId } from "../api/images";
import { resolveUserId } from "../utils/resolveUserId";
import UserIdWithName from "../components/common/UserIdWithName";

function fmtScore(n) {
  return typeof n === "number" && Number.isFinite(n) ? n.toFixed(3) : "-";
}

/** 将 onboarding 预览池 API 英文/旧文案映射为中文提示。 */
function mapOnboardingPreviewPoolError(msg) {
  const m = String(msg || "");
  if (/No active onboarding/i.test(m)) {
    return "还没有生成预览池。若已完成审美偏好，请点击「生成预览」。";
  }
  if (/Not enough gated candidates/i.test(m)) {
    const hit = m.match(/\((\d+)\/(\d+)\)/);
    const cur = hit?.[1] ?? "0";
    const need = hit?.[2] ?? "6";
    return `内测候选人不足，暂时无法生成 ${need} 人预览（当前 ${cur}/${need}）。请让更多测试账号完成资料、上传照片并通过审核后再试。`;
  }
  if (/Complete onboarding photo preferences/i.test(m)) {
    return "请先在「审美偏好」页保存照片审美偏好，再生成第一印象预览。";
  }
  if (/Upload at least one passing/i.test(m)) {
    return "请先上传并通过审核至少一张照片，再生成第一印象预览。";
  }
  if (/内测候选人不足/.test(m)) {
    return m;
  }
  return m;
}

export default function PreviewPoolPage() {
  const location = useLocation();
  const isOnboardingPool = location.pathname.includes("/onboarding/photo-preview");
  const [searchParams] = useSearchParams();
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);
  const { isAdmin } = useAdminAccess();
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedAllowed, setSeedAllowed] = useState(false);
  const [error, setError] = useState("");
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setBundle(null);
      setError("请先登录后再查看预览池。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const next = isOnboardingPool
        ? await getLatestOnboardingPhotoPreviewPool()
        : await getLatestPreviewPool(userId);
      setBundle(next);
    } catch (e) {
      setBundle(null);
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        isOnboardingPool ? mapOnboardingPreviewPoolError(msg) : msg,
      );
    } finally {
      setLoading(false);
    }
  }, [userId, isOnboardingPool]);

  const generateOnboardingPool = useCallback(async () => {
    if (!userId) {
      setError("请先登录。");
      return;
    }
    setGenerating(true);
    setError("");
    try {
      const next = await generateOnboardingPhotoPreviewPool();
      setBundle(next);
    } catch (e) {
      setBundle(null);
      const msg = e instanceof Error ? e.message : String(e);
      setError(mapOnboardingPreviewPoolError(msg));
    } finally {
      setGenerating(false);
    }
  }, [userId]);

  const acknowledgeAndContinue = useCallback(async () => {
    if (!userId) return;
    setAcknowledging(true);
    setError("");
    try {
      await acknowledgeOnboardingPhotoPreviewPool();
      setShowQuestionnaire(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAcknowledging(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isAdmin || isOnboardingPool) {
      setSeedAllowed(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const capabilities = await getTestMatchingCapabilities();
        if (!cancelled) {
          setSeedAllowed(Boolean(capabilities.testPreviewPoolSeed));
        }
      } catch {
        if (!cancelled) setSeedAllowed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, isOnboardingPool]);

  const seedForTest = useCallback(async () => {
    if (!userId) return;
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

  const shortlistIds = bundle?.shortlistContract?.shortlist?.candidateUserIds ?? [];
  const evidence = bundle?.shortlistContract?.staticEvidence ?? {};

  const legacyTableColumns = [
    { key: "rank", label: "Rank", render: (item) => item.rankInPool },
    {
      key: "photo",
      label: "照片",
      render: (item) => {
        const imageId =
          item.itemMeta?.candidateImageId ||
          parseUserImageContentId(item.itemMeta?.candidateImageUrl ?? "");
        return imageId ? (
          <AuthenticatedUserImage
            imageId={imageId}
            alt=""
            className="w-[52px] h-[52px] object-cover rounded-lg border border-white/15"
          />
        ) : (
          <span className="text-white/35 text-xs">无图</span>
        );
      },
    },
    {
      key: "candidate",
      label: "Candidate",
      render: (item) => (
        <code className="text-white/80 text-xs">
          <UserIdWithName userId={item.candidateUserId} />
        </code>
      ),
    },
    { key: "mode", label: "Mode", render: (item) => item.displayMode },
    { key: "base", label: "Base", render: (item) => fmtScore(item.baseScore) },
    {
      key: "pref",
      label: "Preference",
      render: (item) => fmtScore(evidence[item.candidateUserId]?.preferenceScore),
    },
    {
      key: "profile",
      label: "Profile",
      render: (item) => fmtScore(evidence[item.candidateUserId]?.profileScalar),
    },
    {
      key: "style",
      label: "Style",
      render: (item) => fmtScore(evidence[item.candidateUserId]?.styleScore),
    },
    {
      key: "meta",
      label: "Meta",
      className: "text-white/50",
      render: (item) => item.itemMeta?.slotReason || item.itemMeta?.shortHint || "—",
    },
  ];

  if (isOnboardingPool) {
    return (
      <div className="mx-auto w-full max-w-lg sm:max-w-xl px-4 py-3 sm:py-4">
        <AppContent
          dense
          maxWidth="max-w-none"
          title={showQuestionnaire ? "填写问卷" : "第一印象预览"}
          subtitle={
            showQuestionnaire
              ? "请完成以下题目，提交后继续匹配流程。"
              : "前几张清晰，越往后越朦胧；仅供参考。"
          }
          actions={
            showQuestionnaire ? null : (
              <>
                {!bundle ? (
                  <button
                    type="button"
                    className="btn-primary text-sm py-2 px-4"
                    disabled={generating || loading || !userId}
                    onClick={() => void generateOnboardingPool()}
                  >
                    {generating ? "生成中…" : "生成预览"}
                  </button>
                ) : null}
                {bundle ? (
                  <button
                    type="button"
                    className="btn-primary text-sm py-2 px-5"
                    disabled={acknowledging || !userId}
                    onClick={() => void acknowledgeAndContinue()}
                  >
                    {acknowledging ? "请稍候…" : "看完了，继续问卷"}
                  </button>
                ) : null}
              </>
            )
          }
        >
          {loading && !showQuestionnaire ? (
            <p className="text-center text-xs text-white/50 py-6">加载中…</p>
          ) : null}

          {error ? (
            <AlertBanner variant="warn" className="mb-2 text-sm">
              {error}
              {!showQuestionnaire && userId ? (
                <p className="mt-2">
                  <Link
                    to={`/questionnaire?userId=${encodeURIComponent(userId)}`}
                    className="text-pink-200 underline underline-offset-2"
                  >
                    候选人不足时，可先填写问卷 →
                  </Link>
                </p>
              ) : null}
            </AlertBanner>
          ) : null}

          {showQuestionnaire && userId ? (
            <div className="glass rounded-2xl p-4 sm:p-5 mt-1">
              <QuestionnairePanel
                userId={userId}
                embedded
                skipOnboardingRedirect
              />
            </div>
          ) : null}

          {!showQuestionnaire && bundle?.items?.length ? (
            <OnboardingPreviewPoolGallery items={bundle.items} />
          ) : null}

          {!showQuestionnaire ? (
            <p className="text-center text-[10px] text-white/30 mt-1.5 leading-snug">
              不会代你联系对方
            </p>
          ) : null}
        </AppContent>
      </div>
    );
  }

  return (
    <AdminPageShell
      maxWidth="max-w-5xl"
      title="匹配预览池（Legacy）"
      subtitle="管理员排障用 · batch-match 上游数据"
      actions={
        <>
          <button
            type="button"
            className="btn-ghost text-sm"
            disabled={loading || !userId}
            onClick={() => void load()}
          >
            {loading ? "刷新中…" : "刷新"}
          </button>
          <AdminOnly>
            {seedAllowed ? (
              <button
                type="button"
                className="btn-ghost text-sm border-amber-400/40 text-amber-100"
                disabled={seeding || !userId}
                onClick={() => void seedForTest()}
              >
                {seeding ? "生成中…" : "生成本地测试池"}
              </button>
            ) : null}
          </AdminOnly>
        </>
      }
    >
      <AdminNotice variant="internal" title="内部 / Admin">
        Legacy 预览池排障页；不在用户 onboarding 主路径。仅管理员可见测试种子等能力。
      </AdminNotice>

      <GlassCard className="mb-4 text-sm text-white/60 leading-relaxed">
        <p>
          userId：<code className="text-white/80"><UserIdWithName userId={userId} /></code>
        </p>
      </GlassCard>

      {error ? (
        <AlertBanner variant="error" title="暂时没有可用预览池" className="mb-4">
          <p>{error}</p>
        </AlertBanner>
      ) : null}

      {bundle ? (
        <>
          <GlassCard className="mb-4">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="badge-gradient">status: {bundle.previewPool.status}</span>
              <span className="px-2 py-0.5 rounded-full border border-white/15 text-white/70">
                items: {bundle.items.length}
              </span>
            </div>
          </GlassCard>

          <GlassCard>
            <h2 className="text-base font-semibold text-white mb-3">候选列表</h2>
            <DataTable
              columns={legacyTableColumns}
              rows={bundle.items}
              rowKey="id"
              highlightRow={(item) => shortlistIds.includes(item.candidateUserId)}
            />
          </GlassCard>
        </>
      ) : null}
    </AdminPageShell>
  );
}
