import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getLatestPreviewPool, seedLatestPreviewPoolForTest } from "../api/previewPool";
import { getTestMatchingCapabilities } from "../api/testMatch";
import AdminOnly from "../components/admin/AdminOnly";
import AdminPageShell from "../components/admin/AdminPageShell";
import AdminNotice from "../components/admin/AdminNotice";
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

export default function LegacyPreviewPoolPage() {
  const [searchParams] = useSearchParams();
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);
  const { isAdmin } = useAdminAccess();
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedAllowed, setSeedAllowed] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!userId) {
      setBundle(null);
      setError("请先登录后再查看预览池。");
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
