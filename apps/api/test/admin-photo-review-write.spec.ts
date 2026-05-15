import { validate } from "class-validator";
import {
  buildApproveWrite,
  buildNeedsReuploadWrite,
  buildRejectWrite,
} from "../src/modules/admin-photo-review/admin-photo-review-write";
import {
  ReviewPhotoActionWithReasonsDto,
  ReviewPhotoApproveDto,
} from "../src/modules/admin-photo-review/dto/review-photo-action.dto";

describe("admin-photo-review-write", () => {
  it("approve clears reasonCodes and stores note", () => {
    expect(buildApproveWrite({ note: " ok " })).toEqual({
      reviewStatus: "approved",
      reviewReasonCodes: [],
      reviewNote: "ok",
    });
  });

  it("reject carries reasonCodes", () => {
    expect(
      buildRejectWrite({
        reasonCodes: ["MANUAL_REJECTED", "LOW_QUALITY"],
        note: "bad",
      }),
    ).toEqual({
      reviewStatus: "rejected",
      reviewReasonCodes: ["MANUAL_REJECTED", "LOW_QUALITY"],
      reviewNote: "bad",
    });
  });

  it("needs-reupload carries reasonCodes", () => {
    expect(
      buildNeedsReuploadWrite({
        reasonCodes: ["NEEDS_REUPLOAD", "FACE_NOT_CLEAR"],
      }),
    ).toEqual({
      reviewStatus: "needs_reupload",
      reviewReasonCodes: ["NEEDS_REUPLOAD", "FACE_NOT_CLEAR"],
      reviewNote: null,
    });
  });
});

describe("ReviewPhotoActionWithReasonsDto validation", () => {
  async function errors(dto: ReviewPhotoActionWithReasonsDto) {
    return validate(Object.assign(new ReviewPhotoActionWithReasonsDto(), dto));
  }

  it("rejects empty reasonCodes", async () => {
    const errs = await errors({ reasonCodes: [] });
    expect(errs.length).toBeGreaterThan(0);
  });

  it("rejects unknown reasonCode", async () => {
    const errs = await errors({ reasonCodes: ["NOT_A_REAL_CODE"] });
    expect(errs.length).toBeGreaterThan(0);
  });

  it("accepts whitelist reasonCodes", async () => {
    const errs = await errors({ reasonCodes: ["MANUAL_REJECTED"] });
    expect(errs).toHaveLength(0);
  });
});

describe("ReviewPhotoApproveDto validation", () => {
  it("allows approve without reasonCodes", async () => {
    const dto = Object.assign(new ReviewPhotoApproveDto(), { note: "fine" });
    const errs = await validate(dto);
    expect(errs).toHaveLength(0);
  });
});
