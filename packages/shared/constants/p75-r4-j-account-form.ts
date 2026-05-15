/**
 * P7.5-r4-j / r4-j1: Structured account + matching preference enums（中国语境：省级地区）。
 * `User.city` / `UserPreference.preferredCities` 字段名不变，存值为省级地区白名单。
 * styleTags 与 onboarding photoVisual taxonomy（`p7.5-v1`）对齐。
 */

export const ACCOUNT_GENDER_VALUES = ["male", "female"] as const;
export type AccountGender = (typeof ACCOUNT_GENDER_VALUES)[number];

/** Saved on `User.gender`; UI labels translated in web layer. */
export const ACCOUNT_DISPLAY_GENDER: Record<AccountGender, string> = {
  male: "男",
  female: "女",
};

/** 省级地区 / 直辖市 / 自治区 / 特别行政区 + 海外 / 其他（非城市级）。 */
export const ACCOUNT_REGION_OPTIONS = [
  "北京",
  "天津",
  "上海",
  "重庆",
  "河北",
  "山西",
  "辽宁",
  "吉林",
  "黑龙江",
  "江苏",
  "浙江",
  "安徽",
  "福建",
  "江西",
  "山东",
  "河南",
  "湖北",
  "湖南",
  "广东",
  "海南",
  "四川",
  "贵州",
  "云南",
  "陕西",
  "甘肃",
  "青海",
  "台湾",
  "内蒙古",
  "广西",
  "西藏",
  "宁夏",
  "新疆",
  "香港",
  "澳门",
  "海外",
  "其他",
] as const;

/** 与 Prisma `User.city` / `UserPreference.preferredCities` 存储值一致；保留历史导出名。 */
export const ACCOUNT_CITY_VALUES = ACCOUNT_REGION_OPTIONS;
export type AccountCity = (typeof ACCOUNT_CITY_VALUES)[number];
export type AccountRegion = AccountCity;

export const ACCOUNT_EDUCATION_VALUES = [
  "初中及以下",
  "高中",
  "中专",
  "职高",
  "技校",
  "大专",
  "本科",
  "硕士",
  "博士",
  "其他",
] as const;
export type AccountEducation = (typeof ACCOUNT_EDUCATION_VALUES)[number];

/** Stored on `User.occupation` as coarse category only (no migration). */
export const ACCOUNT_OCCUPATION_CATEGORY_VALUES = [
  "学生",
  "互联网 / IT / 通信",
  "金融 / 银行 / 证券",
  "会计 / 审计 / 财务",
  "医疗 / 护理 / 医药",
  "教育 / 培训 / 科研",
  "设计 / 传媒 / 内容",
  "市场 / 销售 / 商务",
  "法律 / 公务员 / 事业单位",
  "制造业 / 工程 / 技术",
  "房地产 / 建筑 / 装修",
  "餐饮 / 零售 / 服务业",
  "自由职业",
  "创业者",
  "暂不方便透露",
  "其他",
] as const;

export const ACCOUNT_RELATIONSHIP_GOAL_VALUES = [
  "认真恋爱",
  "先认识了解",
  "长期关系",
  "结婚导向",
  "暂不确定",
] as const;

/** UserPreference.styleTags closed set（与 vision taxonomy 同源）。 */
export const ACCOUNT_STYLE_TAG_WHITELIST = [
  "清爽自然",
  "甜美可爱",
  "酷感个性",
  "成熟稳重",
  "文艺温柔",
  "运动阳光",
  "生活感",
  "精致感",
  "松弛感",
  "氛围感",
  "简约干净",
  "有个性",
  "都市精致",
  "高级感",
  "户外感",
  "社交感",
  "室内日常",
  "证件感弱",
] as const;

/**
 * Onboarding「整体气质」+「照片感觉」；与 `/account` 共用 `UserPreference.styleTags`，仅此子集在引导页展示。
 * 文档与其它包可称 PHOTO_VISUAL_TAGS。
 */
export const ONBOARDING_STYLE_GROUP_VIBE_TAGS = [
  "清爽自然",
  "甜美可爱",
  "酷感个性",
  "成熟稳重",
  "文艺温柔",
  "运动阳光",
] as const;

export const ONBOARDING_STYLE_GROUP_FEEL_TAGS = [
  "生活感",
  "精致感",
  "松弛感",
  "氛围感",
  "简约干净",
  "有个性",
] as const;

export const ONBOARDING_PHOTO_STYLE_TAG_POOL = [
  ...ONBOARDING_STYLE_GROUP_VIBE_TAGS,
  ...ONBOARDING_STYLE_GROUP_FEEL_TAGS,
] as const;

/** 与 ONBOARDING_PHOTO_STYLE_TAG_POOL 同义（第一印象 / 照片气质风格）。 */
export const PHOTO_VISUAL_TAGS = ONBOARDING_PHOTO_STYLE_TAG_POOL;

export const ONBOARDING_PHOTO_STYLE_TAG_POOL_SET = new Set<string>(
  ONBOARDING_PHOTO_STYLE_TAG_POOL as readonly string[],
);

/** 「优先关注」维度：仅 onboarding UI，不写入 UserPreference.styleTags（本轮无独立列）。 */
export const PHOTO_FOCUS_TAG_OPTIONS = [
  "笑容",
  "穿搭",
  "气质",
  "五官",
  "身材比例",
  "整体感觉",
] as const;

export type OnboardingPhotoPreferenceUiGroup = {
  readonly title: string;
  readonly tags: readonly string[];
  /** Default true: first two groups; false for photo focus chips. */
  readonly submitsToStyleTags: boolean;
};

export const ONBOARDING_PHOTO_PREFERENCE_UI_GROUPS: readonly OnboardingPhotoPreferenceUiGroup[] =
  [
    {
      title: "整体气质",
      tags: ONBOARDING_STYLE_GROUP_VIBE_TAGS,
      submitsToStyleTags: true,
    },
    {
      title: "照片感觉",
      tags: ONBOARDING_STYLE_GROUP_FEEL_TAGS,
      submitsToStyleTags: true,
    },
    {
      title: "优先关注",
      tags: PHOTO_FOCUS_TAG_OPTIONS,
      submitsToStyleTags: false,
    },
  ];

export type AccountStyleTag =
  (typeof ACCOUNT_STYLE_TAG_WHITELIST)[number];

const STYLE_SET = new Set<string>(ACCOUNT_STYLE_TAG_WHITELIST);

export const ACCOUNT_MIN_AGE = 18;
export const ACCOUNT_MAX_AGE = 60;
export const ACCOUNT_MIN_HEIGHT_CM = 140;
export const ACCOUNT_MAX_HEIGHT_CM = 210;

export function ageOptionsInclusive(): readonly number[] {
  const out: number[] = [];
  for (let a = ACCOUNT_MIN_AGE; a <= ACCOUNT_MAX_AGE; a += 1) out.push(a);
  return out;
}

export function heightOptionsCmInclusive(): readonly number[] {
  const out: number[] = [];
  for (let h = ACCOUNT_MIN_HEIGHT_CM; h <= ACCOUNT_MAX_HEIGHT_CM; h += 1) out.push(h);
  return out;
}

export function isAllowedStylePreferenceTag(tag: string): tag is AccountStyleTag {
  return STYLE_SET.has(tag);
}
