import { readM5RrmTop2DisplayEnv } from "../src/modules/matching/m5-rrm-top2-display-env";

describe("readM5RrmTop2DisplayEnv", () => {
  const prev = process.env.PEIMA_M5_RRM_TOP2_ENABLED;

  afterEach(() => {
    if (prev === undefined) delete process.env.PEIMA_M5_RRM_TOP2_ENABLED;
    else process.env.PEIMA_M5_RRM_TOP2_ENABLED = prev;
  });

  it("unset → disabled", () => {
    delete process.env.PEIMA_M5_RRM_TOP2_ENABLED;
    expect(readM5RrmTop2DisplayEnv().enabled).toBe(false);
  });

  it.each(["1", "true", "yes", "TRUE", " Yes ", " 1 "])("PEIMA_M5_RRM_TOP2_ENABLED=%j → enabled", (val) => {
    process.env.PEIMA_M5_RRM_TOP2_ENABLED = val;
    expect(readM5RrmTop2DisplayEnv().enabled).toBe(true);
  });

  it.each(["0", "false", "no", "off", "", "2", "maybe"])("PEIMA_M5_RRM_TOP2_ENABLED=%j → disabled", (val) => {
    process.env.PEIMA_M5_RRM_TOP2_ENABLED = val;
    expect(readM5RrmTop2DisplayEnv().enabled).toBe(false);
  });
});
