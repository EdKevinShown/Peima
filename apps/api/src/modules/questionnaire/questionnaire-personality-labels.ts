import type { AxisBranchProfileV3 } from "./questionnaire.scorer";
import {
  parseTag,
  QUESTIONNAIRE_BRANCH_PROFILE_V3,
} from "./questionnaire.scorer";
import {
  PERSONALITY_CORE_LABEL_RULES,
  PERSONALITY_STYLE_LABEL_RULES,
  QUESTIONNAIRE_LABEL_MATCH_V3,
} from "./questionnaire-personality-labels.constants";
import {
  PERSONALITY_RARE_LABEL_RULES,
  RARE_LABEL_MATCH_V3,
} from "./questionnaire-personality-rare-labels.constants";

export type MatchedAxis = { axisId: number; branch: string };

export type PersonalityPrimary = {
  id: string;
  name: string;
  ruleTokens: string[];
  matchedAxes: MatchedAxis[];
};

export type PersonalityCandidate = PersonalityPrimary & {
  matchRatio: number;
  matchedCount: number;
  requiredCount: number;
};

export type PersonalityStyleLabel = {
  id: string;
  name: string;
  ruleTokens: string[];
  matchedAxes: MatchedAxis[];
};

/** 展示用主标签（永不为空）；与 labels.primary（强主，可为 null）分离。 */
export type DisplayPrimarySource =
  | "primary"
  | "candidate"
  | "rare"
  | "fallback";

export type PersonalityRareLabel = {
  id: string;
  name: string;
  ruleTokens: string[];
  matchedAxes: MatchedAxis[];
  matchRatio: number;
  matchedCount: number;
  requiredCount: number;
};

export type DisplayPrimary = {
  id: string;
  name: string;
  ruleTokens: string[];
  matchedAxes: MatchedAxis[];
  source: DisplayPrimarySource;
};

export type PersonalityLabelsResult = {
  primary: PersonalityPrimary | null;
  candidates: PersonalityCandidate[];
  styleLabels: PersonalityStyleLabel[];
  /** 隐藏款匹配结果；仅在与主池 fallback 同时有意义，否则为 null */
  rareLabel: PersonalityRareLabel | null;
};

function parseRuleConditions(
  tokens: readonly string[],
): { axisId: number; branch: string }[] {
  const out: { axisId: number; branch: string }[] = [];
  for (const t of tokens) {
    const p = parseTag(t);
    if (!p) continue;
    out.push({ axisId: p.axisId, branch: p.band });
  }
  return out;
}

function matchedAxesForRule(
  conditions: { axisId: number; branch: string }[],
): MatchedAxis[] {
  return conditions.map((c) => ({ axisId: c.axisId, branch: c.branch }));
}

function profileForAxis(
  layer1: Record<number, AxisBranchProfileV3>,
  axisId: number,
): AxisBranchProfileV3 | undefined {
  return layer1[axisId];
}

/** 强命中：该维有唯一 dominant 且等于规则分支（无 uncertain）。 */
function isStrongConditionMatch(
  layer1: Record<number, AxisBranchProfileV3>,
  axisId: number,
  branch: string,
): boolean {
  const p = profileForAxis(layer1, axisId);
  if (!p) return false;
  return (
    p.uncertainBranches.length === 0 &&
    p.dominantBranch != null &&
    p.dominantBranch === branch
  );
}

/** 弱匹配计数：dominant 命中，或 uncertain 中含所需分支。 */
function weakConditionMatch(
  layer1: Record<number, AxisBranchProfileV3>,
  axisId: number,
  branch: string,
): boolean {
  const p = profileForAxis(layer1, axisId);
  if (!p) return false;
  if (p.dominantBranch === branch && p.uncertainBranches.length === 0) {
    return true;
  }
  if (p.uncertainBranches.includes(branch)) return true;
  return false;
}

function ruleStrongFull(
  layer1: Record<number, AxisBranchProfileV3>,
  conditions: { axisId: number; branch: string }[],
): boolean {
  if (conditions.length === 0) return false;
  return conditions.every((c) =>
    isStrongConditionMatch(layer1, c.axisId, c.branch),
  );
}

