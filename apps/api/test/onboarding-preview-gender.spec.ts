import {
  candidatePassesOppositeBinaryGate,
  isStrictBinaryPreviewGender,
  normalizeUserGenderForPreview,
  resolveOppositeGenderForPreview,
} from "../src/modules/onboarding/onboarding-preview-gender";

describe("onboarding-preview-gender (P7.5-r4-i)", () => {
  it("normalizeUserGenderForPreview understands common spellings", () => {
    expect(normalizeUserGenderForPreview(undefined)).toBe("unknown");
    expect(normalizeUserGenderForPreview("")).toBe("unknown");
    expect(normalizeUserGenderForPreview("male")).toBe("male");
    expect(normalizeUserGenderForPreview("MALE")).toBe("male");
    expect(normalizeUserGenderForPreview("女")).toBe("female");
    expect(normalizeUserGenderForPreview("invalid")).toBe("unknown");
  });

  it("resolveOppositeGenderForPreview is male↔female only", () => {
    expect(resolveOppositeGenderForPreview("male")).toBe("female");
    expect(resolveOppositeGenderForPreview("female")).toBe("male");
    expect(resolveOppositeGenderForPreview("unknown")).toBe(null);
  });

  it("isStrictBinaryPreviewGender", () => {
    expect(isStrictBinaryPreviewGender("male")).toBe(true);
    expect(isStrictBinaryPreviewGender("female")).toBe(true);
    expect(isStrictBinaryPreviewGender("unknown")).toBe(false);
  });

  it("candidatePassesOppositeBinaryGate requires opposite binary male/female", () => {
    expect(candidatePassesOppositeBinaryGate("male", "female")).toBe(true);
    expect(candidatePassesOppositeBinaryGate("male", "女")).toBe(true);
    expect(candidatePassesOppositeBinaryGate("female", "male")).toBe(true);
    expect(candidatePassesOppositeBinaryGate("female", "")).toBe(false);
    expect(candidatePassesOppositeBinaryGate("female", null)).toBe(false);
    expect(candidatePassesOppositeBinaryGate("female", "unknown")).toBe(false);
    expect(candidatePassesOppositeBinaryGate("male", "male")).toBe(false);
    expect(candidatePassesOppositeBinaryGate("female", "female")).toBe(false);
  });
});
