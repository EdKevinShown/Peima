import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  acknowledgeOnboardingPhotoPreviewPool,
  generateOnboardingPhotoPreviewPool,
  getLatestOnboardingPhotoPreviewPool,
} from "../api/onboardingPhotoPreviewPool";
import { getLatestPreviewPool, seedLatestPreviewPoolForTest } from "../api/previewPool";
import { getTestMatchingCapabilities } from "../api/testMatch";
import AdminOnly from "../components/admin/AdminOnly";
import AppDarkPage from "../components/layout/AppDarkPage";
import AppContent from "../components/layout/AppContent";
import AlertBanner from "../components/ui/AlertBanner";
import DataTable from "../components/ui/DataTable";
import GlassCard from "../components/ui/GlassCard";
import { useAdminAccess } from "../hooks/useAdminAccess";
import { resolveUserId } from "../utils/resolveUserId";
import UserIdWithName from "../components/common/UserIdWithName";

function fmtScore(n) {
  return typeof n === "number" && Number.isFinite(n) ? n.toFixed(3) : "-";
}

function resolvePreviewImageUrl(raw) {
  if (!raw) return "";
  try {
    const u = new URL(raw, window.location.origin);
    const imageHost = u.hostname.toLowerCase();
    const pageHost = window.location.hostname.toLowerCase();
    const imageIsLoopback = imageHost === "localhost" || imageHost === "127.0.0.1";
    const pageIsLoopback = pageHost === "localhost" || pageHost === "127.0.0.1";
    if (imageIsLoopback && !pageIsLoopback) {
      const api = new URL(import.meta.env.VITE_API_BASE_URL || "http://localhost:3000");
      u.protocol = api.protocol;
      u.host = api.host;
    }
    return u.toString();
  } catch {
    return raw;
  }
}

