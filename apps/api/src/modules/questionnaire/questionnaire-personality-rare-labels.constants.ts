import type { PersonalityLabelRule } from "./questionnaire-personality-labels.constants";

/**
 * 隐藏款稀有人格：主池（15 类强/弱收敛）之外的小众原型。
 * 仅在 displayPrimary 会落入 fallback 时参与匹配；阈值低于主池候选（0.75）。
 * 若无规则达阈值，则取弱匹配最高的一条；仍无命中则固定「自洽未命名体」，避免展示「尚未收敛」标题。
 */
export const PERSONALITY_RARE_LABEL_RULES: readonly PersonalityLabelRule[] = [
  {
    id: "mist_boundary",
    name: "雾里边界人",
    tokens: ["1D", "8D", "6D"],
  },
  {
    id: "emotion_blender",
    name: "情绪混血体",
    tokens: ["2D", "15D", "10D"],
  },
  {
    id: "slow_bloom",
    name: "慢热开花株",
    tokens: ["1A", "2B", "8B"],
  },
  {
    id: "parallel_orbit",
    name: "平行轨道伴侣",
    tokens: ["6C", "8C", "20C"],
  },
  {
    id: "tidal_lover",
    name: "潮汐式恋人",
    tokens: ["1B", "8C", "15A"],
  },
  {
    id: "glass_heart_architect",
    name: "玻璃心建筑师",
    tokens: ["1B", "10A", "5B"],
  },
  {
    id: "rational_romantic",
    name: "理性浪漫主义",
    tokens: ["1A", "11B", "20B"],
  },
  {
    id: "quiet_storm",
    name: "静音暴风雨",
    tokens: ["2C", "15C", "12B"],
  },
  {
    id: "orbit_partner",
    name: "轨道式伴侣",
    tokens: ["8C", "6B", "18B"],
  },
  {
    id: "self_named_enigma",
    name: "自洽未命名体",
    tokens: ["1C", "6D", "20D"],
  },
] as const;

export const RARE_LABEL_MATCH_V3 = {
  /** 弱匹配比例下限（主池候选为 0.75） */
  MIN_MATCH_RATIO: 0.5,
  /** 至少命中的条件条数（与比例取更严者） */
  MIN_MATCHED_CONDITIONS: 2,
} as const;
