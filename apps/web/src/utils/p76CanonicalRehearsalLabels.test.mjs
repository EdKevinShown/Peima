import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appliedToMatchResultLabel,
  eligibleTone,
  violationTone,
} from "./p76CanonicalRehearsalLabels.mjs";

test("appliedToMatchResultLabel marks false as safe", () => {
  assert.equal(appliedToMatchResultLabel(false), "false (safe)");
});

test("eligibleTone blocked when not eligible", () => {
  assert.equal(eligibleTone(false, "ok"), "blocked");
});

test("violationTone p0 for applied flag", () => {
  assert.equal(violationTone("p0_applied_to_match_result"), "p0");
});
