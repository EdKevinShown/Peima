import { QUESTIONS, isQuestionProductionReady } from "./data/questions";
import {
  buildAxisBranchProfilesV3,
  collectBranchScoresFromAnswers,
  computeBranchOpportunitiesFromQuestionBank,
  parseTag,
  type AxisBranchProfileV3,
  type BranchMetricV3,
} from "./questionnaire.scorer";
import {
  matchPersonalityLabelsV3,
  type PersonalityLabelsResult,
} from "./questionnaire-personality-labels";
import { QUESTIONNAIRE_LABEL_MATCH_V3 } from "./questionnaire-personality-labels.constants";
import {
  buildOverallExplanation,
  resolveDisplayPrimary,
} from "./questionnaire-overall-explanation";
import { DISPLAY_PRIMARY_FALLBACK } from "./questionnaire-profile-copy.constants";

const BRANCH_LETTERS = ["A", "B", "C", "D", "E"] as const;

function branchMetrics(
  winner: (typeof BRANCH_LETTERS)[number],
): Record<string, BranchMetricV3> {
  const branches: Record<string, BranchMetricV3> = {};
  for (const L of BRANCH_LETTERS) {
    const win = L === winner;
    branches[L] = {
      hits: win ? 40 : 0,
      opportunities: 40,
      rate: win ? 1 : 0,
      adjustedScore: win ? 0.95 : 0.05,
    };
  }
  return branches;
}

function strongAxis(branch: (typeof BRANCH_LETTERS)[number]): AxisBranchProfileV3 {
  return {
    branches: branchMetrics(branch),
    dominantBranch: branch,
    uncertainBranches: [],
  };
}

function uncertainAxis(
  a: (typeof BRANCH_LETTERS)[number],
  b: (typeof BRANCH_LETTERS)[number],
): AxisBranchProfileV3 {
  const branches: Record<string, BranchMetricV3> = {};
  for (const L of BRANCH_LETTERS) {
    const top = L === a || L === b;
    branches[L] = {
      hits: top ? 20 : 0,
      opportunities: 40,
      rate: top ? 0.5 : 0,
      adjustedScore: top ? 0.52 : 0.05,
    };
  }
  const sorted = [a, b].sort();
  return {
    branches,
    dominantBranch: null,
    uncertainBranches: sorted,
  };
}

