import type { UserProfile } from "@peima/database";
import type { QuestionnaireProfileView } from "../questionnaire/questionnaire.service";
import type { MatchReviewStaticSummaryPayload } from "../match-review-ai/match-review-ai.types";

type PairNum = { viewer: number | null; candidate: number | null };

function readAxis(p: UserProfile, key: keyof UserProfile): number | null {
  const v = p[key];
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.round(v * 100) / 100;
}

function pairFor(
  viewer: UserProfile,
  candidate: UserProfile,
  key: keyof UserProfile,
): PairNum | null {
  const a = readAxis(viewer, key);
  const b = readAxis(candidate, key);
  if (a == null && b == null) return null;
  return { viewer: a, candidate: b };
}

/**
 * Structured, non-PII context for LLM simulation (axis scalars + fit/risk blurbs).
 * Omits raw DB blobs, display names, and open-ended questionnaire answers.
 */
export function buildAiSimulationStaticContext(input: {
  reviewStaticScore: number;
  staticSummary: MatchReviewStaticSummaryPayload;
  viewer: QuestionnaireProfileView;
  candidate: QuestionnaireProfileView;
}): Record<string, unknown> {
  const vp = input.viewer.profile;
  const cp = input.candidate.profile;

  const majorFits = input.staticSummary.majorFits.slice(0, 5);
  const majorRisks = input.staticSummary.majorRisks.slice(0, 5);

  const axes: Record<string, PairNum> = {};
  const axisKeys: (keyof UserProfile)[] = [
    "communicationStyle",
    "attachmentStyle",
    "securityNeed",
    "emotionalStability",
    "lifePace",
    "conflictHandling",
    "marriageExpectation",
    "childrenIntent",
    "riskPreference",
  ];
  for (const k of axisKeys) {
    const pair = pairFor(vp, cp, k);
    if (pair) axes[String(k)] = pair;
  }

  const me = pairFor(vp, cp, "marriageExpectation");
  const ci = pairFor(vp, cp, "childrenIntent");
  let relationshipGoalHint: string | undefined;
  if (me || ci) {
    const parts: string[] = [];
    if (me && me.viewer != null && me.candidate != null) {
      const gap = Math.abs(me.viewer - me.candidate);
      parts.push(
        gap >= 4
          ? "婚姻期待标量差异偏大，相处时需对齐长期预期。"
          : "婚姻期待标量接近或中等差异。",
      );
    }
    if (ci && ci.viewer != null && ci.candidate != null) {
      const gap = Math.abs(ci.viewer - ci.candidate);
      parts.push(
        gap >= 4 ? "生育意愿相关标量差异偏大。" : "生育意愿相关标量可继续温和对齐。",
      );
    }
    relationshipGoalHint = parts.join("");
  }

  return {
    reviewStaticScore: input.reviewStaticScore,
    majorFits,
    majorRisks,
    axes,
    ...(relationshipGoalHint ? { relationshipGoalHint } : {}),
  };
}
