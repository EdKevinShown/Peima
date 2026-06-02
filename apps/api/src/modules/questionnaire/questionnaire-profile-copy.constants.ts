/**
 * 问卷画像解释词典（非 AI）：主标签 / 风格 / 分支短句 + fallback。
 */

export type PrimaryLabelCopyEntry = {
  title: string;
  summary: string;
};

export const PRIMARY_LABEL_COPY: Record<string, PrimaryLabelCopyEntry> = {
  clingy_recharger: {
    title: "整体画像偏向粘人型续命机",
    summary:
      "你在关系里更看重即时回应、被看见与被确认，亲密感和安全感常常绑在一起，回应一慢就容易心里发空。",
  },
  secure_old_dog: {
    title: "整体画像偏向安全型老狗",
    summary:
      "关系里耐受度相对高，短期冷淡或波动不太会让你立刻崩盘，你更吃长期稳定的相处节奏。",
  },
  free_range: {
    title: "整体画像偏向自由散养体",
    summary:
      "你需要呼吸空间和低控制，黏腻、压迫式确认和高占有会让你本能想逃，独立感不能丢。",
  },
  intermittent_missing: {
    title: "整体画像偏向间歇性失踪人口",
    summary:
      "靠近与抽离会交替出现，节奏上有时像「一阵一阵的」，不一定缺感情，但稳定性对你和他人都是考题。",
  },
  relationship_microscope: {
    title: "整体画像偏向关系显微镜",
    summary:
      "你对互动里的细节和温差很敏感，容易放大信号，需要对方给你更可预测的态度与解释。",
  },
  low_demand_observer: {
    title: "整体画像偏向低需求观察者",
    summary:
      "你不太向外索取高频确认，更惯于保持距离观察，热情起伏可能不如别人外显，但不等于不在乎。",
  },
  intimate_dependent: {
    title: "整体画像偏向亲密依赖体",
    summary:
      "亲密对你几乎是刚需，身体与情感上的靠近都很重要，离远了容易患得患失、心里发紧。",
  },
  love_brain_tough_mouth: {
    title: "整体画像偏向恋爱脑但嘴硬",
    summary:
      "心里很容易上头，嘴上却常硬撑或反着说，容易形成「嘴硬心软」的错位，对方有时会读不懂你。",
  },
  sober_independent: {
    title: "整体画像偏向独立清醒怪",
    summary:
      "你更看重自持和清醒距离，不愿被关系淹没，现实感和自我边界通常排在「上头」前面。",
  },
  free_within_relationship: {
    title: "整体画像偏向关系内自由派",
    summary:
      "在关系里仍坚持独立与安全感并重，讨厌被绑死或被审问式确认，自由是亲密的前提之一。",
  },
  love_but_not_need_you: {
    title: "整体画像偏向可以爱但不需要你",
    summary:
      "爱可以有，但自我价值不全挂在对方身上，你更需要尊重与距离感都健康的相处方式。",
  },
  you_unstable_i_more: {
    title: "整体画像偏向你不稳我更不稳",
    summary:
      "对方的起伏会明显牵动你，你像对方的情绪放大器，稳定、可预期的回应对你格外重要。",
  },
  no_drama_but_will_leave: {
    title: "整体画像偏向我不作，但我会走",
    summary:
      "你不爱纠缠式闹，可一旦底线被踩或长期失衡，你更倾向干脆离开，而不是无休止拉扯。",
  },
  not_lacking_love: {
    title: "整体画像偏向不缺爱",
    summary:
      "自足感相对强，不太靠外部不断输血，关系的存在更像加分项，而不是救命稻草。",
  },
  unstable_is_the_issue: {
    title: "整体画像偏向不是不需要你，是你不够稳定",
    summary:
      "核心诉求往往是可预测的陪伴与回应，反复无常比「不够浪漫」更伤你，稳定感优先于甜言蜜语。",
  },
};

/** 无任何主池候选命中时的展示主标签兜底（非 AI）。 */
export const DISPLAY_PRIMARY_FALLBACK = {
  id: "no_label_match",
  name: "暂无法归纳为命名人格标签",
  titleLine: "当前关系人格画像尚未收敛到命名标签",
  paragraphLead:
    "各维度上的分支倾向仍较分散，暂不足以稳定套入某一类命名人格标签；不妨把下方分支明细当作自我对照的线索。",
} as const;

