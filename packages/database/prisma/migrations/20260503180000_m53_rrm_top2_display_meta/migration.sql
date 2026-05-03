-- M5.3-C1: RRM Top2 display meta sidecar (parallel to MatchResult; no backfill).

CREATE TABLE "match_result_rrm_top2_display_meta" (
    "id" TEXT NOT NULL,
    "matchResultId" TEXT NOT NULL,
    "viewerUserId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "top2Fingerprint" TEXT,
    "frozen" BOOLEAN NOT NULL DEFAULT true,
    "frozenAt" TIMESTAMP(3),
    "meta" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "match_result_rrm_top2_display_meta_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "match_result_rrm_top2_display_meta_matchResultId_key" ON "match_result_rrm_top2_display_meta"("matchResultId");

CREATE INDEX "match_result_rrm_top2_display_meta_viewerUserId_idx" ON "match_result_rrm_top2_display_meta"("viewerUserId");

CREATE INDEX "match_result_rrm_top2_display_meta_frozen_updatedAt_idx" ON "match_result_rrm_top2_display_meta"("frozen", "updatedAt");

ALTER TABLE "match_result_rrm_top2_display_meta" ADD CONSTRAINT "match_result_rrm_top2_display_meta_matchResultId_fkey" FOREIGN KEY ("matchResultId") REFERENCES "match_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "match_result_rrm_top2_display_meta" ADD CONSTRAINT "match_result_rrm_top2_display_meta_viewerUserId_fkey" FOREIGN KEY ("viewerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
