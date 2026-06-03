import { readOnboardingPreviewPoolGateEnv } from "../src/modules/onboarding/onboarding-preview-pool-env";

describe("readOnboardingPreviewPoolGateEnv", () => {
  it("defaults", () => {
    expect(readOnboardingPreviewPoolGateEnv({})).toEqual({
      relaxProfileGate: false,
      relaxGenderGate: false,
      relaxPreferenceGate: false,
      minSlots: 6,
    });
  });

  it("reads individual relax flags (gender relax env ignored)", () => {
    expect(
      readOnboardingPreviewPoolGateEnv({
        PEIMA_ONBOARDING_PREVIEW_RELAX_PROFILE_GATE: "1",
        PEIMA_ONBOARDING_PREVIEW_RELAX_GENDER_GATE: "1",
        PEIMA_ONBOARDING_PREVIEW_RELAX_PREFERENCE_GATE: "1",
        PEIMA_ONBOARDING_PREVIEW_MIN_SLOTS: "3",
      }),
    ).toEqual({
      relaxProfileGate: true,
      relaxGenderGate: false,
      relaxPreferenceGate: true,
      minSlots: 3,
    });
  });
});
