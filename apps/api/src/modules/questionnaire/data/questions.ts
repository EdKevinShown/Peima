export const QUESTIONNAIRE_VERSION = "p0-1";

export type RelationDimension =
  | "socialEnergy"
  | "emotionalExpression"
  | "relationshipPace"
  | "initiativeLevel"
  | "decisionOrientation"
  | "conflictResponse";

export type QuestionOptionDef = {
  value: string;
  label: string;
  score: number;
};

export type QuestionDef = {
  key: string;
  title: string;
  dimension: RelationDimension;
  options: QuestionOptionDef[];
};

const ABCD_SCORES: QuestionOptionDef[] = [
  { value: "A", label: "", score: 0 },
  { value: "B", label: "", score: 33 },
  { value: "C", label: "", score: 66 },
  { value: "D", label: "", score: 100 },
];

function opts(
  labels: [string, string, string, string],
): QuestionOptionDef[] {
  return ABCD_SCORES.map((o, i) => ({
    ...o,
    label: labels[i],
  }));
}

export const QUESTIONS: QuestionDef[] = [
  {
    key: "se_1",
    dimension: "socialEnergy",
    title: "周五晚上朋友临时约你小聚，你更可能怎么做？",
    options: opts([
      "能推就推，更想安静待着",
      "会去，但心里盼着早点结束",
      "正常参与，气氛好就多待会儿",
      "爽快答应，顺便看能不能多叫几个人",
    ]),
  },
  {
    key: "se_2",
    dimension: "socialEnergy",
    title: "刚进一个新圈子（兴趣群/新公司），你通常会？",
    options: opts([
      "先潜水观察，很少主动发言",
      "礼貌回应，但不会急着认识谁",
      "有人问就聊，也会适时接话",
      "很快记住关键面孔，主动找话题破冰",
    ]),
  },
  {
    key: "ee_1",
    dimension: "emotionalExpression",
    title: "连着几天情绪低落，你更常见的处理方式是？",
    options: opts([
      "自己消化，不太想麻烦别人",
      "用写日记、听歌、运动慢慢缓一缓",
      "找一两个信任的人微信吐个槽",
      "希望有人能尽快察觉到并来关心我",
    ]),
  },
  {
    key: "ee_2",
    dimension: "emotionalExpression",
    title: "在乎的人误会了你的一句话，你更倾向？",
    options: opts([
      "先冷处理，等对方气消了再说",
      "简短解释一下，点到为止",
      "会把感受和事实分开讲清楚",
      "尽快当面聊开，不想让误会过夜",
    ]),
  },
  {
    key: "rp_1",
    dimension: "relationshipPace",
    title: "双方都有点好感但还没说破，你更希望节奏是？",
    options: opts([
      "再观察很久，确认合拍再往前",
      "慢慢来，顺其自然推进",
      "正常频率聊天/见面，稳步升温",
      "倾向把话说开，尽快确定关系感",
    ]),
  },
  {
    key: "rp_2",
    dimension: "relationshipPace",
    title: "线上聊了两周，互动很好但还没见面，你会？",
    options: opts([
      "继续线上，不急着推进",
      "有空再约，不强求时间表",
      "主动提议找个轻松场合见一面",
      "很快推动见面，觉得现实接触更重要",
    ]),
  },
  {
    key: "il_1",
    dimension: "initiativeLevel",
    title: "互相都有好感时，通常谁先迈出下一步？",
    options: opts([
      "我几乎总是等对方先动",
      "我更被动，但会给很明显信号",
      "看情况，合适时我也会主动",
      "我经常主动安排约会或挑明心意",
    ]),
  },
  {
    key: "il_2",
    dimension: "initiativeLevel",
    title: "发现对方很久没主动发消息，你会？",
    options: opts([
      "我也不发，先观察对方态度",
      "偶尔点个赞或轻描淡写一句",
      "找由头主动开聊",
      "直接问对方是不是忙或有什么想法",
    ]),
  },
  {
    key: "do_1",
    dimension: "decisionOrientation",
    title: "周末约会行程还没定，你更习惯？",
    options: opts([
      "随便，怎样都行",
      "有几个想法，但更想听对方安排",
      "会列两三种方案让对方选",
      "我喜欢提前定好时间地点和路线",
    ]),
  },
  {
    key: "do_2",
    dimension: "decisionOrientation",
    title: "两人对一件小事看法不一致（不触及底线），你更可能？",
    options: opts([
      "先让步，避免抬杠",
      "提议缓一缓，改天再聊",
      "尽量讲道理，看能不能折中",
      "希望当场对齐标准，避免以后反复",
    ]),
  },
  {
    key: "cr_1",
    dimension: "conflictResponse",
    title: "约会迟到且对方解释含糊，你第一反应更接近？",
    options: opts([
      "心里扣分，但表面不说",
      "轻描淡写提一句就算了",
      "会表达不满，但控制语气",
      "希望当场说清楚规则和期望",
    ]),
  },
  {
    key: "cr_2",
    dimension: "conflictResponse",
    title: "吵架后冷战了半天，你更可能先？",
    options: opts([
      "继续僵持，等对方先低头",
      "做点小动作（分享链接）试探",
      "主动发一句缓和的话",
      "主动约沟通，把症结摊开谈",
    ]),
  },
];

const QUESTION_BY_KEY = new Map(QUESTIONS.map((q) => [q.key, q]));

export function getQuestionKeys(): string[] {
  return QUESTIONS.map((q) => q.key);
}

export function getQuestionOrNull(key: string): QuestionDef | undefined {
  return QUESTION_BY_KEY.get(key);
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
