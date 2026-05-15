/**
 * P7.3 MVP：onboarding 照片上传前校验（格式、大小、可解码）。
 * 与后端 `images/upload` 的 5MB 上限及 MIME 白名单对齐；不引入 AI / 人脸识别。
 */

export const ONBOARDING_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * @param {File | null | undefined} file
 * @returns {string | null} 错误文案；null 表示通过
 */
export function validateOnboardingPhotoFileBasics(file) {
  if (!file || file.size === 0) {
    return "请选择一张有效的照片。";
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return "请上传 JPG、PNG 或 WebP 格式的照片。";
  }
  if (file.size > ONBOARDING_PHOTO_MAX_BYTES) {
    return "照片不能超过 5MB，请压缩后重新上传。";
  }
  return null;
}

/**
 * 尝试解码图片（不校验分辨率）。
 * @param {File} file
 * @returns {Promise<void>}
 */
function probeImageDecode(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode"));
    };
    img.src = url;
  });
}

/**
 * @param {File} file
 * @returns {Promise<string | null>} 错误文案；null 表示通过
 */
export async function validateOnboardingPhotoCanDecode(file) {
  try {
    await probeImageDecode(file);
    return null;
  } catch {
    return "这张图片无法读取，请换一张清晰照片。";
  }
}

/**
 * 将后端 / 网络错误映射为对用户友好的中文（不暴露堆栈与英文技术细节）。
 * @param {unknown} err
 * @returns {string}
 */
export function mapOnboardingPhotoUploadError(err) {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const r = raw.toLowerCase();

  if (r.includes("unsupported") && r.includes("type")) {
    return "请上传 JPG、PNG 或 WebP 格式的照片。";
  }
  if (r.includes("empty file") || r.includes("file is required")) {
    return "这张图片无法读取，请换一张清晰照片。";
  }
  if (
    r.includes("413") ||
    r.includes("too large") ||
    r.includes("entity too large") ||
    r.includes("limit")
  ) {
    return "照片不能超过 5MB，请压缩后重新上传。";
  }
  if (r.includes("network") || r.includes("failed to fetch")) {
    return "网络异常，上传未完成，请检查连接后重试。";
  }
  if (raw.trim()) {
    return "上传未完成，请稍后重试。";
  }
  return "上传未完成，请稍后重试。";
}

/** P7.4-r1a：后端 detectionReasonCodes → 中文提示 */
export function mapDetectionReasonCodesToMessage(reasonCodes) {
  const codes = Array.isArray(reasonCodes) ? reasonCodes : [];
  if (codes.includes("UNREADABLE_IMAGE")) {
    return "这张图片无法读取，请换一张清晰照片。";
  }
  if (codes.includes("TOO_DARK")) {
    return "照片偏暗，建议到光线更亮的环境重新拍摄。";
  }
  if (codes.includes("TOO_BLUR")) {
    return "照片不够清晰，请对焦后重新拍摄或换一张更清晰的照片。";
  }
  return "这张照片暂时不适合使用，请换一张更清晰的本人照片。";
}

/**
 * @param {string | undefined} detectionStatus
 * @param {string[] | undefined} reasonCodes
 * @returns {boolean} 是否可进入审美偏好页
 */
export function canProceedToPhotoPreference(detectionStatus, reasonCodes) {
  if (!detectionStatus) return true;
  if (detectionStatus === "passed" || detectionStatus === "skipped") return true;
  if (detectionStatus === "failed") return false;
  return false;
}

export { mapDetectionReasonCodesToMessage as detectionFailureMessage };
