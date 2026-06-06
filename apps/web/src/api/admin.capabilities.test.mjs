import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveAdminCapabilitiesFetch } from "../utils/adminCapabilitiesFetch.js";

describe("resolveAdminCapabilitiesFetch", () => {
  it("401 -> fail closed (not admin)", () => {
    const r = resolveAdminCapabilitiesFetch(401);
    assert.equal(r.ok, false);
    assert.equal(r.reason, "unauthorized");
  });

  it("403 -> fail closed (not admin)", () => {
    const r = resolveAdminCapabilitiesFetch(403);
    assert.equal(r.ok, false);
    assert.equal(r.reason, "forbidden");
  });

  it("200 with body -> ok and preserves batchMatchTrigger", () => {
    const r = resolveAdminCapabilitiesFetch(200, { batchMatchTrigger: true });
    assert.equal(r.ok, true);
    assert.deepEqual(r.capabilities, { batchMatchTrigger: true });
  });

  it("200 without batchMatchTrigger -> ok with false flag", () => {
    const r = resolveAdminCapabilitiesFetch(200, {});
    assert.equal(r.ok, true);
    assert.deepEqual(r.capabilities, { batchMatchTrigger: false });
  });

  it("500 -> error fail closed", () => {
    const r = resolveAdminCapabilitiesFetch(500);
    assert.equal(r.ok, false);
    assert.equal(r.reason, "error");
  });
});