function ruleWeakStats(
  layer1: Record<number, AxisBranchProfileV3>,
  conditions: { axisId: number; branch: string }[],
): { matchedCount: number; requiredCount: number } {
  const requiredCount = conditions.length;
  if (requiredCount === 0) return { matchedCount: 0, requiredCount: 0 };
  let matchedCount = 0;
  for (const c of conditions) {
    if (weakConditionMatch(layer1, c.axisId, c.branch)) matchedCount += 1;
  }
  return { matchedCount, requiredCount };
}

function collectStyleLabels(
  layer1: Record<number, AxisBranchProfileV3>,
): PersonalityStyleLabel[] {
  const minAdj = QUESTIONNAIRE_BRANCH_PROFILE_V3.STYLE_MIN_ADJUSTED_SCORE;
  const acc: {
    label: PersonalityStyleLabel;
    ruleIndex: number;
    strongConditions: number;
  }[] = [];

  PERSONALITY_STYLE_LABEL_RULES.forEach((rule, ruleIndex) => {
    const conditions = parseRuleConditions(rule.tokens);
    if (conditions.length === 0) return;
    let ok = true;
    let strongConditions = 0;
    for (const c of conditions) {
      const p = profileForAxis(layer1, c.axisId);
      if (!p) {
        ok = false;
        break;
      }
      const m = p.branches[c.branch];
      const adj = m?.adjustedScore;
      const strongDom =
        p.uncertainBranches.length === 0 &&
        p.dominantBranch != null &&
        p.dominantBranch === c.branch;
      const highAdj =
        adj != null && adj >= minAdj && p.uncertainBranches.length === 0;
      if (strongDom) strongConditions += 1;
      if (!strongDom && !highAdj) {
        ok = false;
        break;
      }
    }
    if (ok) {
      acc.push({
        label: {
          id: rule.id,
          name: rule.name,
          ruleTokens: [...rule.tokens],
          matchedAxes: matchedAxesForRule(conditions),
        },
        ruleIndex,
        strongConditions,
      });
    }
  });

  acc.sort((a, b) => {
    if (b.strongConditions !== a.strongConditions) {
      return b.strongConditions - a.strongConditions;
    }
    if (b.label.ruleTokens.length !== a.label.ruleTokens.length) {
      return b.label.ruleTokens.length - a.label.ruleTokens.length;
    }
    return a.ruleIndex - b.ruleIndex;
  });

  return acc
    .slice(0, QUESTIONNAIRE_LABEL_MATCH_V3.MAX_STYLE_LABELS)
    .map((x) => x.label);
}

/** 所有核心人格规则中，弱匹配比率的最高值（用于诊断「差一点命中」）。 */
export function bestCoreLabelWeakMatchRatio(
  layer1: Record<number, AxisBranchProfileV3>,
): number {
  let best = 0;
  for (const rule of PERSONALITY_CORE_LABEL_RULES) {
    const conditions = parseRuleConditions(rule.tokens);
    const { matchedCount, requiredCount } = ruleWeakStats(layer1, conditions);
    if (requiredCount > 0) {
      best = Math.max(best, matchedCount / requiredCount);
    }
  }
  return best;
}

function rareRuleQualifies(
  matchedCount: number,
  requiredCount: number,
  matchRatio: number,
): boolean {
  if (requiredCount === 0) return false;
  if (matchedCount < RARE_LABEL_MATCH_V3.MIN_MATCHED_CONDITIONS) return false;
  return matchRatio >= RARE_LABEL_MATCH_V3.MIN_MATCH_RATIO;
}

function compareRareScored(
  a: PersonalityRareLabel,
  aIndex: number,
  b: PersonalityRareLabel,
  bIndex: number,
): number {
  if (a.matchRatio !== b.matchRatio) return b.matchRatio - a.matchRatio;
  if (a.matchedCount !== b.matchedCount) return b.matchedCount - a.matchedCount;
  return aIndex - bIndex;
}

function buildRareLabelEntry(
  rule: (typeof PERSONALITY_RARE_LABEL_RULES)[number],
  layer1: Record<number, AxisBranchProfileV3>,
): PersonalityRareLabel {
  const conditions = parseRuleConditions(rule.tokens);
  const { matchedCount, requiredCount: req } = ruleWeakStats(layer1, conditions);
  const matchRatio = req > 0 ? matchedCount / req : 0;
  return {
    id: rule.id,
    name: rule.name,
    ruleTokens: [...rule.tokens],
    matchedAxes: matchedAxesForRule(conditions),
    matchRatio,
    matchedCount,
    requiredCount: req,
  };
}

