import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import LoadingState from "../components/common/LoadingState";
import {
  getOnboardingPhotoPreferencesMe,
  getOnboardingPhotoStatus,
  postOnboardingPhotoPreferences,
  postOnboardingPhotoPreviewPoolGenerate,
} from "../api/onboarding";
import { getMe } from "../api/auth";
import { resolveUserId } from "../utils/resolveUserId";

const TAG_OPTIONS = [
  "清爽自然",
  "甜美可爱",
  "酷感个性",
  "成熟稳重",
  "文艺温柔",
  "运动阳光",
  "生活感",
  "精致感",
  "松弛感",
  "氛围感",
  "简约干净",
  "有个性",
];

const MAX_TAGS = 8;

export default function OnboardingPhotoPreferencePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(() => new Set());

  const toggle = useCallback((tag) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        if (next.size >= MAX_TAGS) return prev;
        next.add(tag);
      }
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    if (!userId) {
      setError(new Error("缺少 userId：请先登录"));
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
      const initial = new Set(
        (me.styleTags || []).filter((t) => TAG_OPTIONS.includes(t)),
      );
      setSelected(initial);
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
    const tags = [...selected];
    if (tags.length < 1) {
      setError(new Error("请至少选择 1 个标签"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await postOnboardingPhotoPreferences(tags);
      await postOnboardingPhotoPreviewPoolGenerate();
      navigate(`/onboarding/photo-preview?userId=${encodeURIComponent(userId)}`);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setSubmitting(false);
    }
  }, [userId, selected, navigate]);

  return (
    <main style={{ maxWidth: 560, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.35rem", marginBottom: "0.5rem", color: "#0f172a" }}>
        审美偏好
      </h1>
      <p style={{ color: "#475569", fontSize: "0.95rem", lineHeight: 1.6, marginBottom: "1rem" }}>
        你可以随时更新你更容易被什么类型吸引。这些选择用于初始审美预览，不代表最终匹配结果。
      </p>
      <p style={{ marginBottom: "1rem", fontSize: "0.88rem", color: "#64748b" }}>
        至少选 1 个，最多 {MAX_TAGS} 个。
      </p>
      <p style={{ marginBottom: "1.25rem", fontSize: "0.88rem" }}>
        <Link to="/">首页</Link>
        {" · "}
        <Link to={`/onboarding/photo-upload?userId=${encodeURIComponent(userId || "")}`}>
          返回照片设置
        </Link>
      </p>

      {loading && <LoadingState label="加载中…" />}
      {error && (
        <p style={{ color: "#b00020" }} role="alert">
          {error.message}
        </p>
      )}

      {!loading && userId && (
        <>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.5rem",
              marginBottom: "1.25rem",
            }}
          >
            {TAG_OPTIONS.map((tag) => {
              const on = selected.has(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggle(tag)}
                  style={{
                    padding: "0.45rem 0.75rem",
                    borderRadius: 999,
                    border: on ? "2px solid #1e293b" : "1px solid #cbd5e1",
                    background: on ? "#1e293b" : "#fff",
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
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting || selected.size < 1}
            style={{
              padding: "0.65rem 1.25rem",
              fontSize: "1rem",
              fontWeight: 600,
              border: "none",
              borderRadius: 8,
              background: "#1e293b",
              color: "#fff",
              cursor: submitting || selected.size < 1 ? "not-allowed" : "pointer",
              opacity: submitting || selected.size < 1 ? 0.65 : 1,
            }}
          >
            {submitting ? "保存中…" : "保存并生成预览池"}
          </button>
        </>
      )}
    </main>
  );
}
