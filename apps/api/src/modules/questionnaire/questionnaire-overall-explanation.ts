import { PERSONALITY_CORE_LABEL_RULES } from "./questionnaire-personality-labels.constants";
import type {
  DisplayPrimary,
  PersonalityCandidate,
  PersonalityLabelsResult,
  PersonalityStyleLabel,
} from "./questionnaire-personality-labels";
import {
  DISPLAY_PRIMARY_FALLBACK,
  PRIMARY_LABEL_COPY,
  STYLE_LABEL_COPY,
} from "./questionnaire-profile-copy.constants";

export type OverallExplanation = {
  title: string;
  paragraph: string;
};

export type BuildOverallExplanationInput = {
  labels: PersonalityLabelsResult;
  displayPrimary: DisplayPrimary;
  uncertainBranchesByAxis: Record<string, string[]>;
};

function coreRuleIndex(id: string): number {
  const i = PERSONALITY_CORE_LABEL_RULES.findIndex((r) => r.id === id);
  return i === -1 ? 10_000 : i;
}

function compareCandidatesForDisplay(
  a: PersonalityCandidate,
  b: PersonalityCandidate,
): number {
  if (b.matchRatio !== a.matchRatio) return b.matchRatio - a.matchRatio;
  if (b.matchedCount !== a.matchedCount) return b.matchedCount - a.matchedCount;
  if (a.requiredCount !== b.requiredCount) return a.requiredCount - b.requiredCount;
  return coreRuleIndex(a.id) - coreRuleIndex(b.id);
}

export function resolveDisplayPrimary(
  labels: PersonalityLabelsResult,
): DisplayPrimary {
  const { primary, candidates } = labels;
  if (primary) {
    return {
      id: primary.id,
      name: primary.name,
      ruleTokens: [...primary.ruleTokens],
      matchedAxes: [...primary.matchedAxes],
      source: "primary",
    };
  }
  const sorted = [...candidates].sort(compareCandidatesForDisplay);
  const top = sorted[0];
  if (top) {
    return {
      id: top.id,
      name: top.name,
      ruleTokens: [...top.ruleTokens],
      matchedAxes: [...top.matchedAxes],
      source: "candidate",
    };
  }
  return {
    id: DISPLAY_PRIMARY_FALLBACK.id,
    name: DISPLAY_PRIMARY_FALLBACK.name,
    ruleTokens: [],
    matchedAxes: [],
    source: "fallback",
  };
}

export function buildTitle(displayPrimary: DisplayPrimary): string {
  if (displayPrimary.source === "fallback") {
    return DISPLAY_PRIMARY_FALLBACK.titleLine;
  }
  if (displayPrimary.source === "candidate") {
    return `整体画像更接近「${displayPrimary.name}」所描述的关系人格取向。`;
  }
  const row = PRIMARY_LABEL_COPY[displayPrimary.id];
  return row?.title?.trim() || `整体画像偏向${displayPrimary.name}`;
}

function hasUncertainty(
  uncertainBranchesByAxis: Record<string, string[]>,
): boolean {
  return Object.values(uncertainBranchesByAxis).some((b) => b.length > 0);
}

function segmentOverall(displayPrimary: DisplayPrimary): string {
  if (displayPrimary.source === "fallback") {
    return DISPLAY_PRIMARY_FALLBACK.paragraphLead;
  }
  const row = PRIMARY_LABEL_COPY[displayPrimary.id];
  return (
    row?.summary?.trim() ||
    `整体上看，你更贴近「${displayPrimary.name}」这一人格取向在关系里常见的那类反应方式。`
  );
}

function segmentCandidates(
  displayPrimary: DisplayPrimary,
  candidates: PersonalityCandidate[],
): string {
  if (displayPrimary.source === "fallback" || candidates.length === 0) {
    return "";
  }
  const others = candidates
    .filter((c) => c.id !== displayPrimary.id)
    .sort(compareCandidatesForDisplay)
    .slice(0, 2);
  if (others.length === 0) return "";
  const names = others.map((o) => o.name).join("、");
  return `与此同时，画像在${names}等方向上也能看到一些呼应，说明关系侧写仍带有一点交叉感，而不是单面刻板。`;
}

function segmentStyles(styles: PersonalityStyleLabel[]): string {
  if (styles.length === 0) return "";
  const cues = styles
    .map((s) => STYLE_LABEL_COPY[s.id]?.trim())
    .filter((t): t is string => Boolean(t && t.length > 0))
    .map((t) => t.replace(/。$/u, ""));
  if (cues.length === 0) return "";
  return `在具体相处里，${cues.join("；")}。`;
}

function segmentUncertainty(
  uncertainBranchesByAxis: Record<string, string[]>,
): string {
  if (!hasUncertainty(uncertainBranchesByAxis)) return "";
  return "部分维度上的分支判断仍接近并列，以上归纳更适合作为阶段性参考，不必视为唯一结论。";
}

export function buildParagraph(
  displayPrimary: DisplayPrimary,
  labels: PersonalityLabelsResult,
  uncertainBranchesByAxis: Record<string, string[]>,
): string {
  const s1 = segmentOverall(displayPrimary);
  const s2 = segmentCandidates(displayPrimary, labels.candidates);
  const s3 = segmentStyles(labels.styleLabels);
  const s4 = segmentUncertainty(uncertainBranchesByAxis);
  return [s1, s2, s3, s4].filter((x) => x.length > 0).join("");
}

export function buildOverallExplanation(
  input: BuildOverallExplanationInput,
): OverallExplanation {
  const { labels, displayPrimary, uncertainBranchesByAxis } = input;
  return {
    title: buildTitle(displayPrimary),
    paragraph: buildParagraph(displayPrimary, labels, uncertainBranchesByAxis),
  };
}
