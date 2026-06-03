import { readOnboardingPreviewPoolGateEnv } from "../src/modules/onboarding/onboarding-preview-pool-env";

describe("readOnboardingPreviewPoolGateEnv", () => {
  it("defaults", () => {
    expect(readOnboardingPreviewPoolGateEnv({})).toEqual({
      relaxProfileGate: false,
      relaxGenderGate: false,
      relaxPreferenceGate: false,
      syntheticFallback: false,
      minSlots: 6,
    });
  });

  it("reads beta bundle flag", () => {
    expect(
      readOnboardingPreviewPoolGateEnv({
        PEIMA_ONBOARDING_PREVIEW_BETA_RELAXED: "1",
        PEIMA_ONBOARDING_PREVIEW_MIN_SLOTS: "3",
      }),
    ).toEqual({
      relaxProfileGate: true,
      relaxGenderGate: true,
      relaxPreferenceGate: true,
      syntheticFallback: true,
      minSlots: 3,
    });
  });
});
