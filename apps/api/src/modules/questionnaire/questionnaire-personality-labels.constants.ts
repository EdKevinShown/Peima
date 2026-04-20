/**
 * 人格标签：主池 = 整体关系人格；风格池 = 局部行为侧面。
 * 强主 / 候选仅基于第一层 dominant + uncertain（v3）。
 * 顺序即主标签强命中优先级。
 */
export type PersonalityLabelRule = {
  id: string;
  name: string;
  /** 如 ["1B","6A","8A","10A"] */
  tokens: readonly string[];
};

export type StyleLabelCategory =
  | "communication_conflict"
  | "love_expression"
  | "control_boundary"
  | "values"
  | "emotion_recovery";

export type PersonalityStyleLabelRule = PersonalityLabelRule & {
  /** 仅文案/UI；不参与匹配 */
  category: StyleLabelCategory;
};

/** 主标签 / 候选标签来源（整体关系人格）。 */
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
  {
    id: "intermittent_missing",
    name: "间歇性失踪人口",
    tokens: ["1C", "8C", "15A"],
  },
  {
    id: "relationship_microscope",
    name: "关系显微镜",
    tokens: ["1B", "6A", "10A", "15A"],
  },
  {
    id: "low_demand_observer",
    name: "低需求观察者",
    tokens: ["1A", "6C", "8C"],
  },
  {
    id: "intimate_dependent",
    name: "亲密依赖体",
    tokens: ["5E", "6A", "1B"],
  },
  {
    id: "love_brain_tough_mouth",
    name: "恋爱脑但嘴硬",
    tokens: ["1B", "8A", "2A"],
  },
  {
    id: "sober_independent",
    name: "独立清醒怪",
    tokens: ["1A", "8C", "20B"],
  },
  {
    id: "free_within_relationship",
    name: "关系内自由派",
    tokens: ["8C", "6C"],
  },
  {
    id: "love_but_not_need_you",
    name: "可以爱但不需要你",
    tokens: ["1A", "8C", "6C"],
  },
  {
    id: "you_unstable_i_more",
    name: "你不稳我更不稳",
    tokens: ["1B", "6A", "15A"],
  },
  {
    id: "no_drama_but_will_leave",
    name: "我不作，但我会走",
    tokens: ["1A", "8C", "9B"],
  },
  {
    id: "not_lacking_love",
    name: "不缺爱",
    tokens: ["8C", "20B"],
  },
  {
    id: "unstable_is_the_issue",
    name: "不是不需要你，是你不够稳定",
    tokens: ["6A", "1A"],
  },
] as const;

