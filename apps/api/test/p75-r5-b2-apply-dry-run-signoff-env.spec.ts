import {
  applyR5B2CaseEnv,
  restoreApplyEnv,
  snapshotApplyEnv,
} from "../src/dev-cli/p75-r5-b2-apply-dry-run-signoff-env";
import { readOnboardingVisionApplyEnv } from "../src/modules/onboarding/vision/onboarding-vision-apply-env";

describe("p75-r5-b2 apply env snapshot / restore", () => {
  let snap: ReturnType<typeof snapshotApplyEnv>;

  beforeEach(() => {
    snap = snapshotApplyEnv();
  });

  afterEach(() => {
    restoreApplyEnv(snap);
  });

  it("restores prior values after applyR5B2CaseEnv", () => {
    process.env.PEIMA_ONBOARDING_VISION_APPLY_TO_POOL = "orig-pool";
    process.env.PEIMA_ONBOARDING_VISION_APPLY_PERCENT = "77";
    const localSnap = snapshotApplyEnv();
    applyR5B2CaseEnv({
      applyToPool: "1",
      allowlist: "u1,u2",
      percent: "50",
    });
    expect(process.env.PEIMA_ONBOARDING_VISION_APPLY_TO_POOL).toBe("1");
    expect(readOnboardingVisionApplyEnv().applyPercent).toBe(50);
    restoreApplyEnv(localSnap);
    expect(process.env.PEIMA_ONBOARDING_VISION_APPLY_TO_POOL).toBe("orig-pool");
    expect(process.env.PEIMA_ONBOARDING_VISION_APPLY_PERCENT).toBe("77");
  });

  it("allowlistDefined:false clears allowlist key", () => {
    process.env.PEIMA_ONBOARDING_VISION_APPLY_ALLOWLIST_USER_IDS = "x";
    applyR5B2CaseEnv({
      applyToPool: "1",
      allowlistDefined: false,
      percent: "100",
    });
    expect(process.env.PEIMA_ONBOARDING_VISION_APPLY_ALLOWLIST_USER_IDS).toBeUndefined();
  });
});
