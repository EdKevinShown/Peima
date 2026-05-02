/**
 * Node native tests for tools/lib/m13-calibration-aggregate.mjs (no Jest / no DB).
 * Run: node --test tools/m13-calibration-aggregate.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PRODUCTION_TOO_NARROW_LT,
  classifyScoreDistribution,
  classifyScoreDistributionForStableCohort,
  buildProposalRecommendation,
  expandRhythmScore,
  aggregatePerConfig,
  spreadFromRhythmScores,
} from "./lib/m13-calibration-aggregate.mjs";

describe("classifyScoreDistribution", () => {
  it("production threshold 8: spread 5 → too_narrow (stable cohort)", () => {
    assert.equal(classifyScoreDistributionForStableCohort(5, PRODUCTION_TOO_NARROW_LT), "too_narrow");
  });

  it("threshold 5: spread 5 → ok", () => {
    assert.equal(classifyScoreDistributionForStableCohort(5, 5), "ok");
  });

  it("threshold 3: spread 2 → too_narrow", () => {
    assert.equal(classifyScoreDistributionForStableCohort(2, 3), "too_narrow");
  });

  it("too_many_fallbacks takes priority over too_narrow", () => {
    const flag = classifyScoreDistribution({
      spread: 0,
      tooNarrowSpreadLt: 8,
      rrmAvailableCount: 2,
      fallbackCount: 3,
      totalItemCount: 4,
    });
    assert.equal(flag, "too_many_fallbacks");
  });
});

describe("expandRhythmScore / spread", () => {
  it("rhythm_mapping proxy widens spread for asymmetric scores", () => {
    const before = [30, 40];
    const after = before.map((s) => expandRhythmScore(s, 1.5));
    const sp0 = spreadFromRhythmScores(before).spread;
    const sp1 = spreadFromRhythmScores(after).spread;
    assert.ok(sp1 > sp0, `expected expanded spread ${sp1} > ${sp0}`);
  });
});

describe("buildProposalRecommendation", () => {
  it("top unchanged + ok flag → supports_existing_rank", () => {
    const r = buildProposalRecommendation({
      scoreDistributionFlag: "ok",
      topChanged: false,
      spread: 10,
      existingTop: "a",
      rrmTop: "a",
    });
    assert.equal(r.recommendation, "supports_existing_rank");
  });

  it("top changed + ok flag + spread >= 8 → review_manually", () => {
    const r = buildProposalRecommendation({
      scoreDistributionFlag: "ok",
      topChanged: true,
      spread: 10,
      existingTop: "a",
      rrmTop: "b",
    });
    assert.equal(r.recommendation, "review_manually");
  });
});

describe("aggregatePerConfig", () => {
  it("aggregates job rows", () => {
    const rows = [
      { spread: 5, scoreDistributionFlag: "too_narrow", recommendation: "insufficient_separation", rrmTopCandidateUserId: "x" },
      { spread: 10, scoreDistributionFlag: "ok", recommendation: "supports_existing_rank", rrmTopCandidateUserId: "y" },
    ];
    const s = aggregatePerConfig(rows, "current");
    assert.equal(s.tooNarrowCount, 1);
    assert.equal(s.okCount, 1);
    assert.equal(s.avgSpread, 7.5);
  });
});
