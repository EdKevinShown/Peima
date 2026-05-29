-- M3.8-M11: finalize-with-pairwise sidecar (no MatchResult.candidateUserId / no finalScore changes).
CREATE TABLE "pairwise_pool_finalize_meta" (
    "id" TEXT NOT NULL,
    "viewerUserId" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "pairwiseJobId" TEXT NOT NULL,
    "meta" JSONB NOT NULL,
    "frozen" BOOLEAN NOT NULL DEFAULT false,
    "frozenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pairwise_pool_finalize_meta_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pairwise_pool_finalize_meta_viewerUserId_poolId_key" ON "pairwise_pool_finalize_meta"("viewerUserId", "poolId");

ALTER TABLE "pairwise_pool_finalize_meta" ADD CONSTRAINT "pairwise_pool_finalize_meta_viewerUserId_fkey" FOREIGN KEY ("viewerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
