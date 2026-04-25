import {
  passesPreferenceHardGate,
  preferenceGateDenominator,
} from "@peima/shared/matching/preference-hard-gate";

describe("passesPreferenceHardGate (aligned with worker computePreferenceScore denom)", () => {
  const candidate = (): {
    age: number | null;
    city: string;
    height: number | null;
    education: string;
    occupation: string;
    relationshipGoal: string;
  } => ({
    age: 28,
    city: "上海",
    height: 170,
    education: "本科",
    occupation: "工程师",
    relationshipGoal: "认真恋爱",
  });

  it("returns true when pref is null", () => {
    expect(passesPreferenceHardGate(null, candidate())).toBe(true);
  });

  it("returns true when denom is 0 (no configured constraints)", () => {
    const pref = {
      minAge: null,
      maxAge: null,
      preferredCities: [],
      minHeight: null,
      maxHeight: null,
      educationPreferences: [],
      occupationPreferences: [],
      relationshipGoalPreferences: [],
    };
    expect(preferenceGateDenominator(pref)).toBe(0);
    expect(passesPreferenceHardGate(pref, candidate())).toBe(true);
  });

  it("requires age in range when min/max set", () => {
    const pref = {
      minAge: 25,
      maxAge: 30,
      preferredCities: [] as string[],
      minHeight: null,
      maxHeight: null,
      educationPreferences: [] as string[],
      occupationPreferences: [] as string[],
      relationshipGoalPreferences: [] as string[],
    };
    expect(passesPreferenceHardGate(pref, candidate())).toBe(true);
    expect(
      passesPreferenceHardGate(pref, { ...candidate(), age: 24 }),
    ).toBe(false);
    expect(
      passesPreferenceHardGate(pref, { ...candidate(), age: null }),
    ).toBe(false);
  });

  it("requires city in list when preferredCities non-empty", () => {
    const pref = {
      minAge: null,
      maxAge: null,
      preferredCities: ["上海", "北京"],
      minHeight: null,
      maxHeight: null,
      educationPreferences: [] as string[],
      occupationPreferences: [] as string[],
      relationshipGoalPreferences: [] as string[],
    };
    expect(passesPreferenceHardGate(pref, candidate())).toBe(true);
    expect(
      passesPreferenceHardGate(pref, { ...candidate(), city: "深圳" }),
    ).toBe(false);
  });

  it("matches computePreferenceScore: all configured dims must pass", () => {
    const pref = {
      minAge: 25,
      maxAge: 35,
      preferredCities: ["上海"],
      minHeight: 160,
      maxHeight: 180,
      educationPreferences: ["本科"],
      occupationPreferences: ["工程师"],
      relationshipGoalPreferences: ["认真恋爱"],
    };
    expect(passesPreferenceHardGate(pref, candidate())).toBe(true);
    expect(
      passesPreferenceHardGate(pref, { ...candidate(), education: "硕士" }),
    ).toBe(false);
  });
});
