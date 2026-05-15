import {
  passesPreferenceHardGate,
  preferenceGateDenominator,
} from "@peima/shared/matching/preference-hard-gate";
import { computePreferenceScore } from "@peima/shared/matching/preference-score";

describe("passesPreferenceHardGate", () => {
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
    occupation: "制造业 / 工程 / 技术",
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

  it("requires age in range when min/max both set", () => {
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

  it("filters by minAge only (>=)", () => {
    const pref = {
      minAge: 30,
      maxAge: null,
      preferredCities: [] as string[],
      minHeight: null,
      maxHeight: null,
      educationPreferences: [] as string[],
      occupationPreferences: [] as string[],
      relationshipGoalPreferences: [] as string[],
    };
    expect(preferenceGateDenominator(pref)).toBe(1);
    expect(passesPreferenceHardGate(pref, { ...candidate(), age: 30 })).toBe(
      true,
    );
    expect(passesPreferenceHardGate(pref, { ...candidate(), age: 29 })).toBe(
      false,
    );
    expect(
      passesPreferenceHardGate(pref, { ...candidate(), age: null }),
    ).toBe(false);
  });

  it("filters by maxAge only (<=)", () => {
    const pref = {
      minAge: null,
      maxAge: 25,
      preferredCities: [] as string[],
      minHeight: null,
      maxHeight: null,
      educationPreferences: [] as string[],
      occupationPreferences: [] as string[],
      relationshipGoalPreferences: [] as string[],
    };
    expect(preferenceGateDenominator(pref)).toBe(1);
    expect(passesPreferenceHardGate(pref, { ...candidate(), age: 25 })).toBe(
      true,
    );
    expect(passesPreferenceHardGate(pref, { ...candidate(), age: 26 })).toBe(
      false,
    );
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

  it("preferredCities empty does not restrict city", () => {
    const pref = {
      minAge: null,
      maxAge: null,
      preferredCities: [] as string[],
      minHeight: null,
      maxHeight: null,
      educationPreferences: [] as string[],
      occupationPreferences: [] as string[],
      relationshipGoalPreferences: [] as string[],
    };
    expect(
      passesPreferenceHardGate(pref, { ...candidate(), city: "任意" }),
    ).toBe(true);
  });

  it("filters by minHeight only (>=)", () => {
    const pref = {
      minAge: null,
      maxAge: null,
      preferredCities: [] as string[],
      minHeight: 175,
      maxHeight: null,
      educationPreferences: [] as string[],
      occupationPreferences: [] as string[],
      relationshipGoalPreferences: [] as string[],
    };
    expect(passesPreferenceHardGate(pref, { ...candidate(), height: 175 })).toBe(
      true,
    );
    expect(passesPreferenceHardGate(pref, { ...candidate(), height: 174 })).toBe(
      false,
    );
  });

  it("filters by maxHeight only (<=)", () => {
    const pref = {
      minAge: null,
      maxAge: null,
      preferredCities: [] as string[],
      minHeight: null,
      maxHeight: 165,
      educationPreferences: [] as string[],
      occupationPreferences: [] as string[],
      relationshipGoalPreferences: [] as string[],
    };
    expect(passesPreferenceHardGate(pref, { ...candidate(), height: 165 })).toBe(
      true,
    );
    expect(passesPreferenceHardGate(pref, { ...candidate(), height: 166 })).toBe(
      false,
    );
  });

  it("all configured dims must pass", () => {
    const pref = {
      minAge: 25,
      maxAge: 35,
      preferredCities: ["上海"],
      minHeight: 160,
      maxHeight: 180,
      educationPreferences: ["本科"],
      occupationPreferences: ["制造业 / 工程 / 技术"],
      relationshipGoalPreferences: ["认真恋爱"],
    };
    expect(passesPreferenceHardGate(pref, candidate())).toBe(true);
    expect(
      passesPreferenceHardGate(pref, { ...candidate(), education: "硕士" }),
    ).toBe(false);
  });
});

describe("computePreferenceScore (shared preview; single-sided age/height)", () => {
  const cand = {
    age: 28,
    city: "上海",
    height: 170,
    education: "本科",
    occupation: "制造业 / 工程 / 技术",
    relationshipGoal: "认真恋爱",
  };

  const basePref = {
    minAge: null as number | null,
    maxAge: null as number | null,
    preferredCities: [] as string[],
    minHeight: null as number | null,
    maxHeight: null as number | null,
    educationPreferences: [] as string[],
    occupationPreferences: [] as string[],
    relationshipGoalPreferences: [] as string[],
    styleTags: [] as string[],
  };

  it("returns 0 when no preference dimensions", () => {
    expect(computePreferenceScore(basePref, cand)).toBe(0);
  });

  it("minAge only: hit when age in bound", () => {
    expect(
      computePreferenceScore({ ...basePref, minAge: 25 }, { ...cand, age: 26 }),
    ).toBe(1);
    expect(
      computePreferenceScore({ ...basePref, minAge: 30 }, { ...cand, age: 26 }),
    ).toBe(0);
  });

  it("maxAge only: hit when age in bound", () => {
    expect(
      computePreferenceScore({ ...basePref, maxAge: 30 }, { ...cand, age: 28 }),
    ).toBe(1);
    expect(
      computePreferenceScore({ ...basePref, maxAge: 25 }, { ...cand, age: 28 }),
    ).toBe(0);
  });
});
