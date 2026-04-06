import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import LoadingState from "../components/common/LoadingState";
import {
  createUserImage,
  deleteUserImage,
  listUserImages,
  uploadUserImageFile,
} from "../api/images";
import { resolveUserId } from "../utils/resolveUserId";

export default function UserImagesPage() {
  const [searchParams] = useSearchParams();
  const userId = useMemo(() => resolveUserId(searchParams), [searchParams]);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pickedFile, setPickedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [okHint, setOkHint] = useState("");
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    if (!userId) {
      setRows([]);
      setError(
        new Error("缺少 userId：请先 /login，或 URL 加 ?userId=…"),
      );
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await listUserImages(userId);
      setRows(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!pickedFile) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(pickedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pickedFile]);

  const onPickFile = useCallback((e) => {
    const f = e.target.files?.[0];
    setPickedFile(f ?? null);
    setError(null);
  }, []);

  const onUploadFile = useCallback(async () => {
    if (!userId || !pickedFile) return;
    setUploading(true);
    setError(null);
    setOkHint("");
    try {
      await uploadUserImageFile(userId, pickedFile);
      setPickedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setOkHint("已上传并入库");
      window.setTimeout(() => setOkHint(""), 3000);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setUploading(false);
    }
  }, [userId, pickedFile, load]);

  const onAdd = useCallback(async () => {
    if (!userId) return;
    const url = imageUrl.trim();
    if (!url) return;
    setSubmitting(true);
    setError(null);
    setOkHint("");
    try {
      await createUserImage({ userId, imageUrl: url });
      setImageUrl("");
      setOkHint("已添加");
      window.setTimeout(() => setOkHint(""), 3000);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setSubmitting(false);
    }
  }, [userId, imageUrl, load]);

  const onDelete = useCallback(
    async (id) => {
      if (!window.confirm("删除这条图片记录？")) return;
      setError(null);
      try {
        await deleteUserImage(id);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
      }
    },
    [load],
  );

  return (
    <main style={{ maxWidth: 640, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.25rem" }}>我的图片</h1>
      <p style={{ color: "#666", fontSize: "0.9rem" }}>
        userId: <code>{userId || "（未设置）"}</code>
      </p>
      <p style={{ color: "#666", fontSize: "0.82rem", lineHeight: 1.5 }}>
        <strong>本地上传</strong>：文件会保存到 API 服务器目录，并写入可访问的 URL（单张最大 5MB，支持 jpeg / png / webp / gif）。
        也可粘贴已有 <strong>https 直链</strong>（图床等）。预览池要求其他候选用户在库里至少各有一条图片记录。
      </p>
      <p style={{ marginBottom: "1rem" }}>
        <Link to="/">首页</Link>
        {" · "}
        <Link to={`/preview-pool?userId=${encodeURIComponent(userId || "")}`}>
          预览池
        </Link>
      </p>

      {loading && <LoadingState label="加载图片列表…" />}
      {error && (
        <p style={{ color: "#b00020" }} role="alert">
          {error.message}
        </p>
      )}

      {!userId ? null : (
        <section style={{ marginBottom: "1.25rem" }}>
          <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>上传文件</h2>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
            onChange={onPickFile}
            style={{ marginBottom: "0.5rem", fontSize: "0.88rem" }}
          />
          {previewUrl ? (
            <div style={{ marginBottom: "0.5rem" }}>
              <img
                src={previewUrl}
                alt="预览"
                style={{
                  maxWidth: "100%",
                  maxHeight: 220,
                  borderRadius: 8,
                  border: "1px solid #e5e5e5",
                  objectFit: "contain",
                }}
              />
            </div>
          ) : null}
          <div style={{ display: "flex", gap: "0.65rem", alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={onUploadFile}
              disabled={uploading || !pickedFile}
            >
              {uploading ? "上传中…" : "上传到服务器"}
            </button>
          </div>

          <h2 style={{ fontSize: "1rem", margin: "1.25rem 0 0.5rem" }}>或填写 URL</h2>
          <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem" }}>
            图片 URL
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://example.com/photo.jpg"
              style={{
                display: "block",
                width: "100%",
                marginTop: "0.35rem",
                padding: "0.55rem 0.65rem",
                borderRadius: 8,
                border: "1px solid #ccc",
              }}
            />
          </label>
          <div style={{ display: "flex", gap: "0.65rem", alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={onAdd}
              disabled={submitting || !imageUrl.trim()}
            >
              {submitting ? "提交中…" : "添加记录"}
            </button>
            {okHint ? (
              <span style={{ color: "#0d6832" }} role="status">
                {okHint}
              </span>
            ) : null}
          </div>
        </section>
      )}

      {!loading && userId && (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {rows.length === 0 ? (
            <li style={{ color: "#666", fontSize: "0.9rem" }}>暂无图片记录</li>
          ) : (
            rows.map((r) => (
              <li
                key={r.id}
                style={{
                  border: "1px solid #e5e5e5",
                  borderRadius: 8,
                  padding: "0.65rem 0.75rem",
                  marginBottom: "0.5rem",
                  fontSize: "0.85rem",
                  wordBreak: "break-all",
                }}
              >
                <div>
                  <code>{r.id}</code>
                </div>
                <div style={{ marginTop: "0.35rem" }}>
                  <a href={r.imageUrl} target="_blank" rel="noreferrer">
                    {r.imageUrl}
                  </a>
                </div>
                <div style={{ marginTop: "0.35rem" }}>
                  <img
                    src={r.imageUrl}
                    alt=""
                    style={{
                      maxWidth: "100%",
                      maxHeight: 160,
                      borderRadius: 6,
                      objectFit: "contain",
                    }}
                  />
                </div>
                <div style={{ marginTop: "0.35rem" }}>
                  <button type="button" onClick={() => onDelete(r.id)}>
                    删除
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      )}

      <div style={{ marginTop: "1rem" }}>
        <button type="button" onClick={load} disabled={loading || !userId}>
          刷新列表
        </button>
      </div>
    </main>
  );
}
