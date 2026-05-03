import { readM5RrmTop2MetaWriteEnabled } from "../src/modules/matching/matching-rrm-top2-display-meta-write-env";

describe("readM5RrmTop2MetaWriteEnabled", () => {
  const key = "PEIMA_M5_RRM_TOP2_META_WRITE_ENABLED";
  const prev = process.env[key];

  afterEach(() => {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  });

  it("is false when unset", () => {
    delete process.env[key];
    expect(readM5RrmTop2MetaWriteEnabled()).toBe(false);
  });

  it.each(["0", "false", "no", "off", "maybe", ""] as const)("is false for %j", (v) => {
    process.env[key] = v;
    expect(readM5RrmTop2MetaWriteEnabled()).toBe(false);
  });

  it.each(["1", "true", "yes", " TRUE "] as const)("is true for %j", (v) => {
    process.env[key] = v;
    expect(readM5RrmTop2MetaWriteEnabled()).toBe(true);
  });
});
