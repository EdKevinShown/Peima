import {
  applyR5C2CaseEnv,
  restoreApplyEnv,
  snapshotApplyEnv,
} from "../src/dev-cli/p75-r5-c2-apply-writer-signoff-env";
import { readOnboardingVisionApplyEnv } from "../src/modules/onboarding/vision/onboarding-vision-apply-env";

describe("p75-r5-c2 apply writer signoff env", () => {
  let snap: ReturnType<typeof snapshotApplyEnv>;

  beforeEach(() => {
    snap = snapshotApplyEnv();
  });

  afterEach(() => {
    restoreApplyEnv(snap);
  });

  it("restores prior values after applyR5C2CaseEnv", () => {
    process.env.PEIMA_ONBOARDING_VISION_APPLY_TO_POOL = "orig";
    process.env.PEIMA_ONBOARDING_VISION_APPLY_PERCENT = "42";
    const localSnap = snapshotApplyEnv();
    applyR5C2CaseEnv({
      applyToPool: "1",
      allowlist: "viewer-1",
      percent: "0",
      applySourceVersion: "onboarding-photo-preview-v2-vision",
    });
    expect(readOnboardingVisionApplyEnv().applyToPoolEnabled).toBe(true);
    expect(readOnboardingVisionApplyEnv().allowlistUserIds).toEqual(["viewer-1"]);
    restoreApplyEnv(localSnap);
    expect(process.env.PEIMA_ONBOARDING_VISION_APPLY_TO_POOL).toBe("orig");
    expect(process.env.PEIMA_ONBOARDING_VISION_APPLY_PERCENT).toBe("42");
  });

  it("allowlistDefined:false clears allowlist (Case B percent=100)", () => {
    process.env.PEIMA_ONBOARDING_VISION_APPLY_ALLOWLIST_USER_IDS = "x";
    applyR5C2CaseEnv({
      applyToPool: "1",
      allowlistDefined: false,
      percent: "100",
    });
    expect(
      process.env.PEIMA_ONBOARDING_VISION_APPLY_ALLOWLIST_USER_IDS,
    ).toBeUndefined();
    expect(readOnboardingVisionApplyEnv().applyPercent).toBe(100);
    expect(readOnboardingVisionApplyEnv().allowlistUserIds).toEqual([]);
  });
});
