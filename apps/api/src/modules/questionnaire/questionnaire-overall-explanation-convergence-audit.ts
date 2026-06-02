import { QUESTIONS, isQuestionProductionReady } from "./data/questions";
import { matchPersonalityLabelsV3 } from "./questionnaire-personality-labels";
import type { OverallExplanation } from "./questionnaire-overall-explanation";
import {
  buildOverallExplanation,
  resolveDisplayPrimary,
} from "./questionnaire-overall-explanation";
import { DISPLAY_PRIMARY_FALLBACK } from "./questionnaire-profile-copy.constants";
import {
  buildAxisBranchProfilesV3,
  parseTag,
  type AxisBranchProfileV3,
} from "./questionnaire.scorer";

export type AnswerInput = { questionKey: string; answerValue: string };

export type OverallExplanationAuditRow = {
  answerIndex: number;
  answerFingerprint: string;
  displayPrimaryId: string;
  displayPrimarySource: string;
  explanationFingerprint: string;
  title: string;
  paragraph: string;
  primaryLabelId: string | null;
  uncertainAxisCount: number;
};

export type OverallExplanationConvergenceReport = {
  mode: "exhaustive" | "random" | "greedy-targets";
  canonicalQuestionCount: number;
  optionsPerQuestion: number[];
  theoreticalCombinationCount: string;
  sampled: number;
  cappedAt: number | null;
  invalidCount: number;
  uniqueExplanationFingerprints: number;
  uniqueDisplayPrimaryIds: number;
  uniqueTitleCount: number;
  compressionRatio: number;
  /** displayPrimary 为 fallback（标题「尚未收敛到命名标签」） */
  nonConvergentFallbackCount: number;
  nonConvergentFallbackRatio: number;
  /** 至少一轴存在 uncertainBranches */
  hasUncertainAxisCount: number;
  hasUncertainAxisRatio: number;
  /** sampled / unique fingerprints — 越高说明越多答案坍缩到同一解释 */
  invalidSamples: Array<{ answerIndex: number; reason: string }>;
  instabilitySamples: Array<{
    answerIndex: number;
    displayPrimaryId: string;
    fingerprints: string[];
  }>;
  topExplanationBuckets: Array<{
    explanationFingerprint: string;
    count: number;
    exampleTitle: string;
  }>;
};

const CANONICAL_QUESTIONS = QUESTIONS.filter((q) =>
  isQuestionProductionReady(q.key),
);

export function getCanonicalAnswerCombinationCount(): bigint {
  let total = 1n;
  for (const q of CANONICAL_QUESTIONS) {
    total *= BigInt(q.options.length);
  }
  return total;
}

function serializeUncertain(
  layer1: Record<number, AxisBranchProfileV3>,
): Record<string, string[]> {
  const o: Record<string, string[]> = {};
  for (let axis = 1; axis <= 20; axis += 1) {
    o[String(axis)] = [...(layer1[axis]?.uncertainBranches ?? [])];
  }
  return o;
}

export function buildOverallExplanationFromAnswers(
  answers: ReadonlyArray<AnswerInput>,
): {
  overallExplanation: OverallExplanation;
  displayPrimaryId: string;
  displayPrimarySource: string;
  primaryLabelId: string | null;
  uncertainAxisCount: number;
} {
  const layer1 = buildAxisBranchProfilesV3(answers);
  const labels = matchPersonalityLabelsV3(layer1);
  const displayPrimary = resolveDisplayPrimary(labels);
  const uncertainBranchesByAxis = serializeUncertain(layer1);
  const overallExplanation = buildOverallExplanation({
    labels,
    displayPrimary,
    uncertainBranchesByAxis,
  });
  const uncertainAxisCount = Object.values(uncertainBranchesByAxis).filter(
    (b) => b.length > 0,
  ).length;
  return {
    overallExplanation,
    displayPrimaryId: displayPrimary.id,
    displayPrimarySource: displayPrimary.source,
    primaryLabelId: labels.primary?.id ?? null,
    uncertainAxisCount,
  };
}

