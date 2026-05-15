import {
  computeOnboardingPhotoGateFromImages,
  isUserImagePassingForOnboarding,
} from "../src/modules/onboarding/onboarding-photo-passing";

const t0 = new Date("2026-05-15T10:00:00.000Z");
const t1 = new Date("2026-05-15T11:00:00.000Z");

function img(
  overrides: Partial<{
    id: string;
    detectionStatus: string;
    reviewStatus: string;
    reviewReasonCodes: string[];
    createdAt: Date;
  }>,
) {
  return {
    id: "img-1",
    detectionStatus: "passed",
    reviewStatus: "not_required",
    reviewReasonCodes: [] as string[],
    createdAt: t0,
    ...overrides,
  };
}

describe("isUserImagePassingForOnboarding", () => {
  it("passed + not_required → true", () => {
    expect(
      isUserImagePassingForOnboarding({
        detectionStatus: "passed",
        reviewStatus: "not_required",
      }),
    ).toBe(true);
  });

  it("skipped + pending_review → true", () => {
    expect(
      isUserImagePassingForOnboarding({
        detectionStatus: "skipped",
        reviewStatus: "pending_review",
      }),
    ).toBe(true);
  });

  it("failed + not_required → false", () => {
    expect(
      isUserImagePassingForOnboarding({
        detectionStatus: "failed",
        reviewStatus: "not_required",
      }),
    ).toBe(false);
  });

  it("failed + approved → true", () => {
    expect(
      isUserImagePassingForOnboarding({
        detectionStatus: "failed",
        reviewStatus: "approved",
      }),
    ).toBe(true);
  });

  it("passed + rejected → false", () => {
    expect(
      isUserImagePassingForOnboarding({
        detectionStatus: "passed",
        reviewStatus: "rejected",
      }),
    ).toBe(false);
  });

  it("skipped + needs_reupload → false", () => {
    expect(
      isUserImagePassingForOnboarding({
        detectionStatus: "skipped",
        reviewStatus: "needs_reupload",
      }),
    ).toBe(false);
  });
});

describe("computeOnboardingPhotoGateFromImages", () => {
  it("rejected + approved → hasPassingPhoto with passingPhotoCount >= 1", () => {
    const gate = computeOnboardingPhotoGateFromImages([
      img({ id: "r", reviewStatus: "rejected", detectionStatus: "passed" }),
      img({
        id: "a",
        reviewStatus: "approved",
        detectionStatus: "failed",
        createdAt: t1,
      }),
    ]);
    expect(gate.hasPassingPhoto).toBe(true);
    expect(gate.passingPhotoCount).toBeGreaterThanOrEqual(1);
    expect(gate.passingPhotoId).toBe("a");
    expect(gate.hasBlockedPhoto).toBe(true);
    expect(gate.photoGateMessageKey).toBeNull();
  });

  it("only needs_reupload → blocked gate fields", () => {
    const gate = computeOnboardingPhotoGateFromImages([
      img({
        id: "n",
        reviewStatus: "needs_reupload",
        detectionStatus: "skipped",
        reviewReasonCodes: ["NEEDS_REUPLOAD", "FACE_NOT_CLEAR"],
      }),
    ]);
    expect(gate.hasPassingPhoto).toBe(false);
    expect(gate.hasBlockedPhoto).toBe(true);
    expect(gate.blockingPhotoReviewStatus).toBe("needs_reupload");
    expect(gate.photoGateMessageKey).toBe("photo_needs_reupload");
    expect(gate.photoGateReasonCodes).toEqual([
      "NEEDS_REUPLOAD",
      "FACE_NOT_CLEAR",
    ]);
    expect(gate.photoReviewStatusSummary).toBe("blocked_needs_reupload");
  });

  it("skipped + pending_review → under review, still passing", () => {
    const gate = computeOnboardingPhotoGateFromImages([
      img({ reviewStatus: "pending_review", detectionStatus: "skipped" }),
    ]);
    expect(gate.hasPassingPhoto).toBe(true);
    expect(gate.hasPhotoUnderReview).toBe(true);
    expect(gate.photoReviewStatusSummary).toBe("pending_review");
  });
});
