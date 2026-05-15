import {
  DEFAULT_ONBOARDING_VISION_APPLY_SOURCE_VERSION,
  readOnboardingVisionApplyEnv,
} from "../src/modules/onboarding/vision/onboarding-vision-apply-env";

describe("readOnboardingVisionApplyEnv (P7.5-r5-b)", () => {
  const orig = process.env;

  afterEach(() => {
    process.env = orig;
  });

  it("defaults all-off and default sourceVersion", () => {
    process.env = {};
    const e = readOnboardingVisionApplyEnv();
    expect(e.applyToPoolEnabled).toBe(false);
    expect(e.allowlistUserIds).toEqual([]);
    expect(e.applyPercent).toBe(0);
    expect(e.applySourceVersion).toBe(
      DEFAULT_ONBOARDING_VISION_APPLY_SOURCE_VERSION,
    );
  });

  it("APPLY_TO_POOL only exact 1 enables gate", () => {
    expect(
      readOnboardingVisionApplyEnv({
        PEIMA_ONBOARDING_VISION_APPLY_TO_POOL: "true",
      } as NodeJS.ProcessEnv).applyToPoolEnabled,
    ).toBe(false);
    expect(
      readOnboardingVisionApplyEnv({
        PEIMA_ONBOARDING_VISION_APPLY_TO_POOL: "1",
      } as NodeJS.ProcessEnv).applyToPoolEnabled,
    ).toBe(true);
  });

  it("invalid percent falls back to 0", () => {
    expect(
      readOnboardingVisionApplyEnv({
        PEIMA_ONBOARDING_VISION_APPLY_PERCENT: "101",
      } as NodeJS.ProcessEnv).applyPercent,
    ).toBe(0);
    expect(
      readOnboardingVisionApplyEnv({
        PEIMA_ONBOARDING_VISION_APPLY_PERCENT: "x",
      } as NodeJS.ProcessEnv).applyPercent,
    ).toBe(0);
    expect(
      readOnboardingVisionApplyEnv({
        PEIMA_ONBOARDING_VISION_APPLY_PERCENT: "50",
      } as NodeJS.ProcessEnv).applyPercent,
    ).toBe(50);
  });

  it("allowlist trims and drops empty segments", () => {
    const e = readOnboardingVisionApplyEnv({
      PEIMA_ONBOARDING_VISION_APPLY_ALLOWLIST_USER_IDS:
        " u1 , , u2  ,u3",
    } as NodeJS.ProcessEnv);
    expect(e.allowlistUserIds).toEqual(["u1", "u2", "u3"]);
  });

  it("custom APPLY_SOURCE_VERSION when set", () => {
    const e = readOnboardingVisionApplyEnv({
      PEIMA_ONBOARDING_VISION_APPLY_SOURCE_VERSION: "custom-v",
    } as NodeJS.ProcessEnv);
    expect(e.applySourceVersion).toBe("custom-v");
  });
});
