import {
  buildPhotoReviewAuditNewValues,
  buildPhotoReviewAuditOldValues,
} from "../src/modules/admin-photo-review/admin-photo-review-audit";

describe("admin-photo-review-audit", () => {
  const beforeRow = {
    id: "img-1",
    userId: "user-1",
    reviewStatus: "pending_review",
    reviewReasonCodes: ["DETECTION_SKIPPED_REVIEW"],
    reviewedAt: null,
    reviewedByUserId: null,
    reviewNote: null,
    detectionStatus: "skipped",
    detectionReasonCodes: [] as string[],
    detectionRulesVersion: "p7.4-r1c-v1",
    detectionScoreJson: { warnings: ["MULTIPLE_FACES"] },
  };

  it("builds oldValues from review fields only", () => {
    expect(buildPhotoReviewAuditOldValues(beforeRow)).toEqual({
      reviewStatus: "pending_review",
      reviewReasonCodes: ["DETECTION_SKIPPED_REVIEW"],
      reviewedAt: null,
      reviewedByUserId: null,
      reviewNote: null,
    });
  });

  it("builds newValues with meta and no detectionScoreJson", () => {
    const reviewedAt = new Date("2026-05-15T12:00:00.000Z");
    const nv = buildPhotoReviewAuditNewValues(
      beforeRow,
      {
        reviewStatus: "rejected",
        reviewReasonCodes: ["MANUAL_REJECTED"],
        reviewNote: "bad",
      },
      reviewedAt,
      "admin-1",
      ["MANUAL_REJECTED"],
    );
    expect(nv.reviewStatus).toBe("rejected");
    expect(nv.reviewReasonCodes).toEqual(["MANUAL_REJECTED"]);
    expect(nv.reviewNote).toBe("bad");
    expect(nv.meta).toEqual({
      userId: "user-1",
      detectionStatus: "skipped",
      detectionReasonCodes: [],
      detectionRulesVersion: "p7.4-r1c-v1",
      hasWarnings: true,
      requestReasonCodes: ["MANUAL_REJECTED"],
      notePresent: true,
    });
    expect("detectionScoreJson" in nv.meta).toBe(false);
  });
});
