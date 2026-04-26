import { ITEM_STATUS } from "../src/modules/ai-simulation-v1/ai-simulation-v1.constants";
import { computeShortlistFingerprint } from "../src/modules/ai-simulation-v1/shortlist-contract-binding";
import { tryBuildShortlistDecisionV0 } from "../src/modules/ai-simulation-v1/shortlist-decision-v0";

const binding2 = (ids: [string, string]) => ({
  previewPoolId: "p1",
  shortlistSchemaVersion: "preview_pool_shortlist_contract_v0",
  shortlistCandidateUserIds: [...ids],
  shortlistFingerprint: computeShortlistFingerprint([...ids]),
});

describe("tryBuildShortlistDecisionV0", () => {
  const ev = (score: number, confidence: "high" | "medium" | "low" = "high") => ({
    continue_recommendation: "explore_more" as const,
    risk_tags: [] as string[],
    mitigation_hints: [] as string[],
    simulationRankScore: score,
    confidence,
  });

  it("ranks by simulationRankScore desc; tie-break by candidateUserId lex asc", () => {
    const b = binding2(["b_user", "a_user"]);
    const items = [
      { candidateUserId: "a_user", status: ITEM_STATUS.SUCCEEDED, evaluator: ev(0.9) },
      { candidateUserId: "b_user", status: ITEM_STATUS.SUCCEEDED, evaluator: ev(0.9) },
    ];
    const d = tryBuildShortlistDecisionV0(b, items);
    expect(d).not.toBeNull();
    expect(d!.rankedCandidateUserIds).toEqual(["a_user", "b_user"]);
    expect(d!.chosenCandidateUserId).toBe("a_user");
    expect(d!.chosenCandidateUserId).toBe(d!.rankedCandidateUserIds[0]);
    expect(d!.shortlistFingerprint).toBe(b.shortlistFingerprint);
    expect(d!.confidenceTier).toBe("high");
  });

  it("returns null if any shortlist member is not succeeded", () => {
    const b = binding2(["c1", "c2"]);
    const items = [
      { candidateUserId: "c1", status: ITEM_STATUS.SUCCEEDED, evaluator: ev(0.8) },
      { candidateUserId: "c2", status: ITEM_STATUS.FAILED, evaluator: null },
    ];
    expect(tryBuildShortlistDecisionV0(b, items)).toBeNull();
  });

  it("returns null when binding fingerprint does not match ids", () => {
    const b = {
      ...binding2(["c1", "c2"]),
      shortlistFingerprint: "deadbeef",
    };
    const items = [
      { candidateUserId: "c1", status: ITEM_STATUS.SUCCEEDED, evaluator: ev(0.5) },
      { candidateUserId: "c2", status: ITEM_STATUS.SUCCEEDED, evaluator: ev(0.6) },
    ];
    expect(tryBuildShortlistDecisionV0(b, items)).toBeNull();
  });

  it("returns null without binding", () => {
    expect(
      tryBuildShortlistDecisionV0(null, [
        { candidateUserId: "c1", status: ITEM_STATUS.SUCCEEDED, evaluator: ev(1) },
      ]),
    ).toBeNull();
  });

  it("supports 3-way shortlist strict permutation", () => {
    const ids = ["x3", "x1", "x2"] as const;
    const b = {
      previewPoolId: "p1",
      shortlistSchemaVersion: "preview_pool_shortlist_contract_v0",
      shortlistCandidateUserIds: [...ids],
      shortlistFingerprint: computeShortlistFingerprint([...ids]),
    };
    const items = ids.map((id) => ({
      candidateUserId: id,
      status: ITEM_STATUS.SUCCEEDED,
      evaluator: ev(id === "x2" ? 0.99 : 0.5),
    }));
    const d = tryBuildShortlistDecisionV0(b, items);
    expect(d!.rankedCandidateUserIds).toEqual(["x2", "x1", "x3"]);
    expect(d!.chosenCandidateUserId).toBe("x2");
    expect(new Set(d!.rankedCandidateUserIds).size).toBe(3);
  });
});
