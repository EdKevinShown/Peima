import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import LoadingState from "../components/common/LoadingState";
import {
  getOnboardingPhotoPreviewPoolLatest,
  getOnboardingPhotoStatus,
  postOnboardingPhotoPreviewPoolAcknowledge,
  postOnboardingPhotoPreviewPoolGenerate,
} from "../api/onboarding";
import { getMe } from "../api/auth";
import { resolveUserId } from "../utils/resolveUserId";

function tierTitle(tier) {
  if (tier === "aesthetic_fit") return "符合你审美的人";
  if (tier === "style_similar") return "和你风格相近的人";
  if (tier === "reflow") return "系统保留推荐";
  return tier;
}

export default function OnboardingPhotoPreviewPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [statusSnap, setStatusSnap] = useState(null);
  const [continuing, setContinuing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const loadPool = useCallback(async () => {
    try {
      return await getOnboardingPhotoPreviewPoolLatest();
    } catch {
      return null;
    }
  }, []);

  const load = useCallback(async () => {
    if (!userId) {
      setError(new Error("缺少 userId：请先登录"));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setStatusSnap(null);
    try {
      await getMe();
      const status = await getOnboardingPhotoStatus();
      if (status.nextStep === "photo_upload") {
        navigate(`/onboarding/photo-upload?userId=${encodeURIComponent(userId)}`, { replace: true });
        return;
      }
      setStatusSnap(status);
      const bundle = await loadPool();
      setData(bundle);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [userId, navigate, loadPool]);

  useEffect(() => {
    void load();
  }, [load]);

  const onGenerateOrRegenerate = useCallback(async () => {
    setRegenerating(true);
    setError(null);
    try {
      const bundle = await postOnboardingPhotoPreviewPoolGenerate();
      setData(bundle);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        new Error(`暂时无法生成预览池，请稍后重试。${msg ? `（${msg}）` : ""}`),
      );
    } finally {
      setRegenerating(false);
    }
  }, []);

  const onContinue = useCallback(async () => {
    if (!userId) return;
    setContinuing(true);
    setError(null);
    try {
      await postOnboardingPhotoPreviewPoolAcknowledge();
      navigate(`/questionnaire?userId=${encodeURIComponent(userId)}`);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setContinuing(false);
    }
  }, [userId, navigate]);

  const items = data?.items ? [...data.items].sort((a, b) => a.rankInPool - b.rankInPool) : [];

  const prefQs = `?userId=${encodeURIComponent(userId || "")}`;
  const canOfferGenerate =
    statusSnap?.hasPhoto === true &&
    statusSnap?.hasPhotoPreference === true &&
    !data;

  const needPreferenceFirst =
    statusSnap && !statusSnap.hasPhotoPreference && statusSnap.hasPhoto;

  const btnBase = {
    padding: "0.55rem 1rem",
    fontSize: "0.92rem",
    fontWeight: 600,
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
  };

  return (
    <main style={{ maxWidth: 640, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.35rem", marginBottom: "0.5rem", color: "#0f172a" }}>
        你的第一印象预览池
      </h1>
      <p style={{ color: "#64748b", fontSize: "0.9rem", lineHeight: 1.55, marginBottom: "1rem" }}>
        以下为 onboarding 预览示例，不代表最终匹配对象。可随时重新生成预览池；最终匹配仍基于 20 维关系画像与系统主链。
      </p>
      <p style={{ marginBottom: "1rem", fontSize: "0.88rem" }}>
        <Link to="/">首页</Link>
        {" · "}
        <Link to={`/onboarding/photo-upload${prefQs}`}>照片设置</Link>
      </p>

      {loading && <LoadingState label="加载预览池…" />}
      {error && (
        <p style={{ color: "#b00020" }} role="alert">
          {error.message}
        </p>
      )}

      {!loading && !data && needPreferenceFirst && (
        <p style={{ color: "#64748b", fontSize: "0.92rem", marginBottom: "1rem" }}>
          请先完成审美偏好后再生成预览池。
        </p>
      )}

      {!loading && canOfferGenerate && (
        <div style={{ marginBottom: "1.25rem" }}>
          <p style={{ color: "#64748b", fontSize: "0.92rem", marginBottom: "0.75rem" }}>
            当前没有活跃的预览池。若已完成审美偏好，可点击下方生成 3+2+1 预览。
          </p>
          <button
            type="button"
            onClick={() => void onGenerateOrRegenerate()}
            disabled={regenerating}
            style={{
              ...btnBase,
              background: "#1e293b",
              color: "#fff",
              opacity: regenerating ? 0.7 : 1,
            }}
          >
            {regenerating ? "生成中…" : "生成预览池"}
          </button>
        </div>
      )}

      {!loading && data && (
        <>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.6rem",
              marginBottom: "1.25rem",
            }}
          >
            <Link
              to={`/onboarding/photo-preference${prefQs}`}
              style={{
                ...btnBase,
                display: "inline-block",
                background: "#fff",
                color: "#1e293b",
                border: "1px solid #cbd5e1",
                textDecoration: "none",
                textAlign: "center",
              }}
            >
              重新选择审美偏好
            </Link>
            <button
              type="button"
              onClick={() => void onGenerateOrRegenerate()}
              disabled={regenerating}
              style={{
                ...btnBase,
                background: "#334155",
                color: "#fff",
                opacity: regenerating ? 0.7 : 1,
              }}
            >
              {regenerating ? "生成中…" : "重新生成预览池"}
            </button>
            <button
              type="button"
              onClick={() => void onContinue()}
              disabled={continuing}
              style={{
                ...btnBase,
                background: "#1e293b",
                color: "#fff",
                opacity: continuing ? 0.7 : 1,
              }}
            >
              {continuing ? "处理中…" : "继续完成关系画像"}
            </button>
          </div>

          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "1rem" }}>
            {items.map((it) => (
              <li
                key={it.id}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  padding: "0.85rem 1rem",
                  background: "#fff",
                }}
              >
                <div style={{ fontWeight: 600, color: "#0f172a", marginBottom: "0.35rem" }}>
                  {tierTitle(it.tier)}
                </div>
                <div style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: "0.5rem" }}>
                  #{it.rankInPool} · {it.displayMode}
                </div>
                {it.displayMode === "hidden" ? (
                  <div
                    style={{
                      minHeight: 120,
                      borderRadius: 8,
                      background: "#f1f5f9",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#64748b",
                      fontWeight: 600,
                    }}
                  >
                    不展示照片
                  </div>
                ) : it.imageUrl ? (
                  <img
                    src={it.imageUrl}
                    alt=""
                    style={{
                      maxWidth: "100%",
                      maxHeight: 220,
                      borderRadius: 8,
                      objectFit: "contain",
                      filter: it.displayMode === "blurred" ? "blur(6px)" : undefined,
                    }}
                  />
                ) : (
                  <div style={{ color: "#94a3b8", fontSize: "0.88rem" }}>暂无图片</div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {!loading && error && (
        <div style={{ marginTop: "1rem" }}>
          <button type="button" onClick={() => void load()}>
            重试加载
          </button>
        </div>
      )}
    </main>
  );
}
