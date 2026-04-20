import type { RelationDimension } from "./data/questions";
import {
  getQuestionOrNull,
  isQuestionProductionReady,
  QUESTIONS,
} from "./data/questions";

export type AnswerInput = { questionKey: string; answerValue: string };

export type ScoredRelationProfile = Record<RelationDimension, number> & {
  confidence: number;
};

/**
 * G1-R 轴 1–20 与 `UserProfile` 问卷维度字段顺序一致（axisId 为 1-based 下标）。
 */
export const G1R_PROFILE_KEYS = [
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
] as const;

export type G1rProfileKey = (typeof G1R_PROFILE_KEYS)[number];

export type G1rAxisScores = Record<G1rProfileKey, number | null>;

export type G1rQuestionnaireScore = G1rAxisScores & {
  confidence: number;
};

const DIMENSIONS: RelationDimension[] = [
  "socialEnergy",
  "emotionalExpression",
  "relationshipPace",
  "initiativeLevel",
  "decisionOrientation",
  "conflictResponse",
];

/** 轴 1–20 + 档 A–E（E 供 PDF 真源如「爱的语言」轴 5 第五类打点）。 */
const TAG_RE = /^(1[0-9]|20|[1-9])([A-Ea-e])$/;

export function parseTag(tag: string): { axisId: number; band: string } | null {
  const t = tag.trim();
  const m = TAG_RE.exec(t);
  if (!m) return null;
  const axisId = Number(m[1]);
  const band = m[2].toUpperCase();
  if (axisId < 1 || axisId > 20) return null;
  return { axisId, band };
}

/**
 * 第一层分支画像（v3）阈值集中定义。
 */
export const QUESTIONNAIRE_BRANCH_PROFILE_V3 = {
  /** 第一名与第二名 adjustedScore 差值 ≥ 此值才输出唯一 dominantBranch */
  ADJUSTED_SCORE_GAP_FOR_DOMINANT: 0.08,
  /** 风格规则命中时：单轴 adjustedScore 下限（仅当存在风格规则表项时生效） */
  STYLE_MIN_ADJUSTED_SCORE: 0.45,
} as const;

/**
 * 将选项档映射到 [0,1] 供多题均值聚合。**A–D 与历史题（含 q25）保持一致。**
 *
 * - **5D / 轴 5**：技术上可解析且进入分母；PDF「爱的语言」中 D 档与「数值 0」是否测量等价属**语义待真源确认**，**非技术阻塞**。
 * - **5E**：此前正则不匹配会被静默跳过；此处给 **E 的占位数值** 以打通 PDF token，**非**最终五分类测量模型定稿。
 */
function bandToNumeric(band: string): number | null {
  if (band === "A") return 1;
  if (band === "B") return 0.5;
  if (band === "C") return 0;
  if (band === "D") return 0;
  if (band === "E") return 0.25;
  return null;
}

function mean(nums: number[]): number {
  return nums.reduce((s, x) => s + x, 0) / nums.length;
}

function g1rKeyForAxis(axisId: number): G1rProfileKey | undefined {
  return G1R_PROFILE_KEYS[axisId - 1];
}

/**
 * 合并同一 `questionKey` 的多条作答：**后者覆盖前者**（与 Map 迭代顺序一致）。
 */
function lastWinsAnswerByQuestionKey(
  answers: ReadonlyArray<AnswerInput>,
): Map<string, string> {
  const m = new Map<string, string>();
  for (const row of answers) {
    m.set(row.questionKey, row.answerValue);
  }
  return m;
}

/**
 * G1-R 问卷 v2：仅聚合 `sourceTier === "canonical"` 的题；按选项 `tags` 写入 20 轴。
 */
