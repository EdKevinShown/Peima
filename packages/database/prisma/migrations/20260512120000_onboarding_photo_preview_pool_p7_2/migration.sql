-- P7.2: onboarding photo preview pool (isolated from preview_pools / worker).

ALTER TABLE "users" ADD COLUMN "onboardingPhotoAestheticCompletedAt" TIMESTAMP(3),
ADD COLUMN "onboardingPhotoPreviewCompletedAt" TIMESTAMP(3);

CREATE TABLE "onboarding_photo_preview_pools" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL DEFAULT 'onboarding-photo-preview-v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_photo_preview_pools_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "onboarding_photo_preview_pool_items" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "candidateUserId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "displayMode" TEXT NOT NULL,
    "rankInPool" INTEGER NOT NULL,
    "score" DOUBLE PRECISION,
    "reasonTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_photo_preview_pool_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "onboarding_photo_preview_pool_items_poolId_rankInPool_key" ON "onboarding_photo_preview_pool_items"("poolId", "rankInPool");

CREATE INDEX "onboarding_photo_preview_pool_items_poolId_idx" ON "onboarding_photo_preview_pool_items"("poolId");

CREATE INDEX "onboarding_photo_preview_pool_items_userId_poolId_idx" ON "onboarding_photo_preview_pool_items"("userId", "poolId");

CREATE INDEX "onboarding_photo_preview_pools_userId_status_createdAt_idx" ON "onboarding_photo_preview_pools"("userId", "status", "createdAt" DESC);

ALTER TABLE "onboarding_photo_preview_pools" ADD CONSTRAINT "onboarding_photo_preview_pools_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "onboarding_photo_preview_pool_items" ADD CONSTRAINT "onboarding_photo_preview_pool_items_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "onboarding_photo_preview_pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "onboarding_photo_preview_pool_items" ADD CONSTRAINT "onboarding_photo_preview_pool_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "onboarding_photo_preview_pool_items" ADD CONSTRAINT "onboarding_photo_preview_pool_items_candidateUserId_fkey" FOREIGN KEY ("candidateUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