export default function PreviewPoolPage() {
  const navigate = useNavigate();
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

  const load = useCallback(async () => {
    if (!userId) {
      setBundle(null);
      setError("缺少 userId：请先登录，或在 URL 里带上 ?userId=...");
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
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [userId, isOnboardingPool]);

  const generateOnboardingPool = useCallback(async () => {
    if (!userId) {
      setError("缺少 userId：请先登录，或在 URL 里带上 ?userId=...");
      return;
    }
    setGenerating(true);
    setError("");
    try {
      const next = await generateOnboardingPhotoPreviewPool();
      setBundle(next);
    } catch (e) {
      setBundle(null);
      setError(e instanceof Error ? e.message : String(e));
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
      navigate(`/questionnaire?userId=${encodeURIComponent(userId)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAcknowledging(false);
    }
  }, [userId, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isAdmin) {
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
  }, [isAdmin]);

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

  const tableColumns = [
    { key: "rank", label: "Rank", render: (item) => item.rankInPool },
    {
      key: "photo",
      label: "照片",
      render: (item) => {
        const imageUrl = resolvePreviewImageUrl(item.itemMeta?.candidateImageUrl);
        return imageUrl ? (
          <img
            src={imageUrl}
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
      render: (item) => {
        const inShortlist = shortlistIds.includes(item.candidateUserId);
        return (
          <span className="text-xs">
            <code className="text-white/80">
              <UserIdWithName userId={item.candidateUserId} />
            </code>
            {inShortlist ? (
              <span className="ml-1.5 badge-gradient text-[0.65rem] py-0 px-1.5">shortlist</span>
            ) : null}
          </span>
        );
      },
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

  return (
    <AppDarkPage maxWidth="max-w-5xl">
      <AppContent
        title={isOnboardingPool ? "第一印象预览池" : "匹配预览池（Legacy）"}
        subtitle={
          isOnboardingPool
            ? "注册流程：3 审美契合 + 2 风格相似 + 1 回流（hidden 不展示图片）。确认后进入问卷。"
            : "匹配链 PreviewPool（batch-match 上游）；仅供管理员排障，不是 onboarding 第一印象。"
        }
        actions={
          <>
            <button type="button" className="btn-ghost text-sm" disabled={loading || !userId} onClick={() => void load()}>
              {loading ? "刷新中…" : "刷新"}
            </button>
            {isOnboardingPool ? (
              <button
                type="button"
                className="btn-ghost text-sm"
                disabled={generating || !userId}
                onClick={() => void generateOnboardingPool()}
              >
                {generating ? "生成中…" : "生成预览池"}
              </button>
            ) : null}
            {isOnboardingPool && bundle ? (
              <button
                type="button"
                className="btn-primary text-sm py-2 px-4"
                disabled={acknowledging || !userId}
                onClick={() => void acknowledgeAndContinue()}
              >
                {acknowledging ? "提交中…" : "确认并继续问卷"}
              </button>
            ) : null}
            <AdminOnly>
              {!isOnboardingPool && seedAllowed ? (
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
            <Link to={`/matching-waiting${q}`} className="btn-ghost text-sm no-underline">
              匹配等待
            </Link>
          </>
        }
      >
        <GlassCard className="mb-4 text-sm text-white/60 leading-relaxed">
          <p>
            userId：<code className="text-white/80"><UserIdWithName userId={userId} /></code>
          </p>
          <p className="mt-1">
            API{" "}
            <code className="text-white/75 text-xs">
              {isOnboardingPool
                ? "GET /onboarding/photo-preview-pool/me/latest"
                : "GET /preview-pool/user/:userId/latest"}
            </code>
          </p>
          {bundle?.previewPool?.sourceVersion ? (
            <p className="mt-1">
              sourceVersion <code className="text-white/75">{bundle.previewPool.sourceVersion}</code>
            </p>
          ) : null}
        </GlassCard>

        {error ? (
          <AlertBanner variant="error" title="暂时没有可用预览池" className="mb-4">
            <p>{error}</p>
            <p className="mt-2 text-xs opacity-90">
              {isOnboardingPool ? (
                <>
                  请先完成审美偏好，再点「生成预览池」。若仍失败，检查 API 与候选人数量（需 ≥6）。
                </>
              ) : (
                <>
                  请确认 API 已启动。管理员可在服务端开启测试 seed 后使用「生成本地测试池」。
                </>
              )}
            </p>
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
                <span className="px-2 py-0.5 rounded-full border border-white/15 text-white/70">
                  shortlist: {shortlistIds.length}
                </span>
              </div>
              <p className="mt-3 text-xs text-white/45">
                {bundle.previewPool.createdAt} · {bundle.previewPool.updatedAt}
              </p>
            </GlassCard>

            {bundle.shortlistContract ? (
              <GlassCard className="mb-4">
                <h2 className="text-base font-semibold text-white mb-3">Shortlist</h2>
                <div className="flex flex-wrap gap-2 mb-3">
                  {shortlistIds.map((id) => (
                    <span key={id} className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-100 border border-emerald-400/30">
                      {id}
                    </span>
                  ))}
                </div>
                {bundle.shortlistContract.exclusionReport.length > 0 ? (
                  <details className="text-sm text-white/55">
                    <summary className="cursor-pointer font-medium text-white/70">
                      未入 shortlist（{bundle.shortlistContract.exclusionReport.length}）
                    </summary>
                    <ul className="mt-2 pl-4 space-y-1 list-disc">
                      {bundle.shortlistContract.exclusionReport.map((row) => (
                        <li key={`${row.candidateUserId}:${row.reasonCode}`}>
                          <UserIdWithName userId={row.candidateUserId} /> · {row.reasonCode}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </GlassCard>
            ) : null}

            <GlassCard>
              <h2 className="text-base font-semibold text-white mb-3">候选列表</h2>
              <DataTable
                columns={tableColumns}
                rows={bundle.items}
                rowKey="id"
                highlightRow={(item) => shortlistIds.includes(item.candidateUserId)}
              />
            </GlassCard>
          </>
        ) : null}
      </AppContent>
    </AppDarkPage>
  );
}