/** 隐藏款稀有人格：主池外小众原型（非 AI）。 */
export const RARE_LABEL_COPY: Record<string, PrimaryLabelCopyEntry> = {
  mist_boundary: {
    title: "隐藏款 · 雾里边界人",
    summary:
      "你在亲密与距离之间更像踩着雾走：既需要被看见，又本能保留退路，边界感柔韧而不僵硬，别人容易读成「若即若离」。",
  },
  emotion_blender: {
    title: "隐藏款 · 情绪混血体",
    summary:
      "情绪表达与消化方式常混搭多种模式，同一情境里可能既敏感又克制；关系里更像「多色系」而非单一色调。",
  },
  slow_bloom: {
    title: "隐藏款 · 慢热开花株",
    summary:
      "信任与投入偏慢热，前期像观望，一旦认定则愿意长期经营；急火式推进或高压确认未必适合你。",
  },
  parallel_orbit: {
    title: "隐藏款 · 平行轨道伴侣",
    summary:
      "你更习惯在关系里保留平行生活与节奏，亲密不等于完全重叠，并肩而行比黏成一体更自在。",
  },
  tidal_lover: {
    title: "隐藏款 · 潮汐式恋人",
    summary:
      "靠近与退潮会周期性交替，感情未必浅，但稳定性与可预期性对你和对方都是长期课题。",
  },
  glass_heart_architect: {
    title: "隐藏款 · 玻璃心建筑师",
    summary:
      "内心细腻、对互动温差敏感，同时又会用理性或规则感给自己搭脚手架；受伤时可能先收紧再表达。",
  },
  rational_romantic: {
    title: "隐藏款 · 理性浪漫主义",
    summary:
      "既渴望浪漫与联结，又习惯用清醒与边界护住自己；上头与自持常在内心并存，外人未必一眼看穿。",
  },
  quiet_storm: {
    title: "隐藏款 · 静音暴风雨",
    summary:
      "表面平静、少戏剧化表达，内在却对关系质量高度在意；积压久了可能以离开或冷处理而非大吵收场。",
  },
  orbit_partner: {
    title: "隐藏款 · 轨道式伴侣",
    summary:
      "更像稳定绕行的陪伴：存在感持续但不抢戏，重视默契与节奏合拍，讨厌被拽进失控的占有或审问。",
  },
  self_named_enigma: {
    title: "隐藏款 · 自洽未命名体",
    summary:
      "答卷在多个维度上难以单点归类，但你并非「没有类型」，而是更接近自洽的混搭体；下列称呼是参照用的小众原型，用来补全主池留白的阅读体验。",
  },
};

/** 隐藏款展示时的统一说明（接在人格 summary 之前）。 */
export const DISPLAY_RARE_FRAMING = {
  subtitle: "隐藏款 · 主池外稀有人格",
  paragraphPrefix:
    "主流十五类关系人格之外，你的回答在若干关键维度上呈现出更混搭、更难单点收敛的图案；下面这一型是参照用的小众原型，用来补全「暂无法命名」的空缺，不等于临床或依恋类型定论。",
} as const;

