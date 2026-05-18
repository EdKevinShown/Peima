/**
 * P7.5-r7-d2: Zhipu vision prompt (taxonomy + JSON schema, no PII).
 */

import {
  QUALITY_TAGS,
  QUALITY_TAXONOMY_VERSION,
  SCENE_TAGS,
  SCENE_TAXONOMY_VERSION,
} from "./onboarding-vision-quality-scene-taxonomy";
import type { CloudVisionAnalyzeInput } from "./cloud-vision.types";

const JSON_SCHEMA_EXAMPLE = JSON.stringify({
  labels: {
    photoVisual: [{ tag: "清爽自然", score: 0.9 }],
    quality: [{ tag: "清晰", score: 0.8 }],
    scene: [{ tag: "室内日常", score: 0.7 }],
  },
});

/**
 * Build closed-taxonomy prompt for Zhipu vision HTTP (no imageId / PII).
 */
export function buildZhipuCloudVisionPrompt(
  input: CloudVisionAnalyzeInput,
): string {
  const { taxonomyHints } = input;
  const preference =
    input.viewerStyleTags?.length &&
    input.viewerStyleTags.every((t) => typeof t === "string")
      ? `用户审美偏好标签（仅供参考，不得当作事实）: ${input.viewerStyleTags.join("、")}。`
      : "";

  return [
    "你是 onboarding 照片气质标注助手。只描述画面气质、质量与场景。",
    "禁止：性别、年龄、种族、颜值评分、身份识别、人脸比对、AI 美化建议。",
    "只从下列封闭词表中选 tag；输出纯 JSON，不要 markdown 或其它说明文字。",
    "",
    `photoVisual（气质，必选 1-${Math.min(6, taxonomyHints.photoVisual.length)} 个）: ${taxonomyHints.photoVisual.join("、")}`,
    `quality（${QUALITY_TAXONOMY_VERSION}，须输出 labels.quality 数组，建议 1-3 个）: ${QUALITY_TAGS.join("、")}`,
    `scene（${SCENE_TAXONOMY_VERSION}，须输出 labels.scene 数组，建议 1-3 个）: ${SCENE_TAGS.join("、")}`,
    "",
    "输出要求：",
    "- 根对象含 labels；labels 下必须包含 photoVisual、quality、scene 三个键（均为数组）。",
    "- 每项为 {\"tag\":\"封闭词\",\"score\":0.0~1.0}；tag 必须来自对应词表。",
    "- 无法分析时输出 {\"refusal\":{\"code\":\"…\",\"message\":\"…\"}}，不要编造。",
    preference,
    `JSON 示例（仅结构参考）: ${JSON_SCHEMA_EXAMPLE}`,
  ]
    .filter(Boolean)
    .join("\n");
}
