import test from "node:test";
import assert from "node:assert/strict";
import {
  hasMainChainP0,
  hasNonAllowlistP0,
  labelProductApplyStatus,
  labelSidecarStatus,
  labelViolationStatus,
  sidecarMustNotReadAsProduction,
  violationTone,
} from "./p76AllowlistApplyMetaLabels.mjs";

test("sidecar written is not displayed as production applied", () => {
  assert.equal(labelSidecarStatus("written"), "Sidecar written");
  assert.equal(labelProductApplyStatus("not_applied"), "Not product-applied");
  assert.equal(sidecarMustNotReadAsProduction("written"), true);
});

test("violation row displays P0 tone for main chain", () => {
  assert.equal(violationTone("p0_main_chain_flag"), "p0");
  assert.equal(
    hasMainChainP0({
      appliedToMatchResult: true,
      appliedToFinalScore: false,
      appliedToWorkerRanking: false,
      appliedToDisplay: false,
    }),
    true,
  );
  assert.equal(labelViolationStatus("p0_main_chain_flag"), "P0 main-chain flag");
});

test("rolledBack row uses warning tone", () => {
  assert.equal(violationTone("rolled_back"), "warning");
  assert.equal(labelSidecarStatus("rolled_back"), "Rolled back");
});

test("aggregate card labels: ok violation", () => {
  assert.equal(violationTone("ok"), "ok");
  assert.equal(labelViolationStatus("ok"), "OK");
});

test("non-allowlist P0 detection", () => {
  assert.equal(hasNonAllowlistP0({ allowlistMatched: false }), true);
  assert.equal(hasNonAllowlistP0({ allowlistMatched: true }), false);
});