export function fingerprintAnswers(answers: ReadonlyArray<AnswerInput>): string {
  const sorted = [...answers].sort((a, b) =>
    a.questionKey.localeCompare(b.questionKey),
  );
  return sorted.map((a) => `${a.questionKey}=${a.answerValue}`).join("|");
}

export function fingerprintOverallExplanation(
  exp: OverallExplanation,
): string {
  return `${exp.title}\n---\n${exp.paragraph}`;
}

export function isNonConvergentOverallExplanation(input: {
  displayPrimarySource: string;
  uncertainAxisCount: number;
}): boolean {
  return (
    input.displayPrimarySource === "fallback" ||
    input.uncertainAxisCount > 0
  );
}

export function isFallbackNonConvergentTitle(title: string): boolean {
  return title === DISPLAY_PRIMARY_FALLBACK.titleLine;
}

export function validateOverallExplanation(exp: OverallExplanation): string | null {
  if (!exp.title || exp.title.trim().length === 0) {
    return "empty_title";
  }
  if (!exp.paragraph || exp.paragraph.trim().length === 0) {
    return "empty_paragraph";
  }
  if (/undefined/i.test(exp.title) || /undefined/i.test(exp.paragraph)) {
    return "contains_undefined";
  }
  if (/\bnull\b/i.test(exp.title) || /\bnull\b/i.test(exp.paragraph)) {
    return "contains_null";
  }
  return null;
}

export function buildRandomCanonicalAnswers(rng: () => number): AnswerInput[] {
  return CANONICAL_QUESTIONS.map((q) => {
    const idx = Math.floor(rng() * q.options.length);
    const opt = q.options[idx] ?? q.options[0]!;
    return { questionKey: q.key, answerValue: opt.value };
  });
}

/** Mixed-radix iterator over all canonical answer vectors (4^30 — use with cap). */
export function* iterateExhaustiveCanonicalAnswers(): Generator<AnswerInput[]> {
  const n = CANONICAL_QUESTIONS.length;
  if (n === 0) {
    yield [];
    return;
  }
  const indices = new Array<number>(n).fill(0);
  const limits = CANONICAL_QUESTIONS.map((q) => q.options.length);

  while (true) {
    yield CANONICAL_QUESTIONS.map((q, i) => ({
      questionKey: q.key,
      answerValue: q.options[indices[i]!]!.value,
    }));

    let carry = 1;
    for (let pos = n - 1; pos >= 0 && carry > 0; pos -= 1) {
      indices[pos]! += 1;
      if (indices[pos]! < limits[pos]!) {
        carry = 0;
        break;
      }
      indices[pos] = 0;
    }
    if (carry > 0) {
      break;
    }
  }
}

const GREEDY_BRANCHES = ["A", "B", "C", "D", "E"] as const;

/** Greedy per-axis target maps (5^20 space) — approximates reachable profile corners. */
export function buildGreedyAnswersForAxisTargets(
  targets: Record<number, string>,
): AnswerInput[] {
  const answers: AnswerInput[] = [];
  for (const q of CANONICAL_QUESTIONS) {
    let bestScore = -Infinity;
    let bestVal = q.options[0]!.value;
    for (const opt of q.options) {
      let score = 0;
      for (const tag of opt.tags) {
        const p = parseTag(tag);
        if (!p) continue;
        const want = targets[p.axisId];
        const band = p.band;
        if (want === undefined) continue;
        if (band === want) score += 10;
        else score -= 50;
      }
      if (score > bestScore) {
        bestScore = score;
        bestVal = opt.value;
      }
    }
    answers.push({ questionKey: q.key, answerValue: bestVal });
  }
  return answers;
}

