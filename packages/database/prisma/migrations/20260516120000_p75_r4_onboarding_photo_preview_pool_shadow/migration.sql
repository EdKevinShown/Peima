-- P7.5-r4-b: readonly visual ranking shadow for onboarding photo preview pools.

CREATE TABLE "onboarding_photo_preview_pool_shadows" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shadowType" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_photo_preview_pool_shadows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "onboarding_photo_preview_pool_shadows_poolId_shadowType_sourceVersion_key" ON "onboarding_photo_preview_pool_shadows"("poolId", "shadowType", "sourceVersion");

CREATE INDEX "onboarding_photo_preview_pool_shadows_userId_createdAt_idx" ON "onboarding_photo_preview_pool_shadows"("userId", "createdAt" DESC);

CREATE INDEX "onboarding_photo_preview_pool_shadows_shadowType_createdAt_idx" ON "onboarding_photo_preview_pool_shadows"("shadowType", "createdAt" DESC);

CREATE INDEX "onboarding_photo_preview_pool_shadows_poolId_idx" ON "onboarding_photo_preview_pool_shadows"("poolId");

ALTER TABLE "onboarding_photo_preview_pool_shadows" ADD CONSTRAINT "onboarding_photo_preview_pool_shadows_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "onboarding_photo_preview_pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "onboarding_photo_preview_pool_shadows" ADD CONSTRAINT "onboarding_photo_preview_pool_shadows_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
