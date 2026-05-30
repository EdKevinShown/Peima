import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import LoadingState from "../components/common/LoadingState";
import StandalonePage from "../components/layout/StandalonePage";
import {
  deleteUserImage,
  listUserImages,
  resolveUserImageUrl,
  uploadUserImageFile,
} from "../api/images";
import { getMe } from "../api/auth";
import { getOnboardingPhotoStatus } from "../api/onboarding";
import { getQuestionnaireProfile } from "../api/questionnaire";
import { resolveUserId } from "../utils/resolveUserId";
import {
  getBlockedPhotoReviewBanner,
  getPartialBlockedPhotoHint,
  getPhotoUnderReviewMessage,
} from "../utils/onboardingPhotoGateMessages";
import {
  validateOnboardingPhotoFileBasics,
  validateOnboardingPhotoCanDecode,
  mapOnboardingPhotoUploadError,
  canProceedToPhotoPreference,
  mapDetectionReasonCodesToMessage,
  hasMultipleFacesWarning,
  MULTIPLE_FACES_WARNING_DETAIL,
  MULTIPLE_FACES_WARNING_MAIN,
} from "../utils/onboardingPhotoValidation";

const bannerBase = {
  borderRadius: 10,
  padding: "0.75rem 0.9rem",
  fontSize: "0.9rem",
  lineHeight: 1.55,
  marginBottom: "1rem",
};

export default function OnboardingPhotoUploadPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [existingImages, setExistingImages] = useState([]);
  const [photoStatus, setPhotoStatus] = useState(null);
  const [pickedFile, setPickedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [deletingImageId, setDeletingImageId] = useState("");
  const [deletingAll, setDeletingAll] = useState(false);
  const [brokenImageIds, setBrokenImageIds] = useState(() => new Set());
  const fileInputRef = useRef(null);

  const [photoWarning, setPhotoWarning] = useState(null);
  const previewQs = userId ? `?userId=${encodeURIComponent(userId)}` : "";

  const hasPhoto = existingImages.length > 0;
  const hasPassingPhoto = photoStatus?.hasPassingPhoto === true;

  const blockedBanner = useMemo(
    () => getBlockedPhotoReviewBanner(photoStatus),
    [photoStatus],
  );
  const underReviewMessage = useMemo(
    () => getPhotoUnderReviewMessage(photoStatus),
    [photoStatus],
  );
  const partialBlockedHint = useMemo(
    () => getPartialBlockedPhotoHint(photoStatus),
    [photoStatus],
  );

  const applyStatus = useCallback((status) => {
    setPhotoStatus(status ?? null);
  }, []);

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
      applyStatus(status);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setExistingImages([]);
      applyStatus(null);
    } finally {
      setLoading(false);
    }
  }, [userId, applyStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  const navigateByStatus = useCallback(
    async (status) => {
      if (!userId || !status) return;
      const q = `?userId=${encodeURIComponent(userId)}`;
      if (status.nextStep === "photo_preference") {
        navigate(`/onboarding/photo-preference${q}`);
        return;
      }
      if (status.nextStep === "photo_preview") {
        navigate(`/onboarding/photo-preview${q}`);
        return;
      }
      if (status.nextStep === "questionnaire") {
        const profile = await getQuestionnaireProfile(userId);
        if (profile?.profile?.userId === userId) {
          navigate(`/matching-waiting${q}`);
          return;
        }
        navigate(`/questionnaire${q}`);
      }
    },
    [userId, navigate],
  );

  const openFilePicker = useCallback(() => {
    setError(null);
    setPhotoWarning(null);
    fileInputRef.current?.click();
  }, []);

  const onPickFile = useCallback(async (e) => {
    const f = e.target.files?.[0];
    setError(null);
    setPhotoWarning(null);
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
    setPhotoWarning(null);
    try {
      const row = await uploadUserImageFile(userId, pickedFile);
      setPickedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setExistingImages((prev) => [row, ...prev.filter((r) => r.id !== row.id)]);

      if (
        !canProceedToPhotoPreference(row.detectionStatus, row.detectionReasonCodes)
      ) {
        const status = await getOnboardingPhotoStatus();
        applyStatus(status);
        setError(
          new Error(
            mapDetectionReasonCodesToMessage(row.detectionReasonCodes),
          ),
        );
        return;
      }

      const status = await getOnboardingPhotoStatus();
      applyStatus(status);

      if (status.nextStep === "photo_upload" || !status.hasPassingPhoto) {
        return;
      }

      if (hasMultipleFacesWarning(row.detectionScoreJson)) {
        setPhotoWarning({
          main: MULTIPLE_FACES_WARNING_MAIN,
          detail: MULTIPLE_FACES_WARNING_DETAIL,
        });
        return;
      }

      void navigateByStatus(status);
    } catch (e) {
      setError(new Error(mapOnboardingPhotoUploadError(e)));
    } finally {
      setUploading(false);
    }
  }, [userId, pickedFile, applyStatus, navigateByStatus]);

  const onContinuePreference = useCallback(async () => {
    if (!userId) return;
    setError(null);
    try {
      const status = await getOnboardingPhotoStatus();
      applyStatus(status);
      if (!status.hasPassingPhoto) {
        return;
      }
      if (status.nextStep === "photo_upload") {
        return;
      }
      void navigateByStatus(status);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, [userId, applyStatus, navigateByStatus]);

  const onDeleteImage = useCallback(
    async (imageId) => {
      if (!imageId || uploading || deletingImageId) return;
      if (!window.confirm("确定删除这张照片吗？")) return;
      setError(null);
      setPhotoWarning(null);
      setDeletingImageId(imageId);
      try {
        await deleteUserImage(imageId);
        setBrokenImageIds((prev) => {
          const next = new Set(prev);
          next.delete(imageId);
          return next;
        });
        const [list, status] = await Promise.all([
          listUserImages(userId),
          getOnboardingPhotoStatus(),
        ]);
        setExistingImages(Array.isArray(list) ? list : []);
        applyStatus(status);
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        setDeletingImageId("");
      }
    },
    [uploading, deletingImageId, userId, applyStatus],
  );

  const onDeleteAllImages = useCallback(async () => {
    if (!userId || uploading || deletingImageId || deletingAll || existingImages.length === 0) {
      return;
    }
    if (
      !window.confirm(
        `确定删除当前全部 ${existingImages.length} 张照片吗？此操作不可撤销。`,
      )
    ) {
      return;
    }
    setError(null);
    setPhotoWarning(null);
    setDeletingAll(true);
    try {
      for (const row of existingImages) {
        await deleteUserImage(row.id);
      }
      setBrokenImageIds(new Set());
      const [list, status] = await Promise.all([
        listUserImages(userId),
        getOnboardingPhotoStatus(),
      ]);
      setExistingImages(Array.isArray(list) ? list : []);
      applyStatus(status);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setDeletingAll(false);
    }
  }, [
    userId,
    uploading,
    deletingImageId,
    deletingAll,
    existingImages,
    applyStatus,
  ]);

  return (
    <StandalonePage
      maxWidth="max-w-lg"
      title="上传一张清晰本人照片"
      subtitle="用于生成第一印象预览池。我们不会 AI 美化，也不会生成虚假头像。"
    >
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

      {blockedBanner ? (
        <div
          role="alert"
          style={{
            ...bannerBase,
            color: "#991b1b",
            background: "#fef2f2",
            border: "1px solid #fecaca",
          }}
        >
          <p style={{ margin: 0, fontWeight: 600 }}>{blockedBanner.main}</p>
          {blockedBanner.detail ? (
            <p style={{ margin: "0.45rem 0 0", fontWeight: 400 }}>{blockedBanner.detail}</p>
          ) : null}
        </div>
      ) : null}

      {!blockedBanner && underReviewMessage ? (
        <div
          role="status"
          style={{
            ...bannerBase,
            color: "#92400e",
            background: "#fffbeb",
            border: "1px solid #fde68a",
          }}
        >
          {underReviewMessage}
        </div>
      ) : null}

      {!blockedBanner && partialBlockedHint ? (
        <div
          role="status"
          style={{
            ...bannerBase,
            color: "#475569",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
          }}
        >
          {partialBlockedHint}
        </div>
      ) : null}

      {error && (
        <p style={{ color: "#b00020" }} role="alert">
          {error.message}
        </p>
      )}
      {photoWarning && (
        <div
          role="status"
          style={{
            ...bannerBase,
            color: "#92400e",
            background: "#fffbeb",
            border: "1px solid #fde68a",
          }}
        >
          <p style={{ margin: 0, fontWeight: 600 }}>{photoWarning.main}</p>
          <p style={{ margin: "0.45rem 0 0", fontWeight: 400 }}>{photoWarning.detail}</p>
        </div>
      )}

      {!loading && userId && (
        <section style={{ opacity: uploading ? 0.65 : 1 }}>
          {hasPhoto ? (
            <div style={{ marginBottom: "1.25rem" }}>
              <div
                style={{
                  marginBottom: "0.5rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.6rem",
                }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    color: "#334155",
                    fontSize: "0.95rem",
                  }}
                >
                  当前照片
                </div>
                <button
                  type="button"
                  onClick={() => void onDeleteAllImages()}
                  disabled={uploading || deletingImageId !== "" || deletingAll}
                  style={{
                    border: "1px solid #fecaca",
                    background: "#fff1f2",
                    color: "#b91c1c",
                    borderRadius: 999,
                    fontSize: "0.75rem",
                    lineHeight: 1,
                    padding: "0.3rem 0.55rem",
                    cursor:
                      uploading || deletingImageId !== "" || deletingAll
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  {deletingAll ? "删除中…" : "删除全部"}
                </button>
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
                    <div style={{ width: "100%", height: "100%", position: "relative" }}>
                      {brokenImageIds.has(row.id) ? (
                        <span style={{ fontSize: "0.72rem", color: "#94a3b8", padding: "0.35rem", textAlign: "center" }}>
                          图片暂时无法显示，请稍后重试或重新上传
                        </span>
                      ) : (
                        <img
                          src={resolveUserImageUrl(row.imageUrl)}
                          alt=""
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          onError={() => {
                            setBrokenImageIds((prev) => new Set(prev).add(row.id));
                          }}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => void onDeleteImage(row.id)}
                        disabled={
                          uploading || deletingAll || deletingImageId === row.id
                        }
                        style={{
                          position: "absolute",
                          top: 6,
                          right: 6,
                          border: "1px solid #fecaca",
                          background: "#fff1f2",
                          color: "#b91c1c",
                          borderRadius: 999,
                          fontSize: "0.72rem",
                          lineHeight: 1,
                          padding: "0.2rem 0.45rem",
                          cursor:
                            uploading || deletingImageId === row.id
                              ? "not-allowed"
                              : "pointer",
                        }}
                        title="删除照片"
                        aria-label="删除照片"
                      >
                        {deletingImageId === row.id ? "…" : "删除"}
                      </button>
                    </div>
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
            <button type="button" onClick={() => void onContinuePreference()} disabled={!hasPassingPhoto || uploading}>
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
                ? "可选中新照片后点击「上传并继续」，校验通过并成功上传后将根据审核状态继续流程。"
                : "请先选择一张照片，校验通过并成功上传后将根据审核状态继续流程。"}
            </p>
          )}
        </section>
      )}
    </StandalonePage>
  );
}
