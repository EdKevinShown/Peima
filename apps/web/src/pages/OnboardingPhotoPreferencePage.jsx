import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ONBOARDING_PHOTO_PREFERENCE_UI_GROUPS,
  ONBOARDING_PHOTO_STYLE_TAG_POOL_SET,
} from "@peima/shared/constants";
import LoadingState from "../components/common/LoadingState";
import StandalonePage from "../components/layout/StandalonePage";
import {
  getOnboardingPhotoPreferencesMe,
  getOnboardingPhotoStatus,
  postOnboardingPhotoPreferences,
} from "../api/onboarding";
import { getMe } from "../api/auth";
import { resolveUserId } from "../utils/resolveUserId";

const MAX_STYLE_TAGS = 8;
const MAX_FOCUS_TAGS = 8;

const groupBox = {
  marginBottom: "1.35rem",
  padding: "1rem",
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  background: "#fff",
};

const groupTitle = {
  fontSize: "0.95rem",
  fontWeight: 700,
  color: "#0f172a",
  marginBottom: "0.65rem",
};

export default function OnboardingPhotoPreferencePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
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
    try {
      await getMe();
      const status = await getOnboardingPhotoStatus();
      if (status.nextStep === "photo_upload") {
        navigate(`/onboarding/photo-upload?userId=${encodeURIComponent(userId)}`, {
          replace: true,
        });
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
      navigate(`/onboarding/photo-preview?userId=${encodeURIComponent(userId)}`);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      setError(
        new Error(
          `保存审美偏好时出现问题，请稍后重试。${raw ? `（${raw}）` : ""}`,
        ),
      );
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
      <p
        style={{
          marginBottom: "1rem",
          padding: "0.55rem 0.75rem",
          borderRadius: 8,
          border: "1px solid #e2e8f0",
          background: "#f8fafc",
          color: "#64748b",
          fontSize: "0.82rem",
          lineHeight: 1.5,
        }}
      >
        保存后进入 onboarding 第一印象预览池（3+2+1），确认后再填写问卷；不影响正式匹配主链。
      </p>
      <p style={{ color: "#475569", fontSize: "0.95rem", lineHeight: 1.6, marginBottom: "1rem" }}>
        告诉我们你更容易被什么类型吸引。这个选择只用于第一印象预览池，不代表最终匹配结果。
      </p>
      <p style={{ marginBottom: "1rem", fontSize: "0.88rem", color: "#64748b" }}>
        「整体气质」与「照片感觉」与账户页「照片风格偏好」为同一组标签，会一并保存；至少选 1 项，这两组合计最多{" "}
        {MAX_STYLE_TAGS} 项。
      </p>
      <p style={{ marginBottom: "1rem", fontSize: "0.88rem", color: "#64748b" }}>
        「优先关注」为照片浏览时的关注维度（如笑容、穿搭），当前仅在本页记录体验，不会写入账户风格标签或匹配偏好。
      </p>
      <p style={{ marginBottom: "1.25rem", fontSize: "0.88rem" }}>
        <Link to="/">首页</Link>
        {" · "}
        <Link to={`/onboarding/photo-upload${previewQs}`}>返回照片设置</Link>
        {" · "}
        <Link to={`/onboarding/photo-preview${previewQs}`}>第一印象预览池</Link>
        {" · "}
        <Link to={`/questionnaire${previewQs}`}>问卷（须先完成预览）</Link>
      </p>

      {loading && <LoadingState label="加载中…" />}
      {error && (
        <p style={{ color: "#b00020" }} role="alert">
          {error.message}
        </p>
      )}
      {!loading && userId && (
        <>
          {ONBOARDING_PHOTO_PREFERENCE_UI_GROUPS.map((group) => (
            <section key={group.title} style={groupBox}>
              <div style={groupTitle}>{group.title}</div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                }}
              >
                {group.tags.map((tag) => {
                  const on = group.submitsToStyleTags
                    ? selectedStyle.has(tag)
                    : selectedFocus.has(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() =>
                        group.submitsToStyleTags
                          ? toggleStyleTag(tag)
                          : toggleFocusTag(tag)
                      }
                      style={{
                        padding: "0.45rem 0.75rem",
                        borderRadius: 999,
                        border: on ? "2px solid #1e293b" : "1px solid #cbd5e1",
                        background: on ? "#1e293b" : "#f8fafc",
                        color: on ? "#fff" : "#334155",
                        cursor: "pointer",
                        fontSize: "0.88rem",
                      }}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting || selectedStyle.size < 1}
            style={{
              padding: "0.65rem 1.25rem",
              fontSize: "1rem",
              fontWeight: 600,
              border: "none",
              borderRadius: 8,
              background: "#1e293b",
              color: "#fff",
              cursor: submitting || selectedStyle.size < 1 ? "not-allowed" : "pointer",
              opacity: submitting || selectedStyle.size < 1 ? 0.65 : 1,
            }}
          >
            {submitting ? "保存中…" : "保存并生成预览池"}
          </button>
        </>
      )}
    </StandalonePage>
  );
}