/** 风格标签来源；匹配逻辑不读取 category。 */
export const PERSONALITY_STYLE_LABEL_RULES: readonly PersonalityStyleLabelRule[] =
  [
    {
      id: "blunt_not_gentle",
      name: "话直但不温柔",
      tokens: ["3A", "2A"],
      category: "communication_conflict",
    },
    {
      id: "passive_aggressive_master",
      name: "高级阴阳师",
      tokens: ["3B", "2B", "15A"],
      category: "communication_conflict",
    },
    {
      id: "emotional_mute",
      name: "情绪哑巴",
      tokens: ["2B", "4B"],
      category: "communication_conflict",
    },
    {
      id: "tough_mouth_champion",
      name: "嘴硬冠军",
      tokens: ["2A", "3B", "15A"],
      category: "communication_conflict",
    },
    {
      id: "logic_debate_machine",
      name: "逻辑辩论机器",
      tokens: ["3A", "4A", "20B"],
      category: "communication_conflict",
    },
    {
      id: "silent_scorekeeper",
      name: "不说但全记",
      tokens: ["2B", "10B", "15A"],
      category: "communication_conflict",
    },
    {
      id: "confrontation_warrior",
      name: "对抗路战神",
      tokens: ["4A", "3A", "2A"],
      category: "communication_conflict",
    },
    {
      id: "cold_war_pro",
      name: "冷战专业户",
      tokens: ["4B", "2B", "15A"],
      category: "communication_conflict",
    },
    {
      id: "ninja_turtle_style",
      name: "忍者龟",
      tokens: ["4C", "2B"],
      category: "communication_conflict",
    },
    {
      id: "emotional_nuke",
      name: "情绪核弹",
      tokens: ["2A", "4A", "15A"],
      category: "communication_conflict",
    },
    {
      id: "regret_after_fight",
      name: "吵完就后悔",
      tokens: ["2A", "15A"],
      category: "communication_conflict",
    },
    {
      id: "ninja_person",
      name: "忍者",
      tokens: ["2B", "4C", "15A"],
      category: "communication_conflict",
    },
    {
      id: "companion_old_dog",
      name: "陪伴型老狗",
      tokens: ["5A", "6B"],
      category: "love_expression",
    },
    {
      id: "action_worker",
      name: "行动派打工人",
      tokens: ["5C", "3A"],
      category: "love_expression",
    },
    {
      id: "sweet_talk_supplier",
      name: "嘴甜供应商",
      tokens: ["5D", "2A"],
      category: "love_expression",
    },
    {
      id: "gift_burst_stream",
      name: "礼物暴击流",
      tokens: ["5B", "11A"],
      category: "love_expression",
    },
    {
      id: "love_in_details",
      name: "爱在细节里",
      tokens: ["5C", "6B", "15B"],
      category: "love_expression",
    },
    {
      id: "relationship_admin",
      name: "关系管理员",
      tokens: ["7A", "6A", "3A"],
      category: "control_boundary",
    },
    {
      id: "control_player",
      name: "掌控型玩家",
      tokens: ["7A", "20A"],
      category: "control_boundary",
    },
    {
      id: "boundary_clean_freak",
      name: "边界洁癖患者",
      tokens: ["7C", "9A"],
      category: "control_boundary",
    },
    {
      id: "need_confirmation_machine",
      name: "需要被确认机器",
      tokens: ["6A", "1B"],
      category: "control_boundary",
    },
    {
      id: "low_control_free_person",
      name: "低控制自由人",
      tokens: ["7C", "8C"],
      category: "control_boundary",
    },
    {
      id: "presence_detector",
      name: "你在不在检测仪",
      tokens: ["6A", "10A"],
      category: "control_boundary",
    },
    {
      id: "loyalty_clean_freak",
      name: "忠诚洁癖",
      tokens: ["9A", "6A"],
      category: "control_boundary",
    },
    {
      id: "boundary_cop",
      name: "边界警察",
      tokens: ["9A", "7A"],
      category: "control_boundary",
    },
    {
      id: "jealousy_king",
      name: "吃醋王",
      tokens: ["10B", "2B"],
      category: "control_boundary",
    },
    {
      id: "fake_chill_buddha",
      name: "假佛系",
      tokens: ["10B", "1B"],
      category: "control_boundary",
    },
    {
      id: "zero_possession_free",
      name: "零占有自由派",
      tokens: ["10C", "8C"],
      category: "control_boundary",
    },
    {
      id: "emotional_compare_addict",
      name: "情绪对比狂",
      tokens: ["10A", "1B"],
      category: "control_boundary",
    },
    {
      id: "happy_consumer",
      name: "快乐消费主义者",
      tokens: ["11A", "20A"],
      category: "values",
    },
    {
      id: "rational_budget_master",
      name: "理性预算大师",
      tokens: ["11B", "20B"],
      category: "values",
    },
    {
      id: "dormouse_life",
      name: "鼠鼠",
      tokens: ["11C", "13C"],
      category: "values",
    },
    {
      id: "romance_big_spender",
      name: "恋爱花钱型选手",
      tokens: ["11A", "5B"],
      category: "values",
    },
    {
      id: "reality_filter",
      name: "现实筛选器",
      tokens: ["12A", "18A"],
      category: "values",
    },
    {
      id: "career_first_executor",
      name: "事业优先执行者",
      tokens: ["12A", "20A"],
      category: "values",
    },
    {
      id: "romance_no_block_levelup",
      name: "恋爱不影响升级",
      tokens: ["12A", "8C"],
      category: "values",
    },
    {
      id: "balance_player",
      name: "平衡型玩家",
      tokens: ["12B", "8B"],
      category: "values",
    },
    {
      id: "life_main_quest",
      name: "人生主线玩家",
      tokens: ["12A", "20B"],
      category: "values",
    },
    {
      id: "romance_side_quest",
      name: "恋爱支线玩家",
      tokens: ["12B", "18B"],
      category: "values",
    },
    {
      id: "capybara_core",
      name: "卡皮巴拉本体",
      tokens: ["15B", "1A"],
      category: "emotion_recovery",
    },
    {
      id: "emotional_roller_coaster",
      name: "情绪过山车",
      tokens: ["15A", "2A"],
      category: "emotion_recovery",
    },
    {
      id: "delayed_explosion",
      name: "延迟爆炸型",
      tokens: ["2B", "15A"],
      category: "emotion_recovery",
    },
    {
      id: "calm_surface_chaos_inside",
      name: "表面稳定内心翻江倒海",
      tokens: ["1B", "15A"],
      category: "emotion_recovery",
    },
    {
      id: "self_digest_expert",
      name: "自我消化专家",
      tokens: ["2B", "15B"],
      category: "emotion_recovery",
    },
    {
      id: "love_but_retreat_first",
      name: "会爱，但更会撤退",
      tokens: ["1C", "8C", "9B"],
      category: "emotion_recovery",
    },
    {
      id: "wont_stay_hooked_long",
      name: "不会上头太久",
      tokens: ["1A", "15B"],
      category: "emotion_recovery",
    },
    {
      id: "silent_inner_judge",
      name: "嘴上不说，心里判刑",
      tokens: ["2B", "10B", "15A"],
      category: "emotion_recovery",
    },
  ] as const;

/** 第二层标签匹配阈值（集中常量）。 */
export const QUESTIONNAIRE_LABEL_MATCH_V3 = {
  CANDIDATE_MIN_MATCH_RATIO: 0.75,
  MAX_CANDIDATE_LABELS: 5,
  /** 风格标签对外返回条数上限 */
  MAX_STYLE_LABELS: 3,
} as const;
