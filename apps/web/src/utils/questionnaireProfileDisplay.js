/** 二十轴展示名（与 QuestionnaireProfilePage 一致） */
export const AXIS_LABELS = {
  attachmentStyle: "依恋",
  emotionalExpression: "情绪表达",
  communicationStyle: "沟通",
  conflictHandling: "冲突",
  loveLanguage: "爱的方式",
  securityNeed: "安全感",
  controlNeed: "掌控感",
  independence: "独立性",
  loyaltyView: "忠诚",
  jealousyTendency: "占有欲",
  moneyAttitude: "金钱",
  careerPriority: "事业",
  lifePace: "生活节奏",
  socialNeed: "社交",
  emotionalStability: "情绪稳定",
  sexualValues: "亲密观念",
  familyView: "家庭",
  marriageExpectation: "婚姻",
  childrenIntent: "生育",
  riskPreference: "冒险",
};

export const G1R_AXIS_KEYS = [
  "attachmentStyle",
  "emotionalExpression",
  "communicationStyle",
  "conflictHandling",
  "loveLanguage",
  "securityNeed",
  "controlNeed",
  "independence",
  "loyaltyView",
  "jealousyTendency",
  "moneyAttitude",
  "careerPriority",
  "lifePace",
  "socialNeed",
  "emotionalStability",
  "sexualValues",
  "familyView",
  "marriageExpectation",
  "childrenIntent",
  "riskPreference",
];

/** 用户可理解的五组，避免平铺 20 张卡 */
export const DIMENSION_GROUPS = [
  {
    id: "bond",
    title: "亲密与连接",
    keys: ["attachmentStyle", "emotionalExpression", "loveLanguage", "jealousyTendency"],
  },
  {
    id: "daily",
    title: "沟通与日常相处",
    keys: ["communicationStyle", "conflictHandling", "emotionalStability", "socialNeed"],
  },
  {
    id: "self",
    title: "自我与边界",
    keys: ["securityNeed", "controlNeed", "independence", "loyaltyView"],
  },
  {
    id: "life",
    title: "生活与节奏",
    keys: ["moneyAttitude", "careerPriority", "lifePace", "riskPreference"],
  },
  {
    id: "future",
    title: "长期取向",
    keys: ["sexualValues", "familyView", "marriageExpectation", "childrenIntent"],
  },
];

export function axisIdForKey(axisKey) {
  const idx = G1R_AXIS_KEYS.indexOf(axisKey);
  return idx >= 0 ? idx + 1 : null;
}

export function dominantRate(prof) {
  const dom = prof?.dominantBranch;
  if (!dom) return null;
  const rate = prof?.branches?.[dom]?.rate;
  return typeof rate === "number" ? rate : null;
}

/** 一句话强度，不用 A/B/C */
export function strengthLabel(prof, uncertain) {
  const unc = uncertain ?? prof?.uncertainBranches ?? [];
  if (unc.length > 0) return "尚在权衡";
  const rate = dominantRate(prof);
  if (rate == null) return null;
  if (rate >= 0.62) return "较明显";
  if (rate >= 0.45) return "略有倾向";
  return "较均衡";
}

export function isAxisLinked(axisId, highlightSet) {
  if (!highlightSet?.size) return false;
  return ["A", "B", "C", "D", "E"].some((L) => highlightSet.has(`${axisId}:${L}`));
}

export function hasAxisData(prof) {
  if (!prof?.branches) return false;
  return Object.values(prof.branches).some((b) => (b?.opportunities ?? 0) > 0);
}

/**
 * @param {object} opts
 * @param {Record<string, object>|null} opts.dimProfiles
 * @param {Record<string, string[]>|null} opts.uncertainByAxis
 * @param {Set<string>} opts.highlightSet
 */
export function buildDimensionRows({ dimProfiles, uncertainByAxis, highlightSet }) {
  return G1R_AXIS_KEYS.map((axisKey, idx) => {
    const axisId = idx + 1;
    const sk = String(axisId);
    const prof = dimProfiles?.[sk];
    const uncertain = uncertainByAxis?.[sk];
    if (!hasAxisData(prof)) return null;
    return {
      axisKey,
      axisId,
      prof,
      uncertain,
      linked: isAxisLinked(axisId, highlightSet),
      strength: strengthLabel(prof, uncertain),
      sortScore: dominantRate(prof) ?? (uncertain?.length ? 0.4 : 0),
    };
  }).filter(Boolean);
}

export function pickNotableRows(rows, { max = 8 } = {}) {
  const linked = rows.filter((r) => r.linked);
  const rest = rows
    .filter((r) => !r.linked)
    .filter((r) => r.strength === "较明显" || r.strength === "尚在权衡")
    .sort((a, b) => b.sortScore - a.sortScore);
  const picked = [...linked];
  for (const r of rest) {
    if (picked.length >= max) break;
    if (!picked.some((p) => p.axisKey === r.axisKey)) picked.push(r);
  }
  return picked;
}

export function groupDimensionRows(rows) {
  const byKey = new Map(rows.map((r) => [r.axisKey, r]));
  return DIMENSION_GROUPS.map((g) => ({
    ...g,
    items: g.keys.map((k) => byKey.get(k)).filter(Boolean),
  })).filter((g) => g.items.length > 0);
}
