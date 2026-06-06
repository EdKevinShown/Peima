import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  acknowledgeOnboardingPhotoPreviewPool,
  generateOnboardingPhotoPreviewPool,
  getLatestOnboardingPhotoPreviewPool,
} from "../api/onboardingPhotoPreviewPool";
import OnboardingPreviewPoolGallery from "../components/onboarding/OnboardingPreviewPoolGallery";
import QuestionnairePanel from "../components/questionnaire/QuestionnairePanel";
import AppContent from "../components/layout/AppContent";
import AlertBanner from "../components/ui/AlertBanner";
import { resolveUserId } from "../utils/resolveUserId";

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

/** Onboarding 第一印象预览池（3+2+1）；Legacy 排障页见 LegacyPreviewPoolPage。 */
export default function PreviewPoolPage() {
  const [searchParams] = useSearchParams();
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
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
      const next = await getLatestOnboardingPhotoPreviewPool();
      setBundle(next);
    } catch (e) {
      setBundle(null);
      const msg = e instanceof Error ? e.message : String(e);
      setError(mapOnboardingPreviewPoolError(msg));
    } finally {
      setLoading(false);
    }
  }, [userId]);

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
