import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import LoadingState from "../components/common/LoadingState";
import StandalonePage from "../components/layout/StandalonePage";
import AlertBanner from "../components/ui/AlertBanner";
import AuthenticatedUserImage from "../components/common/AuthenticatedUserImage";
import {
  deleteUserImage,
  listUserImages,
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
          // Photo flow + questionnaire already done. Return to the dashboard
          // so the user explicitly chooses the next step (matching, profile,
          // etc.) rather than getting auto-jumped into the matching queue.
          navigate("/home");
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
      subtitle="用于生成第一印象预览池。我们不会泄漏个人信息。"
    >
      {loading && !uploading ? <LoadingState label="加载中…" /> : null}
      {uploading ? <LoadingState label="上传中…" /> : null}

      {blockedBanner ? (
        <AlertBanner variant="error" title={blockedBanner.main} className="mb-4">
          {blockedBanner.detail}
        </AlertBanner>
      ) : null}

      {!blockedBanner && underReviewMessage ? (
        <AlertBanner variant="warn" className="mb-4">
          {underReviewMessage}
        </AlertBanner>
      ) : null}

      {!blockedBanner && partialBlockedHint ? (
        <AlertBanner variant="info" className="mb-4">
          {partialBlockedHint}
        </AlertBanner>
      ) : null}

      {error ? (
        <AlertBanner variant="error" className="mb-4">
          {error.message}
        </AlertBanner>
      ) : null}

      {photoWarning ? (
        <AlertBanner variant="warn" title={photoWarning.main} className="mb-4">
          {photoWarning.detail}
        </AlertBanner>
      ) : null}

      {!loading && userId ? (
        <div
          className={`onboarding-soft-panel ${uploading ? "opacity-60 pointer-events-none" : ""}`}
        >
          <p className="text-sm text-white/55 leading-relaxed pb-4 mb-4 border-b border-white/[0.07]">
            请上传 JPG、PNG 或 WebP，大小不超过 5MB。建议清晰、正面、单人照片。
          </p>

          {hasPhoto ? (
            <div className="mb-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="text-sm font-medium text-white/80">当前照片</h2>
                <button
                  type="button"
                  className="text-xs text-red-300/90 hover:text-red-200 disabled:opacity-40 transition-colors"
                  onClick={() => void onDeleteAllImages()}
                  disabled={uploading || deletingImageId !== "" || deletingAll}
                >
                  {deletingAll ? "删除中…" : "删除全部"}
                </button>
              </div>
              <div className="flex flex-wrap gap-3">
                {existingImages.map((row) => (
                  <div
                    key={row.id}
                    className="relative w-28 h-28 rounded-xl overflow-hidden ring-1 ring-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
                  >
                    {brokenImageIds.has(row.id) ? (
                      <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-[10px] text-white/45 leading-snug">
                        暂时无法显示
                      </span>
                    ) : (
                      <AuthenticatedUserImage
                        imageId={row.id}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={() => {
                          setBrokenImageIds((prev) => new Set(prev).add(row.id));
                        }}
                      />
                    )}
                    <button
                      type="button"
                      className="absolute top-1.5 right-1.5 rounded-full bg-black/50 backdrop-blur-sm text-[10px] py-0.5 px-2 text-white/90 hover:bg-black/65"
                      onClick={() => void onDeleteImage(row.id)}
                      disabled={uploading || deletingAll || deletingImageId === row.id}
                      title="删除照片"
                      aria-label="删除照片"
                    >
                      {deletingImageId === row.id ? "…" : "删除"}
                    </button>
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
            className="hidden"
            aria-hidden
          />

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap mb-3">
            <button
              type="button"
              className="btn-ghost text-sm py-2.5 px-4"
              onClick={openFilePicker}
              disabled={uploading}
            >
              选择照片
            </button>
            <button
              type="button"
              className="btn-primary text-sm py-2.5 px-4"
              onClick={() => void onUpload()}
              disabled={uploading || !pickedFile}
            >
              {uploading ? "上传中…" : "上传并继续"}
            </button>
            <button
              type="button"
              className="btn-ghost text-sm py-2.5 px-4"
              onClick={() => void onContinuePreference()}
              disabled={!hasPassingPhoto || uploading}
            >
              继续选择审美偏好
            </button>
          </div>

          <Link
            to={`/onboarding/photo-preview${previewQs}`}
            className={`btn-ghost text-sm py-2.5 px-4 inline-flex justify-center mb-3 ${
              uploading ? "pointer-events-none opacity-50" : ""
            }`}
          >
            查看第一印象预览池
          </Link>

          {pickedFile ? (
            <p className="text-sm text-emerald-300/90 mb-2">
              已选择：{pickedFile.name}（{(pickedFile.size / 1024).toFixed(0)} KB）
            </p>
          ) : (
            <p className="text-xs text-white/40 leading-relaxed pt-1">
              {hasPhoto
                ? "可选中新照片后点击「上传并继续」，校验通过并成功上传后将根据审核状态继续流程。"
                : "请先选择一张照片，校验通过并成功上传后将根据审核状态继续流程。"}
            </p>
          )}
        </div>
      ) : null}
    </StandalonePage>
  );
}
