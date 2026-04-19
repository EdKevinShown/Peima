/**
 * G1-R 问卷题池（v1.2 结构 + v3 数据分层）：每题稳定 questionKey、题干、四选项；每选项 `tags: string[]`。
 *
 * **sourceTier（闸门）**：`canonical` = 已确认真源，可参与生产计分；`draft` = 结构齐、待真源替换；
 * `placeholder` = 仅占位（当前题池未使用，保留供后续插槽）。后续 scorer v2 / submit 应只消费 `canonical`（见 `getCanonicalQuestionKeys` 等）。
 *
 * 公开 API：`getPublicQuestions()` 仅返回 key / title / options{value,label}，不暴露 tags、不暴露 sourceTier。
 *
 * 过渡：`dimension` / `score` / `RelationDimension` 仍供未升级的 scorer v1 使用。
 */

export const QUESTIONNAIRE_VERSION = "g1r-q30-v1.2";

/** @deprecated 仅供给尚未升级的 questionnaire.scorer v1；scorer v2 后将移除 */
export type RelationDimension =
  | "socialEnergy"
  | "emotionalExpression"
  | "relationshipPace"
  | "initiativeLevel"
  | "decisionOrientation"
  | "conflictResponse";

/** v3：题级真源 / 脚手架分层（每题必填其一） */
export type QuestionSourceTier = "canonical" | "draft" | "placeholder";

export type QuestionOptionDef = {
  value: string;
  label: string;
  /** @deprecated 仅 scorer v1 */
  score: number;
  /** G1-R 打点 token：{1–20}{档}；合法零贡献选项使用 [] */
  tags: string[];
};

export type QuestionDef = {
  key: string;
  /** v3：生产计分闸门；下游只应对 canonical 聚合 tags */
  sourceTier: QuestionSourceTier;
  title: string;
  /** @deprecated 仅 scorer v1 */
  dimension: RelationDimension;
  options: QuestionOptionDef[];
};

const ABCD_SCORES = [0, 33, 66, 100] as const;

function opts(
  _dimension: RelationDimension,
  labels: [string, string, string, string],
  tagsByOption: [string[], string[], string[], string[]],
): QuestionOptionDef[] {
  return (["A", "B", "C", "D"] as const).map((value, i) => ({
    value,
    label: labels[i],
    score: ABCD_SCORES[i],
    tags: tagsByOption[i],
  }));
}

function buildQuestion(
  sourceTier: QuestionSourceTier,
  key: string,
  dimension: RelationDimension,
  title: string,
  labels: [string, string, string, string],
  tagsByOption: [string[], string[], string[], string[]],
): QuestionDef {
  return {
    key,
    sourceTier,
    dimension,
    title,
    options: opts(dimension, labels, tagsByOption),
  };
}

