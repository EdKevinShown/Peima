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

function parseTag(tag: string): { axisId: number; band: string } | null {
  const t = tag.trim();
  const m = TAG_RE.exec(t);
  if (!m) return null;
  const axisId = Number(m[1]);
  const band = m[2].toUpperCase();
  if (axisId < 1 || axisId > 20) return null;
  return { axisId, band };
}

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