/** 风格侧写：一句人话，用于 summary / bullets。 */
export const STYLE_LABEL_COPY: Record<string, string> = {
  blunt_not_gentle:
    "说话直、少绕弯，但温度感不强，容易让对方觉得「道理对、心里冷」。",
  passive_aggressive_master:
    "不正面冲突，却常用反话、暗示或阴阳让对方难受，心里其实记得很清楚。",
  emotional_mute:
    "情绪不爱摊开说，更习惯闷着或回避深谈，容易形成「你猜」式沟通。",
  tough_mouth_champion:
    "嘴上不服输、爱顶，心里却可能早就软了，典型嘴硬心软。",
  logic_debate_machine:
    "冲突里先上逻辑和道理，容易把对话变成辩论场，情绪面常被压后。",
  silent_scorekeeper:
    "表面不说，心里一笔笔记着，旧账可能在某一刻集中冒出来。",
  confrontation_warrior:
    "冲突里倾向正面硬刚，不喜欢拖泥带水，输赢感有时压过修复感。",
  cold_war_pro:
    "吵完容易进入冷战或沉默对抗，用距离惩罚对方，自己却也不好受。",
  ninja_turtle_style:
    "能忍、能憋，表面风平浪静，内里可能已经翻江倒海很久。",
  emotional_nuke:
    "情绪上来时强度高、爆发快，像短时「核爆」，过后又常后悔。",
  regret_after_fight:
    "吵的时候上头，冷静下来又容易后悔，但模式可能反复出现。",
  ninja_person:
    "极度能忍，把委屈压到很低，直到某一天突然「不想忍了」。",
  companion_old_dog:
    "更认陪伴和在场，细水长流胜过轰轰烈烈，稳定感是爱的主菜。",
  action_worker:
    "更信「做到了才算」，少说多做，兑现感比口头承诺重要。",
  sweet_talk_supplier:
    "嘴上甜、会哄，用语言和情绪价值把场子撑起来。",
  gift_burst_stream:
    "倾向用礼物或物质表达在乎，爆发式付出时很用力。",
  love_in_details:
    "爱藏在细节和日常里，小事上的记得与照顾对你才是真心。",
  relationship_admin:
    "关系里像管理员，在意规则、节奏和分工，失控会触发焦虑。",
  control_player:
    "对大方向和掌控感敏感，不喜欢被蒙在鼓里或被动跟着走。",
  boundary_clean_freak:
    "边界很清，越界一次就会拉警报，容忍度不一定高。",
  need_confirmation_machine:
    "需要反复被确认「你还在、你还爱我」，回应慢了容易多想。",
  low_control_free_person:
    "低控制、高空间，讨厌被管被审，自由感是安全感的一部分。",
  presence_detector:
    "对「在不在场、有没有回应」极度敏感，冷淡比吵架更伤人。",
  loyalty_clean_freak:
    "忠诚标准高，暧昧灰色地带几乎不容忍。",
  boundary_cop:
    "边界和规则看得紧，对方踩线会立刻纠正或后退。",
  jealousy_king:
    "吃醋反应外显或内耗都强，占有欲和比较心容易被点燃。",
  fake_chill_buddha:
    "表面佛系、心里在意，容易口是心非或假装不在意。",
  zero_possession_free:
    "低占有、重自主，关系里也要保留「我是我」的空间。",
  emotional_compare_addict:
    "爱拿细节和态度做对比，容易在心里给对方打分。",
  happy_consumer:
    "花钱能带来快乐与关系氛围，对体验型消费不吝啬。",
  rational_budget_master:
    "花钱有规划，更信性价比和长期账本，冲动消费会自责。",
  dormouse_life:
    "生活与消费偏省、偏苟，大钱小事都容易肉疼。",
  romance_big_spender:
    "恋爱里愿意为对方和仪式感花钱，浪漫常与开销绑定。",
  reality_filter:
    "现实条件、门槛和未来走向会前置筛选，不太爱纯幻想式开始。",
  career_first_executor:
    "事业与目标执行靠前，关系要让位于主线时你会选得很清楚。",
  romance_no_block_levelup:
    "恋爱不耽误自我升级，并行推进而不是二选一。",
  balance_player:
    "关系与自我发展之间找平衡，不极端牺牲哪一头。",
  life_main_quest:
    "人生主线清晰，恋爱是重要支线但不是唯一主线。",
  romance_side_quest:
    "恋爱像支线任务，投入有节制，全情上头相对难。",
  capybara_core:
    "情绪恢复相对钝感、稳，外界波动不太容易把你带飞。",
  emotional_roller_coaster:
    "情绪起伏大、来得快，关系里像坐过山车。",
  delayed_explosion:
    "当下能忍，延迟后才爆，爆发点常让对方觉得「突然」。",
  calm_surface_chaos_inside:
    "表面维持稳定，内心戏很多，只是不爱全摊出来。",
  self_digest_expert:
    "习惯自己消化情绪，不轻易麻烦别人，但也可能堆积。",
  love_but_retreat_first:
    "会爱，但一旦感到不安全会更先想到撤退自保。",
  wont_stay_hooked_long:
    "上头期短或能自我降温，不容易长期陷在执念里。",
  silent_inner_judge:
    "嘴上不撕破，心里已经判了分，失望会悄悄累积。",
};

export const BRANCH_COPY_FALLBACK =
  "该维在此分支上有一致倾向，需结合其他维度综合理解。";

