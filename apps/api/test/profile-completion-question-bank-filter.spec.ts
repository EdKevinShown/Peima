import { computeBranchOpportunitiesFromQuestionBank } from "../src/modules/questionnaire/questionnaire.scorer";
import {
  filterDimensionBranchHintsToQuestionBank,
  parseP6DimensionBranchHintsProposedPatch,
} from "../src/modules/profile-suggestion/parse-p6-dimension-branch-hints-patch";
import { P6_8_DIMENSION_BRANCH_HINTS_PATCH_KIND } from "../src/modules/questionnaire/dimension-branch-chat-hints.constants";

const LETTERS = ["A", "B", "C", "D", "E"] as const;

function findIllegalAxisBranch(): { axisId: number; branch: string } {
  const opps = computeBranchOpportunitiesFromQuestionBank();
  for (let axisId = 1; axisId <= 20; axisId += 1) {
    for (const b of LETTERS) {
      if ((opps[axisId]?.[b] ?? 0) <= 0) {
        return { axisId, branch: b };
      }
    }
  }
  throw new Error("expected at least one axis-branch with zero bank opportunities");
}

function findLegalAxisBranch(): { axisId: number; branch: string } {
  const opps = computeBranchOpportunitiesFromQuestionBank();
  for (let axisId = 1; axisId <= 20; axisId += 1) {
    for (const b of LETTERS) {
      if ((opps[axisId]?.[b] ?? 0) > 0) {
        return { axisId, branch: b };
      }
    }
  }
  throw new Error("expected at least one legal axis-branch");
}

describe("filterDimensionBranchHintsToQuestionBank (P6.8.x)", () => {
  it("drops items with no question-bank opportunity for that axis-branch", () => {
    const bad = findIllegalAxisBranch();
    const filtered = filterDimensionBranchHintsToQuestionBank([
      { axisId: bad.axisId, branch: bad.branch },
    ]);
    expect(filtered).toEqual([]);
  });

  it("keeps only legal items when mixed legal and illegal", () => {
    const bad = findIllegalAxisBranch();
    const good = findLegalAxisBranch();
    const filtered = filterDimensionBranchHintsToQuestionBank([
      { axisId: bad.axisId, branch: bad.branch },
      { axisId: good.axisId, branch: good.branch },
    ]);
    expect(filtered).toEqual([{ axisId: good.axisId, branch: good.branch }]);
    const parsed = parseP6DimensionBranchHintsProposedPatch({
      kind: P6_8_DIMENSION_BRANCH_HINTS_PATCH_KIND,
      schemaVersion: 1,
      items: filtered,
    });
    expect(parsed).toEqual([{ axisId: good.axisId, branch: good.branch }]);
  });

  it("when same axis appears twice, keeps first legal row in input order", () => {
    const bad = findIllegalAxisBranch();
    const opps = computeBranchOpportunitiesFromQuestionBank();
    const lettersWithOpp = LETTERS.filter(
      (b) => (opps[bad.axisId]?.[b] ?? 0) > 0,
    );
    if (lettersWithOpp.length === 0) {
      throw new Error("axis with illegal branch should still have some legal branch");
    }
    const goodBranch = lettersWithOpp[0]!;
    const filtered = filterDimensionBranchHintsToQuestionBank([
      { axisId: bad.axisId, branch: bad.branch },
      { axisId: bad.axisId, branch: goodBranch },
    ]);
    expect(filtered).toEqual([{ axisId: bad.axisId, branch: goodBranch }]);
  });

  it("parse without pre-filter still throws on illegal bank branch", () => {
    const bad = findIllegalAxisBranch();
    expect(() =>
      parseP6DimensionBranchHintsProposedPatch({
        kind: P6_8_DIMENSION_BRANCH_HINTS_PATCH_KIND,
        schemaVersion: 1,
        items: [{ axisId: bad.axisId, branch: bad.branch }],
      }),
    ).toThrow(/no question-bank opportunity/);
  });
});
