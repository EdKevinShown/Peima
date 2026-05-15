import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import LoadingState from "../components/common/LoadingState";
import {
  listUserImages,
  uploadUserImageFile,
} from "../api/images";
import { getMe } from "../api/auth";
import { getOnboardingPhotoStatus } from "../api/onboarding";
import { resolveUserId } from "../utils/resolveUserId";
import {
  validateOnboardingPhotoFileBasics,
  validateOnboardingPhotoCanDecode,
  mapOnboardingPhotoUploadError,
  canProceedToPhotoPreference,
  mapDetectionReasonCodesToMessage,
} from "../utils/onboardingPhotoValidation";

export default function OnboardingPhotoUploadPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [existingImages, setExistingImages] = useState([]);
  const [pickedFile, setPickedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [brokenImageIds, setBrokenImageIds] = useState(() => new Set());
  const fileInputRef = useRef(null);

  const [hasPassingPhoto, setHasPassingPhoto] = useState(false);
  const previewQs = userId ? `?userId=${encodeURIComponent(userId)}` : "";

  const hasPhoto = existingImages.length > 0;

  const load = useCallback(async () => {
    if (!userId) {
      setError(new Error("请先登录后再上传或更新照片。"));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await getMe();
      const [list, status] = await Promise.all([
        listUserImages(userId),
        getOnboardingPhotoStatus(),
      ]);
      setExistingImages(Array.isArray(list) ? list : []);
      setHasPassingPhoto(
        status.hasPassingPhoto === true ||
          (status.hasPassingPhoto === undefined && status.hasPhoto === true),
      );
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setExistingImages([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openFilePicker = useCallback(() => {
    setError(null);
    fileInputRef.current?.click();
  }, []);

  const onPickFile = useCallback(async (e) => {
    const f = e.target.files?.[0];
    setError(null);
    if (!f) {
      setPickedFile(null);
      return;
    }
    const basicErr = validateOnboardingPhotoFileBasics(f);
    if (basicErr) {
      setError(new Error(basicErr));
      setPickedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const decodeErr = await validateOnboardingPhotoCanDecode(f);
    if (decodeErr) {
      setError(new Error(decodeErr));
      setPickedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setPickedFile(f);
  }, []);

  const onUpload = useCallback(async () => {
    if (!userId || !pickedFile) return;
    const basicErr = validateOnboardingPhotoFileBasics(pickedFile);
    if (basicErr) {
      setError(new Error(basicErr));
      return;
    }
    const decodeErr = await validateOnboardingPhotoCanDecode(pickedFile);
    if (decodeErr) {
      setError(new Error(decodeErr));
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const row = await uploadUserImageFile(userId, pickedFile);
      setPickedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      if (
        !canProceedToPhotoPreference(row.detectionStatus, row.detectionReasonCodes)
      ) {
        setExistingImages((prev) => [row, ...prev.filter((r) => r.id !== row.id)]);
        setHasPassingPhoto(false);
        setError(
          new Error(
            mapDetectionReasonCodesToMessage(row.detectionReasonCodes),
          ),
        );
        return;
      }
      navigate(`/onboarding/photo-preference?userId=${encodeURIComponent(userId)}`);
    } catch (e) {
      setError(new Error(mapOnboardingPhotoUploadError(e)));
    } finally {
      setUploading(false);
    }
  }, [userId, pickedFile, navigate]);

  const onContinuePreference = useCallback(() => {
    if (!userId || !hasPassingPhoto) return;
    navigate(`/onboarding/photo-preference?userId=${encodeURIComponent(userId)}`);
  }, [userId, hasPassingPhoto, navigate]);

  return (
    <main style={{ maxWidth: 560, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.35rem", marginBottom: "0.5rem", color: "#0f172a" }}>
        上传一张清晰本人照片
      </h1>
      <p style={{ color: "#475569", fontSize: "0.95rem", lineHeight: 1.6, marginBottom: "0.75rem" }}>
        这张照片会用于生成你的第一印象预览池。我们不会进行 AI 美化，也不会生成虚假头像。
      </p>
      <p
        style={{
          marginBottom: "1.25rem",
          padding: "0.75rem 0.9rem",
          borderRadius: 10,
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          color: "#475569",
          fontSize: "0.88rem",
          lineHeight: 1.55,
        }}
      >
        请上传 JPG、PNG 或 WebP 格式，大小不超过 5MB。建议选择清晰、正面、单人照片。
      </p>
      <p style={{ marginBottom: "1rem", fontSize: "0.88rem" }}>
        <Link to="/">首页</Link>
        {" · "}
        <Link to="/login">登录</Link>
      </p>

      {loading && !uploading && <LoadingState label="加载中…" />}
      {uploading && <LoadingState label="上传中…" />}
      {error && (
        <p style={{ color: "#b00020" }} role="alert">
          {error.message}
        </p>
      )}

      {!loading && userId && (
        <section style={{ opacity: uploading ? 0.65 : 1 }}>
          {hasPhoto ? (
            <div style={{ marginBottom: "1.25rem" }}>
              <div style={{ fontWeight: 600, color: "#334155", marginBottom: "0.5rem", fontSize: "0.95rem" }}>
                当前照片
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem" }}>
                {existingImages.map((row) => (
                  <div
                    key={row.id}
                    style={{
                      width: 112,
                      height: 112,
                      borderRadius: 10,
                      overflow: "hidden",
                      border: "1px solid #e2e8f0",
                      background: "#f8fafc",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {brokenImageIds.has(row.id) ? (
                      <span style={{ fontSize: "0.72rem", color: "#94a3b8", padding: "0.35rem", textAlign: "center" }}>
                        图片暂时无法显示，请稍后重试或重新上传
                      </span>
                    ) : (
                      <img
                        src={row.imageUrl}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        onError={() => {
                          setBrokenImageIds((prev) => new Set(prev).add(row.id));
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            onChange={onPickFile}
            style={{ display: "none" }}
            aria-hidden
          />

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem", marginBottom: "1rem" }}>
            <button type="button" onClick={openFilePicker} disabled={uploading} style={{ cursor: uploading ? "not-allowed" : "pointer" }}>
              选择照片
            </button>
            <button type="button" onClick={() => void onUpload()} disabled={uploading || !pickedFile}>
              {uploading ? "上传中…" : "上传并继续"}
            </button>
            <button type="button" onClick={onContinuePreference} disabled={!hasPassingPhoto || uploading}>
              继续选择审美偏好
            </button>
            <Link
              to={`/onboarding/photo-preview${previewQs}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "0.35rem 0.75rem",
                borderRadius: 8,
                border: "1px solid #cbd5e1",
                color: "#334155",
                textDecoration: "none",
                fontSize: "0.92rem",
                pointerEvents: uploading ? "none" : "auto",
                opacity: uploading ? 0.6 : 1,
              }}
            >
              查看第一印象预览池
            </Link>
          </div>
          {pickedFile ? (
            <p style={{ color: "#0f766e", fontSize: "0.86rem", marginBottom: "0.75rem" }}>
              已选择：{pickedFile.name}（{(pickedFile.size / 1024).toFixed(0)} KB）
            </p>
          ) : (
            <p style={{ color: "#64748b", fontSize: "0.88rem", marginBottom: "0.75rem" }}>
              {hasPhoto
                ? "可选中新照片后点击「上传并继续」，校验通过并成功上传后将前往审美偏好。"
                : "请先选择一张照片，校验通过并成功上传后将前往审美偏好。"}
            </p>
          )}
        </section>
      )}
    </main>
  );
}
