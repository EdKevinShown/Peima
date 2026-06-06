import type { UserProfile } from "@peima/database";
import type { QuestionnaireProfileView } from "../src/modules/questionnaire/questionnaire.service";
import { buildMatchReviewStaticSummary } from "../src/modules/match-review-ai/match-review-static-summary";

function emptyDominants(): Record<string, string | null> {
  const o: Record<string, string | null> = {};
  for (let i = 1; i <= 20; i += 1) o[String(i)] = null;
  return o;
}

function baseProfileView(
  overrides: Partial<QuestionnaireProfileView> & {
    profile: UserProfile;
  },
): QuestionnaireProfileView {
  const dominants = { ...emptyDominants(), ...overrides.dominantBranches };
  return {
    profile: overrides.profile,
    dimensionBranchProfiles: overrides.dimensionBranchProfiles ?? {},
    byDimensionBranchScores: overrides.byDimensionBranchScores ?? {},
    dominantBranches: dominants,
    uncertainBranchesByAxis: overrides.uncertainBranchesByAxis ?? {},
    labels: overrides.labels ?? {
      primary: null,
      candidates: [],
      styleLabels: [],
      rareLabel: null,
    },
    displayPrimary: overrides.displayPrimary ?? {
      id: "x",
      name: "测试主标签",
      ruleTokens: [],
      matchedAxes: [],
      source: "fallback",
    },
    overallExplanation: overrides.overallExplanation ?? {
      title: "T",
      paragraph: "P",
    },
  };
}

describe("buildMatchReviewStaticSummary", () => {
  it("returns stable structure and score in 0–100", () => {
    const profileRow = {
      attachmentStyle: 0.7,
      emotionalExpression: 0.7,
      communicationStyle: 0.7,
      conflictHandling: 0.7,
      loveLanguage: 0.7,
      securityNeed: 0.7,
      controlNeed: 0.7,
      independence: 0.7,
      loyaltyView: 0.7,
      jealousyTendency: 0.7,
      moneyAttitude: 0.7,
      careerPriority: 0.7,
      lifePace: 0.7,
      socialNeed: 0.7,
      emotionalStability: 0.7,
      sexualValues: 0.7,
      familyView: 0.7,
      marriageExpectation: 0.7,
      childrenIntent: 0.7,
      riskPreference: 0.7,
      confidence: 0.9,
    } as unknown as UserProfile;

    const dom = emptyDominants();
    dom["1"] = "A";
    dom["2"] = "A";

    const v = baseProfileView({
      profile: profileRow,
      dominantBranches: dom,
    });
    const c = baseProfileView({
      profile: profileRow,
      dominantBranches: dom,
    });

    const out = buildMatchReviewStaticSummary(v, c);
    expect(out.reviewStaticScore).toBeGreaterThanOrEqual(0);
    expect(out.reviewStaticScore).toBeLessThanOrEqual(100);
    expect(out.staticSummary.majorFits.length).toBeGreaterThan(0);
    expect(out.staticSummary.majorRisks.length).toBeGreaterThan(0);
    expect(out.staticSummary.labelFitSummary).toContain("主展示标签");
  });
});