export function scoreQuestionnaireG1r(
  answers: ReadonlyArray<AnswerInput>,
): G1rQuestionnaireScore {
  const totalCanonical = QUESTIONS.filter((q) =>
    isQuestionProductionReady(q.key),
  ).length;
  const merged = lastWinsAnswerByQuestionKey(answers);

  let answeredCanonical = 0;
  for (const [key, val] of merged) {
    if (!isQuestionProductionReady(key)) continue;
    const q = getQuestionOrNull(key);
    if (!q) continue;
    if (!q.options.some((o) => o.value === val)) continue;
    answeredCanonical += 1;
  }

  const confidence =
    totalCanonical === 0
      ? 0
      : Math.min(1, Math.max(0, answeredCanonical / totalCanonical));

  const perAxisValues: number[][] = Array.from({ length: 20 }, () => []);

  for (const [questionKey, answerValue] of merged) {
    if (!isQuestionProductionReady(questionKey)) continue;
    const q = getQuestionOrNull(questionKey);
    if (!q) continue;
    const opt = q.options.find((o) => o.value === answerValue);
    if (!opt) continue;

    const byAxisScratch = new Map<number, number[]>();
    for (const rawTag of opt.tags) {
      const parsed = parseTag(rawTag);
      if (!parsed) continue;
      const n = bandToNumeric(parsed.band);
      if (n === null) continue;
      const axisId = parsed.axisId;
      if (axisId < 1 || axisId > 20) continue;
      if (!g1rKeyForAxis(axisId)) continue;
      const arr = byAxisScratch.get(axisId) ?? [];
      arr.push(n);
      byAxisScratch.set(axisId, arr);
    }

    for (const [axisId, vals] of byAxisScratch) {
      if (vals.length === 0) continue;
      perAxisValues[axisId - 1].push(mean(vals));
    }
  }

  const out = {} as G1rQuestionnaireScore;
  for (let i = 0; i < 20; i++) {
    const key = G1R_PROFILE_KEYS[i];
    const arr = perAxisValues[i];
    out[key] = arr.length ? mean(arr) : null;
  }
  out.confidence = confidence;
  return out;
}

const BRANCH_LETTERS = ["A", "B", "C", "D", "E"] as const;

export type BranchScoreRow = Partial<Record<(typeof BRANCH_LETTERS)[number], number>>;

/**
 * 从答案累计各轴各分支（A–E）出现次数；仅 canonical 题；与 scoreQuestionnaireG1r 同一闸门。
 * 每出现一个合法 tags token，对应 (axis, band) +1。
 */
export function collectBranchScoresFromAnswers(
  answers: ReadonlyArray<AnswerInput>,
): Record<number, BranchScoreRow> {
  const merged = lastWinsAnswerByQuestionKey(answers);
  const scores: Record<number, BranchScoreRow> = {};
  for (let a = 1; a <= 20; a += 1) {
    const row: BranchScoreRow = {};
    for (const b of BRANCH_LETTERS) {
      row[b] = 0;
    }
    scores[a] = row;
  }
  for (const [questionKey, answerValue] of merged) {
    if (!isQuestionProductionReady(questionKey)) continue;
    const q = getQuestionOrNull(questionKey);
    if (!q) continue;
    const opt = q.options.find((o) => o.value === answerValue);
    if (!opt) continue;
    for (const rawTag of opt.tags) {
      const parsed = parseTag(rawTag);
      if (!parsed) continue;
      const { axisId, band } = parsed;
      if (axisId < 1 || axisId > 20) continue;
      if (!BRANCH_LETTERS.includes(band as (typeof BRANCH_LETTERS)[number])) {
        continue;
      }
      const letter = band as (typeof BRANCH_LETTERS)[number];
      const row = scores[axisId];
      if (!row) continue;
      row[letter] = (row[letter] ?? 0) + 1;
    }
  }
  return scores;
}

export type BranchOpportunityRow = Record<
  (typeof BRANCH_LETTERS)[number],
  number
>;

/**
 * 按「题」统计 opportunities：每道 canonical 题中，若任一选项的 tags 出现 (axis, branch)，
 * 则该题对该 (axis, branch) 计 1 次机会（同一题同一分支最多 1）。
 */
export function computeBranchOpportunitiesFromQuestionBank(): Record<
  number,
  BranchOpportunityRow
> {
  const opps: Record<number, BranchOpportunityRow> = {};
  for (let a = 1; a <= 20; a += 1) {
    const row = {} as BranchOpportunityRow;
    for (const b of BRANCH_LETTERS) {
      row[b] = 0;
    }
    opps[a] = row;
  }

  for (const q of QUESTIONS) {
    if (!isQuestionProductionReady(q.key)) continue;
    for (let axisId = 1; axisId <= 20; axisId += 1) {
      const branchesOnThisQuestion = new Set<string>();
      for (const opt of q.options) {
        for (const rawTag of opt.tags) {
          const p = parseTag(rawTag);
          if (!p || p.axisId !== axisId) continue;
          if (!BRANCH_LETTERS.includes(p.band as (typeof BRANCH_LETTERS)[number])) {
            continue;
          }
          branchesOnThisQuestion.add(p.band);
        }
      }
      for (const b of branchesOnThisQuestion) {
        const letter = b as (typeof BRANCH_LETTERS)[number];
        opps[axisId][letter] += 1;
      }
    }
  }
  return opps;
}

