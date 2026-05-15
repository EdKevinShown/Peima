-- P7.4-r1a: UserImage extreme quality detection fields (legacy rows -> skipped).

ALTER TABLE "user_images" ADD COLUMN "detectionStatus" TEXT NOT NULL DEFAULT 'skipped';
ALTER TABLE "user_images" ADD COLUMN "detectionReasonCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "user_images" ADD COLUMN "detectionScoreJson" JSONB;
ALTER TABLE "user_images" ADD COLUMN "detectionRulesVersion" TEXT;
ALTER TABLE "user_images" ADD COLUMN "detectedAt" TIMESTAMP(3);

CREATE INDEX "user_images_userId_detectionStatus_createdAt_idx" ON "user_images"("userId", "detectionStatus", "createdAt");
