import type { ReviewPhotoApproveDto } from "./dto/review-photo-action.dto";
import type { ReviewPhotoActionWithReasonsDto } from "./dto/review-photo-action.dto";

export type ReviewWritePayload = {
  reviewStatus: string;
  reviewReasonCodes: string[];
  reviewNote: string | null;
};

export function buildApproveWrite(
  dto: ReviewPhotoApproveDto,
): ReviewWritePayload {
  return {
    reviewStatus: "approved",
    reviewReasonCodes: [],
    reviewNote: normalizeNote(dto.note),
  };
}

export function buildRejectWrite(
  dto: ReviewPhotoActionWithReasonsDto,
): ReviewWritePayload {
  return {
    reviewStatus: "rejected",
    reviewReasonCodes: [...dto.reasonCodes],
    reviewNote: normalizeNote(dto.note),
  };
}

export function buildNeedsReuploadWrite(
  dto: ReviewPhotoActionWithReasonsDto,
): ReviewWritePayload {
  return {
    reviewStatus: "needs_reupload",
    reviewReasonCodes: [...dto.reasonCodes],
    reviewNote: normalizeNote(dto.note),
  };
}

function normalizeNote(note: string | undefined): string | null {
  if (note === undefined || note === null) {
    return null;
  }
  const trimmed = note.trim();
  return trimmed.length > 0 ? trimmed : null;
}
