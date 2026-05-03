import { readM5RrmTop2DisplayEnv } from "../src/modules/matching/m5-rrm-top2-display-env";

describe("readM5RrmTop2DisplayEnv", () => {
  const prev = process.env.PEIMA_M5_RRM_TOP2_ENABLED;

  afterEach(() => {
    if (prev === undefined) delete process.env.PEIMA_M5_RRM_TOP2_ENABLED;
    else process.env.PEIMA_M5_RRM_TOP2_ENABLED = prev;
  });

  it("defaults to disabled", () => {
    delete process.env.PEIMA_M5_RRM_TOP2_ENABLED;
    expect(readM5RrmTop2DisplayEnv().enabled).toBe(false);
  });

  it("enables only when set to 1", () => {
    process.env.PEIMA_M5_RRM_TOP2_ENABLED = "1";
    expect(readM5RrmTop2DisplayEnv().enabled).toBe(true);
    process.env.PEIMA_M5_RRM_TOP2_ENABLED = "true";
    expect(readM5RrmTop2DisplayEnv().enabled).toBe(false);
  });
});