function baseLayer1(): Record<number, AxisBranchProfileV3> {
  const out: Record<number, AxisBranchProfileV3> = {};
  for (let axis = 1; axis <= 20; axis += 1) {
    out[axis] = strongAxis("D");
  }
  return out;
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

function buildGreedyCanonicalAnswers(
  targets: Record<number, string>,
): { questionKey: string; answerValue: string }[] {
  const answers: { questionKey: string; answerValue: string }[] = [];
  for (const q of QUESTIONS) {
    if (!isQuestionProductionReady(q.key)) continue;
    let bestScore = -Infinity;
    let bestVal = q.options[0]!.value;
    for (const opt of q.options) {
      let score = 0;
      for (const tag of opt.tags) {
        const p = parseTag(tag);
        if (!p) continue;
        const want = targets[p.axisId];
        if (want === undefined) continue;
        if (p.band === want) score += 10;
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

function assertDisplayPrimaryNonEmpty(labels: PersonalityLabelsResult): void {
  const dp = resolveDisplayPrimary(labels);
  expect(dp.id.length).toBeGreaterThan(0);
  expect(dp.name.length).toBeGreaterThan(0);
}

function assertOverallExplanationShape(
  labels: PersonalityLabelsResult,
  uncertain: Record<string, string[]>,
): void {
  const displayPrimary = resolveDisplayPrimary(labels);
  const exp = buildOverallExplanation({
    labels,
    displayPrimary,
    uncertainBranchesByAxis: uncertain,
  });
  expect(typeof exp.title).toBe("string");
  expect(exp.title.length).toBeGreaterThan(0);
  expect(typeof exp.paragraph).toBe("string");
  expect(exp.paragraph.length).toBeGreaterThan(0);
}

describe("questionnaire profile v3 rules", () => {
  it("greedy canonical answers -> layer1 dominant branches + strong primary (clingy_recharger)", () => {
    const targets = { 1: "B", 6: "A", 8: "A", 10: "A" } as const;
    const answers = buildGreedyCanonicalAnswers(targets as Record<number, string>);
    const layer1 = buildAxisBranchProfilesV3(answers);
    expect(layer1[1]?.dominantBranch).toBe("B");
    expect(layer1[1]?.uncertainBranches).toEqual([]);
    expect(layer1[6]?.dominantBranch).toBe("A");
    expect(layer1[6]?.uncertainBranches).toEqual([]);
    expect(layer1[8]?.dominantBranch).toBe("A");
    expect(layer1[8]?.uncertainBranches).toEqual([]);
    expect(layer1[10]?.dominantBranch).toBe("A");
    expect(layer1[10]?.uncertainBranches).toEqual([]);

    const labels = matchPersonalityLabelsV3(layer1);
    expect(labels.primary?.id).toBe("clingy_recharger");
    expect(labels.candidates.every((c) => c.id !== "clingy_recharger")).toBe(true);

    assertDisplayPrimaryNonEmpty(labels);
    const displayPrimary = resolveDisplayPrimary(labels);
    expect(displayPrimary.source).toBe("primary");

    const uncertain = serializeUncertain(layer1);
    assertOverallExplanationShape(labels, uncertain);
    const exp = buildOverallExplanation({
      labels,
      displayPrimary,
      uncertainBranchesByAxis: uncertain,
    });
    expect(exp.title).toContain("粘人型续命机");
  });

  it("no strong primary but >=0.75 weak -> candidates drive displayPrimary", () => {
    const layer1 = baseLayer1();
    layer1[1] = uncertainAxis("A", "B");
    layer1[6] = uncertainAxis("C", "D");
    layer1[8] = uncertainAxis("C", "D");
    layer1[2] = strongAxis("B");

    const labels = matchPersonalityLabelsV3(layer1);
    expect(labels.primary).toBeNull();
    expect(labels.candidates.length).toBeGreaterThan(0);
    expect(labels.candidates.some((c) => c.id === "low_demand_observer")).toBe(true);

    const displayPrimary = resolveDisplayPrimary(labels);
    expect(displayPrimary.source).toBe("candidate");
    expect(displayPrimary.id).toBe("low_demand_observer");

    assertDisplayPrimaryNonEmpty(labels);
    const uncertain = serializeUncertain(layer1);
    assertOverallExplanationShape(labels, uncertain);
    const exp = buildOverallExplanation({
      labels,
      displayPrimary,
      uncertainBranchesByAxis: uncertain,
    });
    expect(exp.title).toContain(displayPrimary.name);
  });

  it("many style rules may match but styleLabels capped at MAX_STYLE_LABELS (3)", () => {
    const layer1 = baseLayer1();
    layer1[2] = strongAxis("A");
    layer1[3] = strongAxis("A");
    layer1[4] = strongAxis("A");
    layer1[15] = strongAxis("A");
    layer1[20] = strongAxis("B");

    const labels = matchPersonalityLabelsV3(layer1);
    expect(labels.styleLabels.length).toBe(QUESTIONNAIRE_LABEL_MATCH_V3.MAX_STYLE_LABELS);
    expect(labels.styleLabels.map((s) => s.id)).toEqual([
      "logic_debate_machine",
      "confrontation_warrior",
      "emotional_nuke",
    ]);

    assertDisplayPrimaryNonEmpty(labels);
    const uncertain = serializeUncertain(layer1);
    assertOverallExplanationShape(labels, uncertain);
  });

  it("uncertainBranches on any axis -> paragraph includes uncertainty closing", () => {
    const layer1 = baseLayer1();
    layer1[1] = uncertainAxis("A", "B");
    layer1[6] = uncertainAxis("C", "D");
    layer1[8] = uncertainAxis("C", "D");
    layer1[2] = strongAxis("B");
    layer1[7] = uncertainAxis("A", "B");

    const labels = matchPersonalityLabelsV3(layer1);
    const displayPrimary = resolveDisplayPrimary(labels);
    const uncertain = serializeUncertain(layer1);
    expect(Object.values(uncertain).some((u) => u.length > 0)).toBe(true);

    const exp = buildOverallExplanation({
      labels,
      displayPrimary,
      uncertainBranchesByAxis: uncertain,
    });
    expect(exp.paragraph).toContain(
      "部分维度上的分支判断仍接近并列，以上归纳更适合作为阶段性参考，不必视为唯一结论。",
    );
  });

  it("fallback displayPrimary when no primary and no candidates", () => {
    const labels: PersonalityLabelsResult = {
      primary: null,
      candidates: [],
      styleLabels: [],
      rareLabel: null,
    };
    const displayPrimary = resolveDisplayPrimary(labels);
    expect(displayPrimary.source).toBe("fallback");
    expect(displayPrimary.id).toBe(DISPLAY_PRIMARY_FALLBACK.id);
    expect(displayPrimary.name).toBe(DISPLAY_PRIMARY_FALLBACK.name);
    expect(displayPrimary.id.length).toBeGreaterThan(0);
    expect(displayPrimary.name.length).toBeGreaterThan(0);

    const uncertain: Record<string, string[]> = {};
    for (let a = 1; a <= 20; a += 1) uncertain[String(a)] = [];

    const exp = buildOverallExplanation({
      labels,
      displayPrimary,
      uncertainBranchesByAxis: uncertain,
    });
    expect(exp.title.trim().length).toBeGreaterThan(0);
    expect(exp.paragraph.trim().length).toBeGreaterThan(0);
    expect(exp.paragraph).not.toMatch(/undefined/i);
    expect(exp.paragraph).not.toMatch(/\bnull\b/i);
  });

  it("all-D dispersed profile -> rare hidden displayPrimary instead of fallback", () => {
    const layer1 = baseLayer1();
    const labels = matchPersonalityLabelsV3(layer1);
    expect(labels.primary).toBeNull();
    expect(labels.candidates).toHaveLength(0);
    expect(labels.rareLabel).not.toBeNull();
    expect(labels.rareLabel?.id).toBe("mist_boundary");

    const emptyManual: PersonalityLabelsResult = {
      primary: null,
      candidates: [],
      styleLabels: [],
      rareLabel: matchPersonalityLabelsV3(layer1).rareLabel,
    };
    expect(resolveDisplayPrimary(emptyManual).source).not.toBe("fallback");

    const displayPrimary = resolveDisplayPrimary(labels);
    expect(displayPrimary.source).toBe("rare");
    expect(displayPrimary.name).toBe("雾里边界人");

    const exp = buildOverallExplanation({
      labels,
      displayPrimary,
      uncertainBranchesByAxis: serializeUncertain(layer1),
    });
    expect(exp.title).toContain("雾里边界人");
    expect(exp.paragraph).toContain("若即若离");
    expect(exp.paragraph).not.toContain(DISPLAY_PRIMARY_FALLBACK.paragraphLead);
  });

  it("layer1 dominant follows adjustedScore (opportunities-aware), not raw hits", () => {
    const opps = computeBranchOpportunitiesFromQuestionBank();
    const canonical = QUESTIONS.filter((q) => isQuestionProductionReady(q.key));

    let witness: {
      axis: number;
      answers: { questionKey: string; answerValue: string }[];
      highHitsBranch: string;
      dominantBranch: string;
    } | null = null;

    outer: for (let axis = 1; axis <= 20; axis += 1) {
      const touching = canonical.filter((q) =>
        q.options.some((o) =>
          o.tags.some((t) => {
            const p = parseTag(t);
            return p?.axisId === axis;
          }),
        ),
      );
      if (touching.length < 5) continue;
      const picks = touching.slice(0, 5);
      const k = picks.length;
      const total = 4 ** k;
      for (let mask = 0; mask < total; mask += 1) {
        const answers: { questionKey: string; answerValue: string }[] = [];
        let x = mask;
        for (let i = 0; i < k; i += 1) {
          const qi = x % 4;
          x = Math.floor(x / 4);
          const q = picks[i]!;
          answers.push({
            questionKey: q.key,
            answerValue: (["A", "B", "C", "D"] as const)[qi]!,
          });
        }
        const layer = buildAxisBranchProfilesV3(answers);
        const p = layer[axis]!;
        const dom = p.dominantBranch;
        if (dom == null) continue;

        let bestHits = -1;
        let bestHitsBranch = "";
        for (const L of BRANCH_LETTERS) {
          const o = opps[axis]![L];
          if (o <= 0) continue;
          const h = p.branches[L].hits;
          if (h > bestHits) {
            bestHits = h;
            bestHitsBranch = L;
          }
        }
        if (bestHitsBranch === "") continue;

        const adjDom = p.branches[dom].adjustedScore;
        const adjHitsLeader = p.branches[bestHitsBranch].adjustedScore;
        if (
          bestHitsBranch !== dom &&
          p.branches[bestHitsBranch].hits > p.branches[dom].hits &&
          adjDom != null &&
          adjHitsLeader != null &&
          adjDom > adjHitsLeader
        ) {
          witness = {
            axis,
            answers,
            highHitsBranch: bestHitsBranch,
            dominantBranch: dom,
          };
          break outer;
        }
      }
    }

    expect(witness).not.toBeNull();
    const w = witness!;
    const layer = buildAxisBranchProfilesV3(w.answers);
    const prof = layer[w.axis]!;
    expect(prof.dominantBranch).toBe(w.dominantBranch);
    expect(prof.branches[w.highHitsBranch].hits).toBeGreaterThan(
      prof.branches[w.dominantBranch].hits,
    );
    expect(prof.branches[w.dominantBranch].adjustedScore).toBeGreaterThan(
      prof.branches[w.highHitsBranch].adjustedScore!,
    );
    expect(prof.branches[w.dominantBranch].opportunities).toBe(
      opps[w.axis]![w.dominantBranch as "A" | "B" | "C" | "D" | "E"],
    );

    const hitsRow = collectBranchScoresFromAnswers(w.answers);
    const oA = opps[w.axis]![w.highHitsBranch as "A" | "B" | "C" | "D" | "E"];
    const oB = opps[w.axis]![w.dominantBranch as "A" | "B" | "C" | "D" | "E"];
    const hA = hitsRow[w.axis]![w.highHitsBranch as "A" | "B" | "C" | "D" | "E"] ?? 0;
    const hB = hitsRow[w.axis]![w.dominantBranch as "A" | "B" | "C" | "D" | "E"] ?? 0;
    expect(hA).toBeGreaterThan(hB);
    expect(oA).toBeGreaterThan(oB);
    const adjA = (hA + 1) / (oA + 2);
    const adjB = (hB + 1) / (oB + 2);
    expect(adjB).toBeGreaterThan(adjA);
  });
});
