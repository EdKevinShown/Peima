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
import LegacyPhotoPreviewFreezeBanner from "../components/legacy/LegacyPhotoPreviewFreezeBanner.jsx";

function formatReasonLine(tags) {
  if (!tags || !tags.length) return "符合你的审美偏好";
  const shown = tags.filter(
    (t) =>
      !String(t).startsWith("onboarding-") && !String(t).startsWith("tier:"),
  );
  if (!shown.length) return "符合你的审美偏好";
  return shown.join(" · ");
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
      setError(new Error("请先登录后再查看预览池。"));
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
        new Error(
          msg
            ? msg
            : "暂时无法生成预览池，请稍后重试。",
        ),
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
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        new Error(
          msg || "暂时无法继续，请稍后重试。",
        ),
      );
    } finally {
      setContinuing(false);
    }
  }, [userId, navigate]);

  const items = data?.items ? [...data.items].sort((a, b) => a.rankInPool - b.rankInPool) : [];
  const aesthetic = items.filter((i) => i.tier === "aesthetic_fit");
  const styleSimilar = items.filter((i) => i.tier === "style_similar");
  const reflowItems = items.filter((i) => i.tier === "reflow");

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

  const sectionHead = {
    fontSize: "1.05rem",
    fontWeight: 700,
    color: "#0f172a",
    marginBottom: "0.35rem",
  };

  const sectionSub = {
    fontSize: "0.86rem",
    color: "#64748b",
    lineHeight: 1.55,
    marginBottom: "0.85rem",
  };

  const cardShell = {
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    padding: "0.85rem 1rem",
    background: "#fff",
    marginBottom: "0.75rem",
  };

  function renderPoolItem(it) {
    const reason = formatReasonLine(it.reasonTags || []);
    if (it.displayMode === "hidden") {
      return (
        <div key={it.id} style={cardShell}>
          <div
            style={{
              minHeight: 120,
              borderRadius: 8,
              background: "#f1f5f9",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "#64748b",
              padding: "0.75rem",
              textAlign: "center",
              fontSize: "0.88rem",
              lineHeight: 1.5,
            }}
          >
            <span style={{ fontWeight: 600, marginBottom: "0.35rem" }}>探索位 · 照片不展示</span>
            <span>
              系统保留了一个探索推荐，完成关系画像后会参与更完整的判断。
            </span>
          </div>
        </div>
      );
    }
    if (it.displayMode === "blurred") {
      return (
        <div key={it.id} style={cardShell}>
          {it.imageUrl ? (
            <img
              src={it.imageUrl}
              alt=""
              style={{
                maxWidth: "100%",
                maxHeight: 220,
                borderRadius: 8,
                objectFit: "contain",
                filter: "blur(8px)",
              }}
            />
          ) : (
            <div style={{ color: "#94a3b8", fontSize: "0.88rem" }}>暂无图片</div>
          )}
        </div>
      );
    }
    return (
      <div key={it.id} style={cardShell}>
        <div style={{ fontSize: "0.82rem", color: "#64748b", marginBottom: "0.5rem" }}>{reason}</div>
        {it.imageUrl ? (
          <img
            src={it.imageUrl}
            alt=""
            style={{
              maxWidth: "100%",
              maxHeight: 240,
              borderRadius: 8,
              objectFit: "contain",
            }}
          />
        ) : (
          <div style={{ color: "#94a3b8", fontSize: "0.88rem" }}>暂无图片</div>
        )}
      </div>
    );
  }

  return (
    <main style={{ maxWidth: 640, margin: "2rem auto", padding: "0 1rem" }}>
      <LegacyPhotoPreviewFreezeBanner variant="onboarding" />
      <h1 style={{ fontSize: "1.35rem", marginBottom: "0.5rem", color: "#0f172a" }}>
        你的第一印象预览池
      </h1>
      <p style={{ color: "#64748b", fontSize: "0.9rem", lineHeight: 1.55, marginBottom: "1rem" }}>
        这是根据你的照片和审美偏好生成的初始预览，不是最终匹配结果。最终匹配还会基于后续关系画像完成。
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
          请先完成审美偏好后再生成预览池。{" "}
          <Link to={`/onboarding/photo-preference${prefQs}`}>前往审美偏好</Link>
        </p>
      )}

      {!loading && canOfferGenerate && (
        <div style={{ marginBottom: "1.25rem" }}>
          <p style={{ color: "#64748b", fontSize: "0.92rem", marginBottom: "0.75rem" }}>
            当前没有活跃的预览池。你已具备照片与审美偏好，可点击下方生成 3+2+1 第一印象预览。
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
              disabled
              title="P7.10-r5a: photo preview pool regeneration is frozen"
              style={{
                ...btnBase,
                background: "#94a3b8",
                color: "#fff",
                cursor: "not-allowed",
                opacity: 0.85,
              }}
            >
              重新生成预览池（已冻结）
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

          <section style={{ marginBottom: "1.75rem" }}>
            <h2 style={sectionHead}>符合你审美的人</h2>
            <p style={sectionSub}>共 3 人 · 清晰展示照片 · 卡片标签示意你的偏好方向</p>
            {aesthetic.map((it) => renderPoolItem(it))}
          </section>

          <section style={{ marginBottom: "1.75rem" }}>
            <h2 style={sectionHead}>和你风格相近的人</h2>
            <p style={sectionSub}>
              共 2 人 · 图片作模糊处理。与你的气质或风格相近，完成后续画像可进一步判断关系适配度。
            </p>
            {styleSimilar.map((it) => renderPoolItem(it))}
          </section>

          <section style={{ marginBottom: "0.5rem" }}>
            <h2 style={sectionHead}>系统保留推荐</h2>
            <p style={sectionSub}>共 1 人 · 不展示真实照片 · 占位说明</p>
            {reflowItems.map((it) => renderPoolItem(it))}
          </section>
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
