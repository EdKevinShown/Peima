import { readOnboardingPreviewPoolGateEnv } from "../src/modules/onboarding/onboarding-preview-pool-env";

describe("readOnboardingPreviewPoolGateEnv", () => {
  it("defaults", () => {
    expect(readOnboardingPreviewPoolGateEnv({})).toEqual({
      relaxProfileGate: false,
      minSlots: 6,
    });
  });

  it("reads beta toggles", () => {
    expect(
      readOnboardingPreviewPoolGateEnv({
        PEIMA_ONBOARDING_PREVIEW_RELAX_PROFILE_GATE: "1",
        PEIMA_ONBOARDING_PREVIEW_MIN_SLOTS: "3",
      }),
    ).toEqual({
      relaxProfileGate: true,
      minSlots: 3,
    });
  });
});
