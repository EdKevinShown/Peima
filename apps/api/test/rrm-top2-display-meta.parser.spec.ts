import {
  parseMatchResultRrmTop2DisplayMetaV1Loose,
  toViewerSafeRrmTop2DisplayMeta,
} from "../src/modules/matching/rrm-top2-display-meta.parser";
import { MATCH_RESULT_RRM_TOP2_DISPLAY_META_SOURCE_TYPE } from "../src/modules/matching/rrm-top2-display-meta.types";

describe("parseMatchResultRrmTop2DisplayMetaV1Loose", () => {
  it("accepts a valid v1 meta JSON", () => {
    const raw = {
      schemaVersion: 1,
      sourceType: MATCH_RESULT_RRM_TOP2_DISPLAY_META_SOURCE_TYPE,
      sourceVersion: "m5.3-rrm-top2-enabled-display-v1",
      baselineCandidateUserId: "u_baseline",
      previousDisplayCandidateUserId: "u_prev",
      newDisplayCandidateUserId: "u_new",
      decisionRule: "rrm_top2_winner_guardrails_pass",
      top2Fingerprint: "fp_test",
      appliedToFinalScore: false,
      appliedToWorkerRanking: false,
      rollbackAvailable: true,
    };
    const parsed = parseMatchResultRrmTop2DisplayMetaV1Loose(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.newDisplayCandidateUserId).toBe("u_new");
    expect(toViewerSafeRrmTop2DisplayMeta(parsed!).top2Fingerprint).toBe("fp_test");
  });

  it("rejects wrong schemaVersion", () => {
    expect(parseMatchResultRrmTop2DisplayMetaV1Loose({ schemaVersion: 2, sourceType: MATCH_RESULT_RRM_TOP2_DISPLAY_META_SOURCE_TYPE })).toBeNull();
  });

  it("rejects wrong sourceType", () => {
    expect(
      parseMatchResultRrmTop2DisplayMetaV1Loose({
        schemaVersion: 1,
        sourceType: "other",
        sourceVersion: "v",
        baselineCandidateUserId: "a",
        previousDisplayCandidateUserId: "b",
        newDisplayCandidateUserId: "c",
        decisionRule: "r",
        top2Fingerprint: "fp",
        appliedToFinalScore: false,
        appliedToWorkerRanking: false,
        rollbackAvailable: true,
      }),
    ).toBeNull();
  });

  it("rejects appliedToFinalScore !== false", () => {
    expect(
      parseMatchResultRrmTop2DisplayMetaV1Loose({
        schemaVersion: 1,
        sourceType: MATCH_RESULT_RRM_TOP2_DISPLAY_META_SOURCE_TYPE,
        sourceVersion: "v",
        baselineCandidateUserId: "a",
        previousDisplayCandidateUserId: "b",
        newDisplayCandidateUserId: "c",
        decisionRule: "r",
        top2Fingerprint: "fp",
        appliedToFinalScore: true,
        appliedToWorkerRanking: false,
        rollbackAvailable: true,
      }),
    ).toBeNull();
  });
});
