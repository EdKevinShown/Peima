import { useEffect, useState } from "react";
import {
  fetchUserImageContentBlobUrl,
  parseUserImageContentId,
} from "../../api/images";

/**
 * Loads `/images/:id/content` with JWT and renders via blob URL.
 * Falls back to placeholder when id/url missing or fetch fails.
 */
export default function AuthenticatedUserImage({
  imageId,
  imageUrl,
  alt = "",
  className,
  style,
  blurred = false,
  onError,
}) {
  const resolvedId = imageId || parseUserImageContentId(imageUrl);
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let blobUrl = "";
    let cancelled = false;
    setFailed(false);
    setSrc("");

    if (!resolvedId) {
      setFailed(true);
      return undefined;
    }

    void (async () => {
      try {
        blobUrl = await fetchUserImageContentBlobUrl(resolvedId);
        if (!cancelled) setSrc(blobUrl);
      } catch {
        if (!cancelled) {
          setFailed(true);
          onError?.();
        }
      }
    })();

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [resolvedId, onError]);

  if (!resolvedId || failed || !src) {
    return null;
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={
        blurred
          ? { ...style, filter: "blur(10px)", transform: "scale(1.05)" }
          : style
      }
      onError={() => {
        setFailed(true);
        onError?.();
      }}
    />
  );
}
