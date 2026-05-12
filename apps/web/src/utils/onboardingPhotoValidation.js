/** P7.3：上传前轻量校验（与后端 5MB、jpeg/png/webp/gif 能力对齐；前端推荐不含 gif）。 */
export const ONBOARDING_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * @param {File | null | undefined} file
 * @returns {string | null} 错误文案；null 表示通过基础校验
 */
export function validateOnboardingPhotoFileBasics(file) {
  if (!file || file.size === 0) {
    return "请选择一张有效的图片。";
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return "请上传 JPG、PNG 或 WebP 格式的照片（暂不建议使用 GIF）。";
  }
  if (file.size > ONBOARDING_PHOTO_MAX_BYTES) {
    return "文件过大，请上传不超过 5MB 的照片。";
  }
  return null;
}

/**
 * @param {File} file
 * @returns {Promise<{ width: number; height: number }>}
 */
export function measureImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
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
export async function validateOnboardingPhotoDimensions(file) {
  try {
    const { width, height } = await measureImageDimensions(file);
    if (width < 300 || height < 300) {
      return "图片分辨率偏低，请上传宽、高均至少约 300 像素的照片，以便获得更清晰的预览。";
    }
    return null;
  } catch {
    return "图片格式可能无效或已损坏，请重新选择。";
  }
}
