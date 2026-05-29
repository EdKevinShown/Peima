-- P7.4-r1d-b: UserImage review status (human/ops), separate from machine detection.

ALTER TABLE "user_images" ADD COLUMN "reviewStatus" TEXT NOT NULL DEFAULT 'not_required';
ALTER TABLE "user_images" ADD COLUMN "reviewReasonCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "user_images" ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "user_images" ADD COLUMN "reviewedByUserId" TEXT;
ALTER TABLE "user_images" ADD COLUMN "reviewNote" TEXT;

CREATE INDEX "user_images_reviewStatus_createdAt_idx" ON "user_images"("reviewStatus", "createdAt");
CREATE INDEX "user_images_userId_reviewStatus_idx" ON "user_images"("userId", "reviewStatus");
