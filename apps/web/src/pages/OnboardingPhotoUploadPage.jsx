import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import LoadingState from "../components/common/LoadingState";
import {
  listUserImages,
  uploadUserImageFile,
} from "../api/images";
import { getMe } from "../api/auth";
import { resolveUserId } from "../utils/resolveUserId";

export default function OnboardingPhotoUploadPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasPhoto, setHasPhoto] = useState(false);
  const [pickedFile, setPickedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

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
      const list = await listUserImages(userId);
      setHasPhoto(Array.isArray(list) && list.length > 0);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onPickFile = useCallback((e) => {
    const f = e.target.files?.[0];
    setPickedFile(f ?? null);
    setError(null);
  }, []);

  const onUpload = useCallback(async () => {
    if (!userId || !pickedFile) return;
    setUploading(true);
    setError(null);
    try {
      await uploadUserImageFile(userId, pickedFile);
      setPickedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setHasPhoto(true);
      navigate(`/onboarding/photo-preference?userId=${encodeURIComponent(userId)}`);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setUploading(false);
    }
  }, [userId, pickedFile, navigate]);

  const onContinue = useCallback(() => {
    if (!userId || !hasPhoto) return;
    navigate(`/onboarding/photo-preference?userId=${encodeURIComponent(userId)}`);
  }, [userId, hasPhoto, navigate]);

  return (
    <main style={{ maxWidth: 560, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.35rem", marginBottom: "0.5rem", color: "#0f172a" }}>
        照片设置
      </h1>
      <p style={{ color: "#475569", fontSize: "0.95rem", lineHeight: 1.6, marginBottom: "1.25rem" }}>
        你可以上传或更新用于初始审美预览的照片。照片不会被 AI 美化，也不会生成虚假头像。
      </p>
      <p style={{ marginBottom: "1rem", fontSize: "0.88rem" }}>
        <Link to="/">首页</Link>
        {" · "}
        <Link to="/login">登录</Link>
      </p>

      {loading && <LoadingState label="加载中…" />}
      {error && (
        <p style={{ color: "#b00020" }} role="alert">
          {error.message}
        </p>
      )}

      {!loading && userId && (
        <section>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
            onChange={onPickFile}
            style={{ marginBottom: "0.75rem", fontSize: "0.9rem" }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem", marginBottom: "1rem" }}>
            <button type="button" onClick={onUpload} disabled={uploading || !pickedFile}>
              {uploading ? "上传中…" : "上传照片"}
            </button>
            <button type="button" onClick={onContinue} disabled={!hasPhoto}>
              继续选择审美偏好
            </button>
          </div>
          {hasPhoto ? (
            <p style={{ color: "#166534", fontSize: "0.88rem" }}>
              已检测到照片，可继续选择审美偏好或上传新照片替换。
            </p>
          ) : (
            <p style={{ color: "#64748b", fontSize: "0.88rem" }}>请先上传至少一张照片后再继续。</p>
          )}
        </section>
      )}
    </main>
  );
}
