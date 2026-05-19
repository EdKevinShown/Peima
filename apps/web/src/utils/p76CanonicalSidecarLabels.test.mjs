import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appliedFlagTone,
  getCanonicalSidecarAppliedFlagLabel,
  getCanonicalSidecarModeLabel,
  getCanonicalSidecarPromotionStatusLabel,
  getCanonicalSidecarSafetyLabel,
  hasCanonicalSidecarP0Violation,
  hasCanonicalSidecarRowP0Violation,
} from "./p76CanonicalSidecarLabels.mjs";

test("not_promoted label", () => {
  assert.equal(getCanonicalSidecarPromotionStatusLabel("not_promoted"), "not_promoted");
});

test("promoted label", () => {
  assert.equal(getCanonicalSidecarPromotionStatusLabel("promoted"), "promoted");
});

test("rolled_back label", () => {
  assert.equal(getCanonicalSidecarPromotionStatusLabel("rolled_back"), "rolled_back");
});

test("blocked label", () => {
  assert.equal(getCanonicalSidecarPromotionStatusLabel("blocked"), "blocked");
});

test("sidecar mode label", () => {
  assert.equal(getCanonicalSidecarModeLabel("sidecar"), "sidecar");
});

test("applied false safe label", () => {
  assert.equal(
    getCanonicalSidecarAppliedFlagLabel(false, "matchResult", "not_promoted"),
    "matchResult: false (safe)",
  );
  assert.equal(appliedFlagTone(false), "ok");
});

test("applied true with not_promoted => P0 violation", () => {
  assert.equal(
    getCanonicalSidecarAppliedFlagLabel(true, "matchResult", "not_promoted"),
    "matchResult: true (P0 violation)",
  );
  assert.equal(hasCanonicalSidecarRowP0Violation({ appliedToMatchResult: true, promotionStatus: "not_promoted" }), true);
});

test("aggregate violation count triggers P0", () => {
  assert.equal(
    hasCanonicalSidecarP0Violation({
      appliedToMatchResultViolationCount: 0,
      appliedToFinalScoreViolationCount: 0,
      appliedToWorkerRankingViolationCount: 1,
    }),
    true,
  );
});

test("unknown value fallback", () => {
  assert.equal(getCanonicalSidecarPromotionStatusLabel("custom_status"), "custom_status");
  assert.equal(getCanonicalSidecarSafetyLabel({ safety: { isSidecarOnly: true } }), "Sidecar only");
});
