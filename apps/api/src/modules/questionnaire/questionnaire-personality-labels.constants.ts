/**
 * 人格标签规则：每条为「展示名 + 所需维度主分支 token 列表」。
 * 强主标签 / 候选标签仅基于第一层分支画像（高确定性 dominant 与 v3 匹配逻辑）。
 * 顺序即主标签优先级（强命中时取第一条）。
 */
export type PersonalityLabelRule = {
  id: string;
  name: string;
  /** 如 ["1B","6A","8A","10A"] */
  tokens: readonly string[];
};

/** 主标签 / 候选标签共用的核心规则表（仅保留原始清单中的核心人格标签）。 */
export const PERSONALITY_CORE_LABEL_RULES: readonly PersonalityLabelRule[] = [
  {
    id: "clingy_recharger",
    name: "粘人型续命机",
    tokens: ["1B", "6A", "8A", "10A"],
  },
  {
    id: "secure_old_dog",
    name: "安全型老狗",
    tokens: ["1A", "6B", "8B", "15B"],
  },
  {
    id: "free_range",
    name: "自由散养体",
    tokens: ["1C", "6C", "8C", "10C"],
  },
] as const;

/**
 * 风格标签规则表：须与产品约定同源扩充。
 * 当前无单独「风格」规则行，故此处为空数组（不自创名称与条件）。
 */
export const PERSONALITY_STYLE_LABEL_RULES: readonly PersonalityLabelRule[] =
  [] as const;

/** 第二层标签匹配阈值（集中常量）。 */
export const QUESTIONNAIRE_LABEL_MATCH_V3 = {
  CANDIDATE_MIN_MATCH_RATIO: 0.75,
  MAX_CANDIDATE_LABELS: 5,
} as const;