/** 轴号 → 分支字母 → 短句（用于 evidence bullets）。 */
export const BRANCH_COPY: Record<number, Record<string, string>> = {
  1: {
    A: "依恋上更偏稳定、低戏剧",
    B: "依恋上更在意回应与温度，容易随互动起伏",
    C: "依恋上更强调空间与抽离，不喜高黏",
    D: "依恋上偏试探与摇摆，靠近与后退会交替",
    E: "依恋与亲密需求绑得很紧，身体与情感靠近都很重要",
  },
  2: {
    A: "情绪表达更外放、强度更高",
    B: "情绪表达更内敛或压抑，不爱摊开说",
    C: "情绪表达适中，看场合收放",
    D: "情绪表达偏回避或延迟",
    E: "情绪表达有特定触发模式，忽冷忽热感",
  },
  3: {
    A: "沟通更直给、少绕弯",
    B: "沟通更绕、反话或暗示多",
    C: "沟通节奏适中",
    D: "沟通偏回避或简短",
    E: "沟通里输赢感或辩论感强",
  },
  4: {
    A: "冲突里更偏正面交锋或对抗",
    B: "冲突里更偏冷战、沉默或撤退",
    C: "冲突里更偏忍让与拖延处理",
    D: "冲突里更偏逃避或转移话题",
    E: "冲突处理方式较混合",
  },
  5: {
    A: "更看重在场与陪伴式付出",
    B: "更看重礼物或物质表达",
    C: "更看重行动与帮忙兑现",
    D: "更看重甜言与情绪价值",
    E: "亲密与身体亲近在爱里权重很高",
  },
  6: {
    A: "安全感需求偏高，需要高频确认",
    B: "安全感需求适中、较稳",
    C: "安全感需求偏低，不太向外索取",
    D: "安全感随情境波动大",
    E: "安全感与边界、掌控议题常绑在一起",
  },
  7: {
    A: "控制与秩序需求偏高，关系里要「有数」",
    B: "控制需求适中",
    C: "控制需求低，更偏放手与信任",
    D: "对失控敏感但表达不一定外显",
    E: "控制感与责任分摊较敏感",
  },
  8: {
    A: "独立性偏低，更依赖关系里的靠近",
    B: "独立与依赖较平衡",
    C: "独立性高，自我空间不能丢",
    D: "独立感波动，时近时远",
    E: "独立议题常与安全感联动",
  },
  9: {
    A: "忠诚与专一标准高，灰色地带难接受",
    B: "忠诚标准适中",
    C: "对忠诚议题较宽松或务实",
    D: "忠诚议题上易多疑或反复确认",
    E: "忠诚与隐私边界常一起考量",
  },
  10: {
    A: "嫉妒与比较心容易被点燃",
    B: "占有欲或吃醋外显或内耗强",
    C: "低占有、低嫉妒，关系里要保留自我",
    D: "嫉妒反应看情境，不稳定",
    E: "对「被比下去」或忽视很敏感",
  },
  11: {
    A: "花钱偏爽、偏体验与当下快乐",
    B: "花钱偏理性与计划",
    C: "花钱偏省、对价格敏感",
    D: "金钱态度中庸、看对象与场合",
    E: "金钱与自尊或安全感常挂钩",
  },
  12: {
    A: "事业与现实目标排序靠前",
    B: "事业与关系并重、找平衡",
    C: "关系或生活享受排序更前",
    D: "事业起伏对情绪影响大",
    E: "现实筛选与门槛意识强",
  },
  13: {
    A: "社交与圈子能量偏高",
    B: "社交适中",
    C: "社交偏省、偏宅或小圈",
    D: "社交需求波动",
    E: "社交与隐私边界敏感",
  },
  15: {
    A: "情绪稳定性偏低，起伏易被点燃",
    B: "情绪稳定性高，恢复相对快",
    C: "情绪稳定性中等",
    D: "表面稳、内在波动大",
    E: "情绪恢复路径偏慢、偏积压",
  },
  18: {
    A: "婚恋与现实门槛前置、筛选严",
    B: "婚恋期待偏浪漫或理想化",
    C: "婚恋态度务实、折中",
    D: "对婚姻话题回避或未定",
    E: "婚姻与家庭规划绑得很紧",
  },
  20: {
    A: "决策与风险偏好偏进取",
    B: "决策与风险偏好偏稳健保守",
    C: "风险态度中庸、看领域",
    D: "讨厌失控感，细节控",
    E: "风险与安全感联动强",
  },
};

export function getBranchCopyLine(axisId: number, branch: string): string {
  const row = BRANCH_COPY[axisId];
  const line = row?.[branch];
  return line && line.length > 0 ? line : BRANCH_COPY_FALLBACK;
}