export const QUESTIONS: QuestionDef[] = [
  buildQuestion(
    "canonical",
    "q01",
    "conflictResponse",
    "对象让你生气了你会:",
    [
      "闭门不出美美消化",
      "分手吧下一个更好",
      "想吵架吗我奉陪到底",
      "闺蜜/哥们你听我说我真的一整个大无语",
    ],
    [
      ["1C", "2B", "3B", "4C", "8C"],
      ["1C", "2A", "3A", "4B", "9B"],
      ["2A", "3A", "4A", "8C"],
      ["2A", "3A", "4B", "8B", "14A"],
    ],
  ),
  buildQuestion(
    "canonical",
    "q02",
    "relationshipPace",
    "你理想中的恋爱状态更像是：",
    [
      "双人单机游戏, 各自升级，各自精彩",
      "可以不秒回，但请别消失",
      "不聊像断氧，回复秒续命",
      "合适秒同居，共享进度条",
    ],
    [
      ["1C", "2B", "3A", "6C", "8C", "14C"],
      ["1A", "2B", "3B", "6B", "8B", "14B"],
      ["1B", "2A", "3A", "6A", "9A", "14A"],
      ["1B", "2A", "3A", "6A", "7A", "8A", "12C", "16A"],
    ],
  ),
  buildQuestion(
    "canonical",
    "q03",
    "emotionalExpression",
    "你觉得爱情中最重要的是：",
    [
      "情绪必须接住, 稳定不失忠诚",
      "我有我的人生，别改我的剧本",
      "要么轰轰烈烈，不然就别开始",
      "两只咸鱼一起晒",
    ],
    [
      ["1B", "5C", "6A", "7A", "9A", "10A", "20B"],
      ["1C", "6C", "7C", "8C"],
      ["2A", "15A", "20A"],
      ["1A", "5A", "6B", "8B", "18B"],
    ],
  ),
  buildQuestion(
    "canonical",
    "q04",
    "decisionOrientation",
    "对于消费你更偏向：",
    [
      "快乐比余额更重要",
      "我需要精算师！",
      "直接梭哈",
      "鼠鼠我呀今天又屯了一笔",
    ],
    [
      ["11A", "20A", "13A"],
      ["11B", "20B", "13B"],
      ["11A", "20A", "15A"],
      ["11C", "20B", "13C"],
    ],
  ),
  buildQuestion(
    "canonical",
    "q05",
    "socialEnergy",
    "如果伴侣突然变得很成功你会：",
    [
      "平时就爱蹭点光",
      "宝宝大胆飞，我在后面追",
      "先撤了，免得自己显得多余",
      "敷衍着说「你好厉害」，实则内心倔强不服无能狂怒且自我怀疑",
    ],
    [
      ["1A", "5D", "6B", "8B", "10C"],
      ["1A", "6B", "8C", "10C"],
      ["1C", "6C", "8C", "4C"],
      ["1B", "6A", "10B", "15A"],
    ],
  ),
  buildQuestion(
    "canonical",
    "q06",
    "initiativeLevel",
    "你希望恋人表达爱的方式：",
    [
      "贴贴！",
      "嘴甜一点，我很好哄",
      "少说多做不画饼",
      "礼物! 我要礼物！没有礼物我直接一个雷霆半月斩！",
    ],
    [
      ["5A", "5E", "6A", "1B"],
      ["5D", "2A", "3B", "6A"],
      ["5C", "12A", "3A", "1A"],
      ["5B", "11A", "20A", "14A"],
    ],
  ),
  buildQuestion(
    "canonical",
    "q07",
    "conflictResponse",
    "吵架时, 你属于：",
    [
      "对抗路 — 先不说发育我俩现在必须死一个",
      "中路 — 理性发育先冷静了再分对错",
      "打野 — 孤独地偷偷发育慢慢消化",
      "辅助 — 不发育没脾气吵输了我受着",
    ],
    [
      ["2A", "3A", "4A", "7B", "15A"],
      ["2B", "3B", "4C", "15B"],
      ["1C", "2B", "4B", "8C", "15B"],
      ["2B", "4B", "6A", "8A"],
    ],
  ),
  buildQuestion(
    "canonical",
    "q08",
    "emotionalExpression",
    "对象不回消息：",
    [
      "谁没回我消息？不说我都没注意到",
      "等到天荒地老",
      "审讯台已经准备好了",
      "已脑补出轨",
    ],
    [
      ["1C", "6C", "8C", "10C"],
      ["1A", "6B", "15B"],
      ["2A", "3A", "4A"],
      ["1B", "6A", "10A", "15A"],
    ],
  ),
  buildQuestion(
    "canonical",
    "q09",
    "decisionOrientation",
    "对象想要查你手机：",
    ["查吧", "你最好也扛得住我查", "看不到不该看的就行", "手机？我是山顶洞人没有手机"],
    [
      ["9A", "10C", "1A"],
      ["7A", "10A", "6A"],
      ["9B", "10B", "6B"],
      ["1C", "8C", "7C"],
    ],
  ),
  buildQuestion(
    "canonical",
    "q10",
    "relationshipPace",
    "你想要的恋爱节奏：",
    ["慢慢来", "快快来", "都可以", "这不还没谈上嘛谈了再说吧"],
    [
      ["13C", "20B", "15B"],
      ["13A", "20A", "2A"],
      ["20A", "7C"],
      ["13C", "8C", "6C"],
    ],
  ),
  buildQuestion(
    "canonical",
    "q11",
    "initiativeLevel",
    "关于未来规划：",
    [
      "计划表都写满了，作者 V 我 50 开个会员",
      "有个大纲就足够",
      "未来的事未来再说吧",
      "我会去到我该去的地方 🙏阿弥陀佛",
    ],
    [
      ["18A", "6A", "20B"],
      ["18A", "13B", "6B"],
      ["13C", "6C"],
      ["20A", "13C", "15B"],
    ],
  ),
  buildQuestion(
    "canonical",
    "q12",
    "conflictResponse",
    "关于对象和异性接触：",
    [
      "接受度很高，不越过红线就没有什么问题",
      "你自由了我也自由了 （配图肖申克的救赎自己脑补一下）",
      "给足面子，没关系啊，回家挨打就好了",
      "碰一下就让你见识什么是大伊万（一种没有人喜欢的大炸弹）",
    ],
    [
      ["10C", "1A", "8C"],
      ["7A", "10A", "20A"],
      ["10B", "1B", "15A"],
      ["10A", "9A", "6A"],
    ],
  ),
  buildQuestion(
    "canonical",
    "q13",
    "conflictResponse",
    "当你和伴侣对同一件事的优先级完全相反、又必须表态时，你更可能？",
    [
      "先各退一步，找折中方案",
      "坚持把自己的理由讲清楚",
      "先搁置，改天情绪平复再谈",
      "目前说不清楚，先不选立场",
    ],
    [["4A", "7B"], ["3A", "7A"], ["13B", "4B"], []],
  ),
  buildQuestion(
    "canonical",
    "q14",
    "socialEnergy",
    "对方出差一周几乎不回消息，你更容易？",
    [
      "反复看手机，容易胡思乱想",
      "会发消息但不会连环追问",
      "专注自己的事，相信对方在忙",
      "直接说明自己需要怎样的报备频率",
    ],
    [["1B", "6B"], ["1B", "3A"], ["1C", "8A"], ["1A", "3A"]],
  ),
  buildQuestion(
    "canonical",
    "q15",
    "emotionalExpression",
    "被当众调侃你和对方的关系，你更可能？",
    [
      "尴尬笑笑，尽快结束话题",
      "顺势接梗，一带而过",
      "半开玩笑把边界说清楚",
      "认真回应，避免被误读",
    ],
    [["2B", "10B"], ["2B", "3A"], ["2A", "4A"], ["2A", "15A"]],
  ),
  buildQuestion(
    "draft",
    "q16",
    "relationshipPace",
    "认识不久对方就聊结婚时间表，你会？",
    [
      "明显不适，想放慢或暂停",
      "礼貌听，但不承诺具体节点",
      "觉得可以边了解边对齐预期",
      "反而觉得对方认真，愿意深入聊",
    ],
    [["18C", "13C"], ["18B", "13B"], ["18A", "13B"], ["18A", "13A"]],
  ),
  buildQuestion(
    "canonical",
    "q17",
    "initiativeLevel",
    "需要一起完成一件麻烦事（搬家/办事），你更倾向？",
    [
      "等对方安排，我配合执行",
      "分工明确，各做各的块",
      "主动列清单并推动进度",
      "希望一起商量流程再动手",
    ],
    [["8C", "7B"], ["8B", "3B"], ["8A", "7A"], ["8B", "3A"]],
  ),
  buildQuestion(
    "draft",
    "q18",
    "decisionOrientation",
    "大额共同支出（旅行/家电）意见不一致时，你更可能？",
    [
      "先搁置购买，各自冷静",
      "先听对方理由再表态",
      "拉表格算清楚利弊再决定",
      "坚持原则项，其它可让步",
    ],
    [["11B", "7B"], ["11B", "3A"], ["11A", "7A"], ["11A", "4A"]],
  ),
  buildQuestion(
    "draft",
    "q19",
    "decisionOrientation",
    "聊到「安全感」时，对方说你「想太多」，你更可能？",
    [
      "先沉默，避免当场冲突",
      "用玩笑带过，但记在心里",
      "直接说自己的感受和底线",
      "反问对方具体指哪一点",
    ],
    [["6B", "4B"], ["6A", "11B"], ["6A", "3A"], ["3A", "7B"]],
  ),
  buildQuestion(
    "canonical",
    "q20",
    "conflictResponse",
    "对方在朋友面前否定你的一个小习惯，你会？",
    [
      "当场忍下，回家再谈",
      "当场轻描淡写反驳",
      "私下严肃沟通边界",
      "觉得无伤大雅，一笑置之",
    ],
    [["4B", "10B"], ["4A", "3A"], ["4A", "7A"], ["4C", "15A"]],
  ),
  buildQuestion(
    "canonical",
    "q21",
    "socialEnergy",
    "长假更愿意把大块时间花在？",
    [
      "独处或小范围安静活动",
      "一两天社交，其余休息",
      "一半社交一半自己安排",
      "尽量多见人、多安排活动",
    ],
    [["14C", "13B"], ["14B", "13B"], ["14B", "13A"], ["14A", "13A"]],
  ),
  buildQuestion(
    "canonical",
    "q22",
    "emotionalExpression",
    "对方忘记你们的小约定（非原则），你更可能？",
    [
      "不主动提，但会冷淡一点",
      "提醒一次，看对方反应",
      "说清楚自己在意什么",
      "觉得小事不必计较",
    ],
    [["2B", "10A"], ["2B", "3A"], ["2A", "4A"], ["2C", "15A"]],
  ),
  buildQuestion(
    "draft",
    "q23",
    "relationshipPace",
    "对方想把你介绍给家人，你的第一反应更接近？",
    [
      "希望再等等，关系还不够稳",
      "可以见，但不想被催婚催进度",
      "愿意见，当作关系自然推进",
      "积极准备，把这当作重要节点",
    ],
    [["17B", "13C"], ["17B", "13B"], ["17A", "13B"], ["17A", "13A"]],
  ),
  buildQuestion(
    "draft",
    "q24",
    "initiativeLevel",
    "发现对方手机里有暧昧聊天记录（未证实出轨），你会？",
    [
      "先观察，不摊牌",
      "旁敲侧击试探",
      "直接要求解释清楚",
      "先整理自己的情绪再沟通",
    ],
    [["8C", "10B"], ["8B", "3B"], ["8A", "4A"], ["8B", "15A"]],
  ),
  buildQuestion(
    "canonical",
    "q25",
    "conflictResponse",
    "对方在你面前评价别人更优秀：",
    [
      "「那你去找他」",
      "一笑带过，但心里不舒服",
      "情绪毫无波澜",
      "「你欣赏他哪一点？」",
    ],
    [["2A", "3A", "4A", "10A"], ["1B", "10B", "2B", "15A"], ["1C", "8C", "10C"], ["1A", "20B", "3A", "7B"]],
  ),
  buildQuestion(
    "draft",
    "q26",
    "decisionOrientation",
    "对未来居住地（城市/国家）分歧很大时，你更可能？",
    [
      "先看感情深度再决定要不要妥协",
      "列出各自底线再谈",
      "愿意尝试阶段性方案（先试住）",
      "认为无法调和就只能止损",
    ],
    [["12B", "18B"], ["12A", "7A"], ["12A", "13B"], ["12B", "18A"]],
  ),
  buildQuestion(
    "draft",
    "q27",
    "conflictResponse",
    "对方用讽刺语气说你「太敏感」，你更可能？",
    [
      "当场怼回去",
      "冷处理，减少交流",
      "指出语气问题并表达感受",
      "先认错缓和气氛再说感受",
    ],
    [["4A", "3A"], ["4B", "2B"], ["4A", "2A"], ["4B", "15A"]],
  ),
  buildQuestion(
    "draft",
    "q28",
    "initiativeLevel",
    "对方需要和异性同事单独加班很晚，你更可能？",
    [
      "直接表达不安并要求透明",
      "心里不舒服但不说",
      "相信对方职业边界",
      "提出折中（报备/接送等）",
    ],
    [["10A", "6A"], ["10B", "2B"], ["10C", "8A"], ["10B", "3A"]],
  ),
  buildQuestion(
    "draft",
    "q29",
    "emotionalExpression",
    "你更希望在亲密关系里被怎样「看见」？",
    [
      "被理解我的脆弱与压力",
      "被认可我的付出与选择",
      "被尊重我的边界与节奏",
      "被带动一起成长与尝试",
    ],
    [["2A", "6B"], ["2A", "5A"], ["2B", "8A"], ["2B", "12A"]],
  ),
  buildQuestion(
    "draft",
    "q30",
    "relationshipPace",
    "如果感情进入平淡期，你更倾向？",
    [
      "接受平淡，把注意力放回自己",
      "主动制造新鲜感与小仪式",
      "开诚布公聊彼此期待",
      "评估是否价值观仍匹配",
    ],
    [["13C", "12B"], ["13B", "5A"], ["13A", "3A"], ["13B", "18A"]],
  ),
];

const QUESTION_BY_KEY = new Map(QUESTIONS.map((q) => [q.key, q]));

export function getQuestionKeys(): string[] {
  return QUESTIONS.map((q) => q.key);
}

export function getQuestionOrNull(key: string): QuestionDef | undefined {
  return QUESTION_BY_KEY.get(key);
}

/** 仅 `sourceTier === "canonical"` 的题 key，供 scorer v2 / 生产 submit 过滤使用 */
export function getCanonicalQuestionKeys(): string[] {
  return QUESTIONS.filter((q) => q.sourceTier === "canonical").map((q) => q.key);
}

/** 该 key 是否允许进入「生产计分」路径（与 canonical 等价） */
export function isQuestionProductionReady(key: string): boolean {
  const q = QUESTION_BY_KEY.get(key);
  return q !== undefined && q.sourceTier === "canonical";
}

export type PublicQuestion = {
  key: string;
  title: string;
  options: { value: string; label: string }[];
};

export function getPublicQuestions(): PublicQuestion[] {
  return QUESTIONS.map((q) => ({
    key: q.key,
    title: q.title,
    options: q.options.map(({ value, label }) => ({ value, label })),
  }));
}
