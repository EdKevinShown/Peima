import type { MatchResult } from "@peima/database";
import {
  buildMultiSourceFinalDecisionReadonlyM51M0,
  MULTI_SOURCE_FINAL_DECISION_READONLY_SOURCE_VERSION,
} from "../src/modules/matching/matching-multi-source-final-decision-m51m0";

function mr(): MatchResult {
  return {
    id: "mr-1",
    userId: "viewer-1",
    candidateUserId: "cand-static",
    batchId: "batch-1",
    finalScore: 0.82,
    reasonSummary: "ok",
    status: "active",
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
  } as MatchResult;
}

describe("buildMultiSourceFinalDecisionReadonlyM51M0 (M5.1-M0)", () => {
  it("echoes display fields and never proposes M5 display change", () => {
    const row = mr();
    const display = {
      displayCandidateUserId: "cand-pairwise",
      displaySourceType: "pairwise_final" as const,
      finalMatchDecisionMeta: null,
    };
    const sidecar = buildMultiSourceFinalDecisionReadonlyM51M0(row, display);
    expect(sidecar.sourceVersion).toBe(MULTI_SOURCE_FINAL_DECISION_READONLY_SOURCE_VERSION);
    expect(sidecar.currentDisplayCandidateUserId).toBe("cand-pairwise");
    expect(sidecar.currentDisplaySourceType).toBe("pairwise_final");
    expect(sidecar.m5ProposedDisplayCandidateUserId).toBeNull();
    expect(sidecar.m5AppliedToDisplay).toBe(false);
    expect(sidecar.wouldChangeCurrentDisplay).toBe(false);
    expect(sidecar.decisionRule).toBe("current_display_preserved_readonly");
  });

  it("echoes match_result_original when display equals baseline", () => {
    const row = mr();
    const display = {
      displayCandidateUserId: row.candidateUserId,
      displaySourceType: "match_result_original" as const,
      finalMatchDecisionMeta: null,
    };
    const sidecar = buildMultiSourceFinalDecisionReadonlyM51M0(row, display);
    expect(sidecar.currentDisplayCandidateUserId).toBe(row.candidateUserId);
    expect(sidecar.currentDisplaySourceType).toBe("match_result_original");
  });
});