export function* iterateGreedyTargetCombinations(
  axisCount = 20,
): Generator<AnswerInput[]> {
  const n = GREEDY_BRANCHES.length;
  const indices = new Array<number>(axisCount).fill(0);
  while (true) {
    const targets: Record<number, string> = {};
    for (let axis = 1; axis <= axisCount; axis += 1) {
      targets[axis] = GREEDY_BRANCHES[indices[axis - 1]!]!;
    }
    yield buildGreedyAnswersForAxisTargets(targets);

    let carry = 1;
    for (let pos = axisCount - 1; pos >= 0 && carry > 0; pos -= 1) {
      indices[pos]! += 1;
      if (indices[pos]! < n) {
        carry = 0;
        break;
      }
      indices[pos] = 0;
    }
    if (carry > 0) {
      break;
    }
  }
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function auditOverallExplanationConvergence(opts: {
  mode: "exhaustive" | "random" | "greedy-targets";
  maxSamples?: number;
  randomSeed?: number;
  randomSamples?: number;
}): OverallExplanationConvergenceReport {
  const maxSamples = opts.maxSamples ?? Number.POSITIVE_INFINITY;
  const theoretical = getCanonicalAnswerCombinationCount();
  const optionsPerQuestion = CANONICAL_QUESTIONS.map((q) => q.options.length);

  const explanationBuckets = new Map<
    string,
    { count: number; exampleTitle: string }
  >();
  const displayPrimaryByExplanation = new Map<string, Set<string>>();
  const invalidSamples: Array<{ answerIndex: number; reason: string }> = [];
  const instabilitySamples: OverallExplanationConvergenceReport["instabilitySamples"] =
    [];

  let sampled = 0;
  let invalidCount = 0;
  let nonConvergentFallbackCount = 0;
  let hasUncertainAxisCount = 0;
  let cappedAt: number | null = null;

  const rng =
    opts.mode === "random"
      ? mulberry32(opts.randomSeed ?? 42)
      : () => 0;

  const iter: Generator<AnswerInput[]> =
    opts.mode === "exhaustive"
      ? iterateExhaustiveCanonicalAnswers()
      : opts.mode === "greedy-targets"
        ? iterateGreedyTargetCombinations()
        : (function* () {
            const n = opts.randomSamples ?? 20_000;
            for (let i = 0; i < n; i += 1) {
              yield buildRandomCanonicalAnswers(rng);
            }
          })();

  for (const answers of iter) {
    if (sampled >= maxSamples) {
      cappedAt = maxSamples;
      break;
    }
    const built = buildOverallExplanationFromAnswers(answers);
    const exp = built.overallExplanation;
    const invalidReason = validateOverallExplanation(exp);
    if (invalidReason) {
      invalidCount += 1;
      if (invalidSamples.length < 20) {
        invalidSamples.push({ answerIndex: sampled, reason: invalidReason });
      }
      sampled += 1;
      continue;
    }

    const expFp = fingerprintOverallExplanation(exp);
    const prev = explanationBuckets.get(expFp);
    explanationBuckets.set(expFp, {
      count: (prev?.count ?? 0) + 1,
      exampleTitle: prev?.exampleTitle ?? exp.title,
    });

    let dpSet = displayPrimaryByExplanation.get(expFp);
    if (!dpSet) {
      dpSet = new Set<string>();
      displayPrimaryByExplanation.set(expFp, dpSet);
    }
    dpSet.add(built.displayPrimaryId);
    if (dpSet.size > 1 && instabilitySamples.length < 20) {
      instabilitySamples.push({
        answerIndex: sampled,
        displayPrimaryId: built.displayPrimaryId,
        fingerprints: [...dpSet],
      });
    }

    if (built.displayPrimarySource === "fallback") {
      nonConvergentFallbackCount += 1;
    }
    if (built.uncertainAxisCount > 0) {
      hasUncertainAxisCount += 1;
    }

    sampled += 1;
  }

  const uniqueExplanationFingerprints = explanationBuckets.size;
  const uniqueDisplayPrimaryIds = new Set(
    [...explanationBuckets.keys()].flatMap(
      (fp) => [...(displayPrimaryByExplanation.get(fp) ?? [])],
    ),
  ).size;
  const uniqueTitleCount = new Set(
    [...explanationBuckets.values()].map((b) => b.exampleTitle),
  ).size;

  const topExplanationBuckets = [...explanationBuckets.entries()]
    .map(([explanationFingerprint, v]) => ({
      explanationFingerprint,
      count: v.count,
      exampleTitle: v.exampleTitle,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  return {
    mode: opts.mode,
    canonicalQuestionCount: CANONICAL_QUESTIONS.length,
    optionsPerQuestion,
    theoreticalCombinationCount: theoretical.toString(),
    sampled,
    cappedAt,
    invalidCount,
    uniqueExplanationFingerprints,
    uniqueDisplayPrimaryIds,
    uniqueTitleCount,
    compressionRatio:
      uniqueExplanationFingerprints > 0
        ? sampled / uniqueExplanationFingerprints
        : 0,
    nonConvergentFallbackCount,
    nonConvergentFallbackRatio:
      sampled > 0 ? nonConvergentFallbackCount / sampled : 0,
    hasUncertainAxisCount,
    hasUncertainAxisRatio: sampled > 0 ? hasUncertainAxisCount / sampled : 0,
    invalidSamples,
    instabilitySamples,
    topExplanationBuckets,
  };
}

export function formatConvergenceReport(
  report: OverallExplanationConvergenceReport,
): string {
  const lines: string[] = [
    `mode=${report.mode}`,
    `canonical_questions=${report.canonicalQuestionCount}`,
    `theoretical_combinations=${report.theoreticalCombinationCount}`,
    `sampled=${report.sampled}${report.cappedAt != null ? ` (capped at ${report.cappedAt})` : ""}`,
    `invalid=${report.invalidCount}`,
    `unique_overall_explanations=${report.uniqueExplanationFingerprints}`,
    `unique_display_primary_ids=${report.uniqueDisplayPrimaryIds}`,
    `unique_titles=${report.uniqueTitleCount}`,
    `compression_ratio=${report.compressionRatio.toFixed(2)} (answers per explanation fingerprint)`,
    `non_convergent_fallback=${report.nonConvergentFallbackCount} (${(report.nonConvergentFallbackRatio * 100).toFixed(2)}%)`,
    `has_uncertain_axis=${report.hasUncertainAxisCount} (${(report.hasUncertainAxisRatio * 100).toFixed(2)}%)`,
    "",
    "判定提示：",
    "- invalid > 0 → 不合格（空文案 / undefined / null）",
    "- 同一 explanation 对应多个 displayPrimaryId → 不稳定（instability）",
    "- non_convergent_fallback → 主标签未命中且未命中隐藏款，标题为「尚未收敛到命名标签」（应为 0）",
    "- has_uncertain_axis → 至少一轴分支不确定（paragraph 会带不确定性收尾）",
    `- unique_overall_explanations 接近 sampled → 文案指纹几乎不重复（压缩比≈1）`,
    "",
  ];
  if (report.invalidSamples.length > 0) {
    lines.push("invalid_samples (up to 20):");
    for (const s of report.invalidSamples) {
      lines.push(`  #${s.answerIndex}: ${s.reason}`);
    }
    lines.push("");
  }
  if (report.instabilitySamples.length > 0) {
    lines.push("instability_samples (up to 20):");
    for (const s of report.instabilitySamples) {
      lines.push(
        `  #${s.answerIndex}: displayPrimaryIds=${s.fingerprints.join(",")}`,
      );
    }
    lines.push("");
  }
  lines.push("top_explanation_buckets:");
  for (const b of report.topExplanationBuckets) {
    lines.push(
      `  count=${b.count} title=${JSON.stringify(b.exampleTitle.slice(0, 60))}`,
    );
  }
  return lines.join("\n");
}
