/**
 * P7.5-r4-o2: privacy-safe rows for auditing the active onboarding photo preview pool (dev/staging).
 */

import { slugForImportFilename } from "../dev/p75-r4-h-candidate-image-import.plan";
import { maskPreviewUserId } from "./onboarding-photo-preview-pool-funnel.audit";
import {
  previewPoolRowDisplaySourceKey,
  r4hSlugFromDisplaySourceKey,
} from "./onboarding-photo-preview-display-image-key";
import {
  candidatePassesOppositeBinaryGate,
  isStrictBinaryPreviewGender,
  normalizeUserGenderForPreview,
} from "./onboarding-preview-gender";

export type ActivePoolAuditItemRow = {
  pool_id_masked: string;
  viewer_user_id_masked: string;
  viewer_gender_raw: string | null;
  viewer_gender_normalized: string;
  rank_in_pool: number;
  tier: string;
  display_mode: string;
  candidate_user_id_masked: string;
  candidate_gender_raw: string | null;
  /** Never emits full URL — only whether a portable URL exists for non-hidden items. */
  image_url_present: boolean;
  image_url_redacted: true;
  source_image_key: string;
  is_viewer_self: boolean;
  violates_opposite_gender_gate: boolean;
  duplicate_candidate_user_id: boolean;
  duplicate_image_source_key: boolean;
  mapping_file: string | null;
  mapping_gender: string | null;
};

export type ActivePoolAuditReport = {
  pool_id_masked: string;
  viewer_user_id_masked: string;
  viewer_gender_raw: string | null;
  viewer_gender_normalized: string;
  viewer_binary_for_gate: "male" | "female" | null;
  pool_status: string | null;
  pool_item_count: number;
  items: ActivePoolAuditItemRow[];
  notes: string[];
};

function mappingMatchFromSlug(
  slug: string | null,
  mappingItems: Array<{ file: string; gender?: string }>,
): { mapping_file: string | null; mapping_gender: string | null } {
  if (!slug) return { mapping_file: null, mapping_gender: null };
  for (const it of mappingItems) {
    const stem = slugForImportFilename(it.file);
    if (stem === slug) {
      return {
        mapping_file: it.file,
        mapping_gender: typeof it.gender === "string" ? it.gender : null,
      };
    }
  }
  return { mapping_file: null, mapping_gender: null };
}

export function buildActivePoolAuditReport(input: {
  viewerUserId: string;
  viewerGenderRaw: string | null;
  pool: { id: string; status: string } | null;
  items: Array<{
    rankInPool: number;
    tier: string;
    displayMode: string;
    candidateUserId: string;
    candidateGenderRaw: string | null;
    firstImageUrl: string | null;
  }>;
  mappingItems: Array<{ file: string; gender?: string }>;
}): ActivePoolAuditReport {
  const notes: string[] = [];
  const vNorm = normalizeUserGenderForPreview(input.viewerGenderRaw);
  const vBin = isStrictBinaryPreviewGender(vNorm) ? vNorm : null;
  if (!input.pool) {
    notes.push("no_active_onboarding_photo_preview_pool");
  }
  if (!vBin) {
    notes.push("viewer_not_strict_binary_gender_gate_skipped_for_violation_flag");
  }

  const idCounts = new Map<string, number>();
  const keyCounts = new Map<string, number>();
  for (const it of input.items) {
    idCounts.set(it.candidateUserId, (idCounts.get(it.candidateUserId) ?? 0) + 1);
    const sourceKey = previewPoolRowDisplaySourceKey({
      id: it.candidateUserId,
      firstImageUrl: it.firstImageUrl,
    });
    keyCounts.set(sourceKey, (keyCounts.get(sourceKey) ?? 0) + 1);
  }

  const items: ActivePoolAuditItemRow[] = input.items.map((it) => {
    const sourceKey = previewPoolRowDisplaySourceKey({
      id: it.candidateUserId,
      firstImageUrl: it.firstImageUrl,
    });
    const slug = r4hSlugFromDisplaySourceKey(sourceKey);
    const mapHit = mappingMatchFromSlug(slug, input.mappingItems);
    const imagePresent =
      it.displayMode !== "hidden" &&
      typeof it.firstImageUrl === "string" &&
      it.firstImageUrl.trim() !== "";

    const isSelf = it.candidateUserId === input.viewerUserId;
    const violates =
      vBin !== null &&
      !candidatePassesOppositeBinaryGate(vBin, it.candidateGenderRaw);

    return {
      pool_id_masked: input.pool ? maskPreviewUserId(input.pool.id) : "(none)",
      viewer_user_id_masked: maskPreviewUserId(input.viewerUserId),
      viewer_gender_raw: input.viewerGenderRaw,
      viewer_gender_normalized: vNorm,
      rank_in_pool: it.rankInPool,
      tier: it.tier,
      display_mode: it.displayMode,
      candidate_user_id_masked: maskPreviewUserId(it.candidateUserId),
      candidate_gender_raw: it.candidateGenderRaw,
      image_url_present: imagePresent,
      image_url_redacted: true,
      source_image_key: sourceKey,
      is_viewer_self: isSelf,
      violates_opposite_gender_gate: violates,
      duplicate_candidate_user_id: (idCounts.get(it.candidateUserId) ?? 0) > 1,
      duplicate_image_source_key: (keyCounts.get(sourceKey) ?? 0) > 1,
      mapping_file: mapHit.mapping_file,
      mapping_gender: mapHit.mapping_gender,
    };
  });

  return {
    pool_id_masked: input.pool ? maskPreviewUserId(input.pool.id) : "(none)",
    viewer_user_id_masked: maskPreviewUserId(input.viewerUserId),
    viewer_gender_raw: input.viewerGenderRaw,
    viewer_gender_normalized: vNorm,
    viewer_binary_for_gate: vBin,
    pool_status: input.pool?.status ?? null,
    pool_item_count: input.items.length,
    items,
    notes,
  };
}