export type BranchMetricV3 = {
  hits: number;
  opportunities: number;
  rate: number | null;
  adjustedScore: number | null;
};

export type AxisBranchProfileV3 = {
  branches: Record<string, BranchMetricV3>;
  dominantBranch: string | null;
  /** 与 dominant 互斥：非空表示该维不确定/并列，不输出单一 dominant */
  uncertainBranches: string[];
};

/**
 * 合并 hits、题库 opportunities、rate / adjustedScore，并按 v3 规则输出 dominant 或 uncertain。
 */
export function buildAxisBranchProfilesV3(
  answers: ReadonlyArray<AnswerInput>,
): Record<number, AxisBranchProfileV3> {
  const hits = collectBranchScoresFromAnswers(answers);
  const opps = computeBranchOpportunitiesFromQuestionBank();
  const out: Record<number, AxisBranchProfileV3> = {};

  for (let axis = 1; axis <= 20; axis += 1) {
    const hitRow = hits[axis] ?? {};
    const oppRow = opps[axis] ?? {};
    const branches: Record<string, BranchMetricV3> = {};

    const eligible: {
      branch: string;
      adjustedScore: number;
    }[] = [];

    for (const b of BRANCH_LETTERS) {
      const h = hitRow[b] ?? 0;
      const o = oppRow[b] ?? 0;
      let rate: number | null = null;
      let adjustedScore: number | null = null;
      if (o > 0) {
        rate = h / o;
        adjustedScore = (h + 1) / (o + 2);
        eligible.push({ branch: b, adjustedScore });
      }
      branches[b] = {
        hits: h,
        opportunities: o,
        rate,
        adjustedScore,
      };
    }

    eligible.sort(
      (x, y) =>
        y.adjustedScore - x.adjustedScore ||
        BRANCH_LETTERS.indexOf(x.branch as (typeof BRANCH_LETTERS)[number]) -
          BRANCH_LETTERS.indexOf(y.branch as (typeof BRANCH_LETTERS)[number]),
    );

    let dominantBranch: string | null = null;
    let uncertainBranches: string[] = [];

    if (eligible.length === 0) {
      dominantBranch = null;
      uncertainBranches = [];
    } else if (eligible.length === 1) {
      dominantBranch = eligible[0].branch;
      uncertainBranches = [];
    } else {
      const first = eligible[0];
      const second = eligible[1];
      const gap = first.adjustedScore - second.adjustedScore;
      if (gap >= QUESTIONNAIRE_BRANCH_PROFILE_V3.ADJUSTED_SCORE_GAP_FOR_DOMINANT) {
        dominantBranch = first.branch;
        uncertainBranches = [];
      } else {
        dominantBranch = null;
        uncertainBranches = [first.branch, second.branch].sort();
      }
    }

    out[axis] = { branches, dominantBranch, uncertainBranches };
  }

  return out;
}

/** @deprecated 过渡：scorer v1（opt.score + RelationDimension）；新代码请用 {@link scoreQuestionnaireG1r}。 */
export function scoreQuestionnaire(
  answers: ReadonlyArray<AnswerInput>,
): ScoredRelationProfile {
  const dimScores: Record<RelationDimension, number[]> = {
    socialEnergy: [],
    emotionalExpression: [],
    relationshipPace: [],
    initiativeLevel: [],
    decisionOrientation: [],
    conflictResponse: [],
  };

  for (const row of answers) {
    const q = getQuestionOrNull(row.questionKey);
    if (!q) continue;
    const opt = q.options.find((o) => o.value === row.answerValue);
    if (!opt) continue;
    dimScores[q.dimension].push(opt.score);
  }

  const out = {} as ScoredRelationProfile;
  for (const d of DIMENSIONS) {
    const arr = dimScores[d];
    out[d] = arr.length
      ? arr.reduce((s, x) => s + x, 0) / arr.length / 100
      : 0;
  }

  const completeness = Math.min(1, answers.length / QUESTIONS.length);
  out.confidence = Math.min(1, 0.45 + completeness * 0.35);

  return out;
}
