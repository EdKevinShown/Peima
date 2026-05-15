/**
 * Maps Nest / class-validator style English messages to user-facing Chinese on /account.
 */

/** Split combined validation lines like `minAge must..., maxAge must...`. */
function splitNestValidationCsv(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const byField = trimmed.split(
    /,\s*(?=(?:minAge|maxAge|minHeight|maxHeight|preferredCities|educationPreferences|occupationPreferences|relationshipGoalPreferences|styleTags)\s)/i,
  );
  const parts = byField
    .flatMap((b) =>
      b
        .split(/\n|;+(?!\d)/)
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .filter(Boolean);
  return parts.length ? parts : [trimmed];
}

function normLower(s) {
  return String(s).trim().toLowerCase();
}

/**
 * @param {string} part
 * @returns {string | null}
 */
function mapValidationFragment(part) {
  const m = normLower(part);
  if (!m) return null;
  if (/[\u3400-\u9fff]/.test(part)) {
    return part.trim();
  }

  if (
    (m.includes("preferredcities") ||
      m.includes("educationpreferences") ||
      m.includes("occupationpreferences") ||
      m.includes("relationshipgoalpreferences") ||
      m.includes("styletags")) &&
    m.includes("invalid value")
  ) {
    return "选项不合法，请重新选择后保存";
  }
  if (m.includes("styletags") && m.includes("invalid")) {
    return "选项不合法，请重新选择后保存";
  }
  if (
    m.includes("contains invalid value") ||
    m.includes("must be a valid enum")
  ) {
    return "选项不合法，请重新选择后保存";
  }

  if (m.includes("minage cannot be greater")) {
    return "年龄下限不能大于年龄上限";
  }
  if (m.includes("minheight cannot be greater")) {
    return "身高下限不能大于身高上限";
  }

  if (m.includes("minage") && m.includes("cannot be greater")) {
    return "年龄下限不能大于年龄上限";
  }
  if (m.includes("minheight") && m.includes("cannot be greater")) {
    return "身高下限不能大于身高上限";
  }

  if (
    /minage[^\n]{0,120}greater[^\n]{0,120}maxage/i.test(part) ||
    /min[^\n]{0,8}age[^\n]{0,120}(>|greater)[^\n]{0,120}max/i.test(part)
  ) {
    return "年龄下限不能大于年龄上限";
  }
  if (
    /minheight[^\n]{0,120}greater[^\n]{0,120}maxheight/i.test(part)
  ) {
    return "身高下限不能大于身高上限";
  }

  if (
    /minage[^\n]{0,80}greater[^\n]{0,80}maxage/i.test(part) ||
    (m.includes("minage") && m.includes("maxage") && m.includes("greater"))
  ) {
    return "年龄下限不能大于年龄上限";
  }
  if (
    m.includes("minheight") &&
    m.includes("maxheight") &&
    (m.includes("greater") ||
      m.includes("must not be greater"))
  ) {
    return "身高下限不能大于身高上限";
  }

  if (m.includes("minage") && m.includes("must not be less than")) {
    return "年龄下限不能小于 18 岁";
  }
  if (m.includes("minage") && m.includes("must not be greater than")) {
    return "年龄下限不能大于 60 岁";
  }
  if (m.includes("maxage") && m.includes("must not be greater than")) {
    return "年龄上限不能大于 60 岁";
  }
  if (m.includes("maxage") && m.includes("must not be less than")) {
    return "年龄上限不能小于 18 岁";
  }

  if (m.includes("minheight") && m.includes("must not be less than")) {
    return "身高下限不能小于 140 cm";
  }
  if (m.includes("minheight") && m.includes("must not be greater than")) {
    return "身高下限不能大于 210 cm";
  }
  if (m.includes("maxheight") && m.includes("must not be greater than")) {
    return "身高上限不能大于 210 cm";
  }
  if (m.includes("maxheight") && m.includes("must not be less than")) {
    return "身高上限不能小于 140 cm";
  }

  if (
    m.includes("should not exist") ||
    (m.includes("property") &&
      (m.includes("should not exist") || m.includes("forbidden")))
  ) {
    return "请求包含了不支持的字段，请刷新页面后重试。";
  }

  return null;
}

function looksLikeTechnicalEnglishValidation(s) {
  const t = normLower(s);
  if (/[\u3400-\u9fff]/.test(s)) return false;
  return (
    t.includes(" must ") ||
    t.includes(" should not ") ||
    t.includes(" should be ") ||
    t.includes(" is not ")
  );
}

/**
 * @param {unknown} err
 * @returns {string}
 */
export function mapAccountApiErrorMessage(err) {
  const text =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : String(err ?? "");
  if (!text.trim()) {
    return "保存失败，请稍后重试。";
  }

  const chunks = splitNestValidationCsv(text);
  const mapped = [];
  const seen = new Set();
  for (const c of chunks) {
    const trimmed = c.trim();
    const zh =
      mapValidationFragment(trimmed) ?? mapValidationFragment(normLower(trimmed));
    const fallback =
      zh ??
      (looksLikeTechnicalEnglishValidation(trimmed)
        ? "保存失败：请核对年龄、身高与各偏好选项是否在可选范围内。"
        : trimmed);
    if (!seen.has(fallback)) {
      seen.add(fallback);
      mapped.push(fallback);
    }
  }
  return mapped.join("、");
}
