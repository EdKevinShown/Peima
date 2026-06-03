import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ONBOARDING_PHOTO_PREFERENCE_UI_GROUPS,
  ONBOARDING_PHOTO_STYLE_TAG_POOL_SET,
} from "@peima/shared/constants";
import LoadingState from "../components/common/LoadingState";
import StandalonePage from "../components/layout/StandalonePage";
import AlertBanner from "../components/ui/AlertBanner";
import {
  getOnboardingPhotoPreferencesMe,
  getOnboardingPhotoStatus,
  postOnboardingPhotoPreferences,
} from "../api/onboarding";
import { getMe } from "../api/auth";
import { resolveUserId } from "../utils/resolveUserId";
import { mapAccountApiErrorMessage } from "../utils/accountApiErrorMap";

const MAX_STYLE_TAGS = 8;
const MAX_FOCUS_TAGS = 8;

export default function OnboardingPhotoPreferencePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [needsPhotoFirst, setNeedsPhotoFirst] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState(() => new Set());
  const [selectedFocus, setSelectedFocus] = useState(() => new Set());

  const previewQs = userId ? `?userId=${encodeURIComponent(userId)}` : "";

  const toggleStyleTag = useCallback((tag) => {
    setSelectedStyle((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        if (next.size >= MAX_STYLE_TAGS) return prev;
        next.add(tag);
      }
      return next;
    });
  }, []);

  const toggleFocusTag = useCallback((tag) => {
    setSelectedFocus((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        if (next.size >= MAX_FOCUS_TAGS) return prev;
        next.add(tag);
      }
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    if (!userId) {
      setError(new Error("请先登录后再设置审美偏好。"));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setNeedsPhotoFirst(false);
    try {
      await getMe();
      const status = await getOnboardingPhotoStatus();
      if (status.nextStep === "photo_upload") {
        setNeedsPhotoFirst(true);
        return;
      }
      const me = await getOnboardingPhotoPreferencesMe();
      const initialStyle = new Set(
        (me.styleTags || []).filter((t) =>
          ONBOARDING_PHOTO_STYLE_TAG_POOL_SET.has(t),
        ),
      );
      setSelectedStyle(initialStyle);
      setSelectedFocus(new Set());
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [userId, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSubmit = useCallback(async () => {
    if (!userId) return;
    const tags = [...selectedStyle];
    if (tags.length < 1) {
      setError(new Error("请在「整体气质」或「照片感觉」中至少选择 1 项"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await postOnboardingPhotoPreferences(tags);
      const status = await getOnboardingPhotoStatus();
      const q = `?userId=${encodeURIComponent(userId)}`;
      if (status.nextStep === "questionnaire") {
        navigate(`/questionnaire${q}`);
        return;
      }
      if (status.nextStep === "photo_preview") {
        navigate(`/onboarding/photo-preview${q}`);
        return;
      }
      navigate(`/onboarding/photo-upload${q}`);
    } catch (e) {
      setError(new Error(mapAccountApiErrorMessage(e)));
    } finally {
      setSubmitting(false);
    }
  }, [userId, selectedStyle, navigate]);

  return (
    <StandalonePage
      maxWidth="max-w-lg"
      title="审美偏好"
      subtitle="告诉我们你更容易被什么类型吸引。仅用于第一印象预览池，不代表最终匹配结果。"
    >
      {loading ? <LoadingState label="加载中…" /> : null}

      {error ? (
        <AlertBanner variant="error" className="mb-4">
          {error.message}
        </AlertBanner>
      ) : null}

      {!loading && needsPhotoFirst ? (
        <div className="onboarding-soft-panel space-y-4">
          <AlertBanner variant="warn" className="mb-0">
            你还没有上传照片。
          </AlertBanner>
          <p className="text-sm text-white/65 leading-relaxed">
            「审美偏好」需要先看到你的照片，再帮你生成 <span className="text-white font-semibold">第一印象预览池</span>。
            请先完成上传照片这一步，再回来设置偏好。
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Link
              to={`/onboarding/photo-upload${previewQs}`}
              className="btn-primary inline-flex items-center justify-center text-sm py-2 px-5"
            >
              去上传照片 →
            </Link>
            <Link
              to="/home"
              className="btn-ghost inline-flex items-center justify-center text-sm py-2 px-5"
            >
              稍后再来
            </Link>
          </div>
        </div>
      ) : null}

      {!loading && !needsPhotoFirst && userId ? (
        <div className="onboarding-soft-panel">
          <p className="text-sm text-white/55 leading-relaxed pb-4 mb-4 border-b border-white/[0.07]">
            保存后先填写关系画像问卷，完成后再查看第一印象预览池（3+2+1）；不影响正式匹配主链。
          </p>

          <div className="space-y-1 text-xs text-white/45 leading-relaxed mb-5">
            <p>
              「整体气质」与「照片感觉」与账户页「照片风格偏好」为同一组标签，至少选 1 项，合计最多{" "}
              {MAX_STYLE_TAGS} 项。
            </p>
            <p>
              「优先关注」为浏览时的关注维度，当前仅在本页记录体验，不会写入账户风格标签。
            </p>
          </div>

          {ONBOARDING_PHOTO_PREFERENCE_UI_GROUPS.map((group, index) => (
            <div
              key={group.title}
              className={
                index < ONBOARDING_PHOTO_PREFERENCE_UI_GROUPS.length - 1
                  ? "pb-5 mb-5 border-b border-white/[0.07]"
                  : "pb-1"
              }
            >
              <h2 className="text-sm font-semibold text-white/85 mb-3">{group.title}</h2>
              <div className="flex flex-wrap gap-2">
                {group.tags.map((tag) => {
                  const on = group.submitsToStyleTags
                    ? selectedStyle.has(tag)
                    : selectedFocus.has(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      className={`onboarding-tag-chip ${on ? "onboarding-tag-chip--on" : ""}`}
                      onClick={() =>
                        group.submitsToStyleTags
                          ? toggleStyleTag(tag)
                          : toggleFocusTag(tag)
                      }
                      disabled={submitting}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <button
            type="button"
            className="btn-primary text-sm py-2.5 px-5 mt-5 w-full sm:w-auto"
            onClick={() => void onSubmit()}
            disabled={submitting || selectedStyle.size < 1}
          >
            {submitting ? "保存中…" : "保存并继续"}
          </button>

          <p className="mt-5 pt-4 border-t border-white/[0.07] text-xs text-white/40 flex flex-wrap gap-x-2 gap-y-1">
            <Link
              to={`/onboarding/photo-upload${previewQs}`}
              className="hover:text-white/65 transition-colors"
            >
              返回照片设置
            </Link>
            <span className="text-white/20" aria-hidden>
              ·
            </span>
            <Link
              to={`/onboarding/photo-preview${previewQs}`}
              className="hover:text-white/65 transition-colors"
            >
              第一印象预览池
            </Link>
          </p>
        </div>
      ) : null}
    </StandalonePage>
  );
}
