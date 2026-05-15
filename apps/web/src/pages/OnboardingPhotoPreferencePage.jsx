import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import LoadingState from "../components/common/LoadingState";
import {
  getOnboardingPhotoPreferencesMe,
  getOnboardingPhotoStatus,
  postOnboardingPhotoPreferences,
  postOnboardingPhotoPreviewPoolGenerate,
} from "../api/onboarding";
import { getMe } from "../api/auth";
import { resolveUserId } from "../utils/resolveUserId";

const TAG_GROUPS = [
  {
    title: "整体气质",
    tags: ["清爽自然", "甜美可爱", "酷感个性", "成熟稳重", "文艺温柔", "运动阳光"],
  },
  {
    title: "照片感觉",
    tags: ["生活感", "精致感", "松弛感", "氛围感", "简约干净", "有个性"],
  },
  {
    title: "优先关注",
    tags: ["笑容", "穿搭", "气质", "五官", "身材比例", "整体感觉"],
  },
];

const ALL_TAGS = TAG_GROUPS.flatMap((g) => g.tags);
const MAX_TAGS = 8;

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
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);
  const photoWarning =
    typeof location.state?.photoWarning === "string"
      ? location.state.photoWarning
      : null;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(() => new Set());

  const previewQs = userId ? `?userId=${encodeURIComponent(userId)}` : "";

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
      const initial = new Set(
        (me.styleTags || []).filter((t) => ALL_TAGS.includes(t)),
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
      setError(new Error("请至少选择 1 项"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await postOnboardingPhotoPreferences(tags);
      await postOnboardingPhotoPreviewPoolGenerate();
      navigate(`/onboarding/photo-preview?userId=${encodeURIComponent(userId)}`);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      setError(
        new Error(
          raw.includes("候选") || raw.includes("预览池")
            ? raw
            : `保存或生成预览池时出现问题，请稍后重试。${raw ? `（${raw}）` : ""}`,
        ),
      );
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
        告诉我们你更容易被什么类型吸引。这个选择只用于第一印象预览池，不代表最终匹配结果。
      </p>
      <p style={{ marginBottom: "1rem", fontSize: "0.88rem", color: "#64748b" }}>
        至少选 1 项，最多 {MAX_TAGS} 项。可多组搭配选择。
      </p>
      <p style={{ marginBottom: "1.25rem", fontSize: "0.88rem" }}>
        <Link to="/">首页</Link>
        {" · "}
        <Link to={`/onboarding/photo-upload${previewQs}`}>返回照片设置</Link>
        {" · "}
        <Link to={`/onboarding/photo-preview${previewQs}`}>查看第一印象预览池</Link>
      </p>

      {loading && <LoadingState label="加载中…" />}
      {error && (
        <p style={{ color: "#b00020" }} role="alert">
          {error.message}
        </p>
      )}
      {photoWarning && (
        <p
          role="status"
          style={{
            color: "#92400e",
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: 10,
            padding: "0.75rem 0.9rem",
            fontSize: "0.9rem",
            lineHeight: 1.55,
            marginBottom: "1rem",
          }}
        >
          {photoWarning}
        </p>
      )}

      {!loading && userId && (
        <>
          {TAG_GROUPS.map((group) => (
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