const ULTIMATE_RARE_LABEL_ID = "self_named_enigma" as const;

/**
 * 主池无法收敛时，从稀有人格池取展示标签（永不为 null）。
 */
export function matchRarePersonalityLabelV3(
  layer1: Record<number, AxisBranchProfileV3>,
): PersonalityRareLabel {
  type Scored = { entry: PersonalityRareLabel; ruleIndex: number };
  let bestQualified: Scored | null = null;
  let bestAnyHit: Scored | null = null;

  for (let ruleIndex = 0; ruleIndex < PERSONALITY_RARE_LABEL_RULES.length; ruleIndex += 1) {
    const rule = PERSONALITY_RARE_LABEL_RULES[ruleIndex]!;
    const entry = buildRareLabelEntry(rule, layer1);

    if (rareRuleQualifies(entry.matchedCount, entry.requiredCount, entry.matchRatio)) {
      if (
        bestQualified === null ||
        compareRareScored(
          entry,
          ruleIndex,
          bestQualified.entry,
          bestQualified.ruleIndex,
        ) < 0
      ) {
        bestQualified = { entry, ruleIndex };
      }
    }

    if (entry.matchedCount > 0) {
      if (
        bestAnyHit === null ||
        compareRareScored(entry, ruleIndex, bestAnyHit.entry, bestAnyHit.ruleIndex) <
          0
      ) {
        bestAnyHit = { entry, ruleIndex };
      }
    }
  }

  if (bestQualified) return bestQualified.entry;
  if (bestAnyHit) return bestAnyHit.entry;

  const ultimate =
    PERSONALITY_RARE_LABEL_RULES.find((r) => r.id === ULTIMATE_RARE_LABEL_ID) ??
    PERSONALITY_RARE_LABEL_RULES[0]!;
  return {
    id: ultimate.id,
    name: ultimate.name,
    ruleTokens: [...ultimate.tokens],
    matchedAxes: [],
    matchRatio: 0,
    matchedCount: 0,
    requiredCount: ultimate.tokens.length,
  };
}

export function matchPersonalityLabelsV3(
  layer1: Record<number, AxisBranchProfileV3>,
): PersonalityLabelsResult {
  let primary: PersonalityPrimary | null = null;
  const candidates: PersonalityCandidate[] = [];

  for (const rule of PERSONALITY_CORE_LABEL_RULES) {
    const conditions = parseRuleConditions(rule.tokens);
    const requiredCount = conditions.length;
    if (requiredCount === 0) continue;

    if (ruleStrongFull(layer1, conditions)) {
      const entry: PersonalityCandidate = {
        id: rule.id,
        name: rule.name,
        ruleTokens: [...rule.tokens],
        matchedAxes: matchedAxesForRule(conditions),
        matchRatio: 1,
        matchedCount: requiredCount,
        requiredCount,
      };
      if (primary === null) {
        primary = {
          id: entry.id,
          name: entry.name,
          ruleTokens: entry.ruleTokens,
          matchedAxes: entry.matchedAxes,
        };
      } else if (rule.id !== primary.id) {
        candidates.push(entry);
      }
      continue;
    }

    const { matchedCount, requiredCount: req } = ruleWeakStats(
      layer1,
      conditions,
    );
    const matchRatio = req > 0 ? matchedCount / req : 0;
    if (
      matchRatio >= QUESTIONNAIRE_LABEL_MATCH_V3.CANDIDATE_MIN_MATCH_RATIO &&
      req > 0
    ) {
      candidates.push({
        id: rule.id,
        name: rule.name,
        ruleTokens: [...rule.tokens],
        matchedAxes: matchedAxesForRule(conditions),
        matchRatio,
        matchedCount,
        requiredCount: req,
      });
    }
  }

  const filtered = candidates
    .filter((c) => primary == null || c.id !== primary.id)
    .sort((a, b) => b.matchRatio - a.matchRatio || b.matchedCount - a.matchedCount)
    .slice(0, QUESTIONNAIRE_LABEL_MATCH_V3.MAX_CANDIDATE_LABELS);

  const styleLabels = collectStyleLabels(layer1);

  const wouldFallback = primary === null && filtered.length === 0;
  const rareLabel = wouldFallback ? matchRarePersonalityLabelV3(layer1) : null;

  return { primary, candidates: filtered, styleLabels, rareLabel };
}
