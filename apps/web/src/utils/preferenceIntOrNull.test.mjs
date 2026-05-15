import test from "node:test";
import assert from "node:assert/strict";
import { preferenceIntOrNull } from "./preferenceIntOrNull.js";

test("preferenceIntOrNull empty / omit", () => {
  assert.equal(preferenceIntOrNull(""), null);
  assert.equal(preferenceIntOrNull(undefined), null);
  assert.equal(preferenceIntOrNull(null), null);
  assert.equal(preferenceIntOrNull("   "), null);
});

test('preferenceIntOrNull("18")', () => {
  assert.equal(preferenceIntOrNull("18"), 18);
});

test("preference rejects 0 / string null keyword", () => {
  assert.equal(preferenceIntOrNull(0), null);
  assert.equal(preferenceIntOrNull("0"), null);
  assert.equal(preferenceIntOrNull("null"), null);
});

test("payload normalization for unchecked age bounds", () => {
  assert.deepStrictEqual(
    {
      minAge: preferenceIntOrNull(""),
      maxAge: preferenceIntOrNull(""),
      minHeight: preferenceIntOrNull(""),
      maxHeight: preferenceIntOrNull(""),
    },
    { minAge: null, maxAge: null, minHeight: null, maxHeight: null },
  );
});
