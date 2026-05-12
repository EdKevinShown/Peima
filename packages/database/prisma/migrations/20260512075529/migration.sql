-- AlterTable
ALTER TABLE "profile_update_suggestions" ALTER COLUMN "status" SET DEFAULT 'pending';

-- RenameIndex
ALTER INDEX "ai_pairwise_decision_jobs_viewer_pool_fp_version_status_idx" RENAME TO "ai_pairwise_decision_jobs_viewerUserId_poolId_shortlistFing_idx";

-- RenameIndex
ALTER INDEX "match_result_rrm_top2_display_hook_jobs_matchResultId_top2Finge" RENAME TO "match_result_rrm_top2_display_hook_jobs_matchResultId_top2F_key";

-- RenameIndex
ALTER INDEX "match_result_rrm_top2_display_hook_jobs_rrmSourceType_rrmSource" RENAME TO "match_result_rrm_top2_display_hook_jobs_rrmSourceType_rrmSo_idx";

-- RenameIndex
ALTER INDEX "profile_update_suggestions_user_conv_srcver_status_idx" RENAME TO "profile_update_suggestions_userId_sourceConversationId_sour_idx";
