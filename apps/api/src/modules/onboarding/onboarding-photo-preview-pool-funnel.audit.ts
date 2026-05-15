/**
 * P7.5-r4-m: dev/test-only funnel audit for onboarding photo preview pool candidates.
 * Does not change `collectGatedCandidates` behavior; mirrors its filters for debugging.
 */

import type { UserPreference } from "@peima/database";
import {
  passesPreferenceHardGate,
  type PreferenceGateCandidate,
  type PreferenceGatePref,
} from "@peima/shared/matching/preference-hard-gate";
import { isUserImagePassingForOnboarding } from "./onboarding-photo-passing";
import {
  candidatePassesOppositeBinaryGate,
  isStrictBinaryPreviewGender,
  normalizeUserGenderForPreview,
  type PreviewGenderNorm,
} from "./onboarding-preview-gender";

export const PREVIEW_POOL_FUNNEL_MAX_SCAN_USERS = 10_000;

export type PreviewPoolFunnelImageRow = {
  createdAt: Date;
  detectionStatus: string;
  reviewStatus: string;
};

export type PreviewPoolFunnelUserRow = {
  id: string;
  createdAt: Date;
  age: number | null;
  city: string;
  height: number | null;
  education: string;
  occupation: string;
  relationshipGoal: string;
  gender: string | null;
  relationProfile: { id: string } | null;
  images: PreviewPoolFunnelImageRow[];
};

export type PreviewPoolFunnelDropReasons = {
  /** Non-viewer users with no UserImage rows. */
  no_user_image: number;
  /** Has ≥1 image but no RelationProfile row (collector baseWhere fails). */
  no_relation_profile: number;
  /** Base-eligible but fails `passesPreferenceHardGate` (same inputs as collector). */
  preference_hard_gate: number;
  /** Pref OK but fails opposite binary gender gate (includes unknown/other gender on candidate). */
  gender_not_opposite_binary: number;
};

export type PreviewPoolFunnelCounters = {
  total_users_in_db: number;
  non_viewer_users: number;
  non_viewer_with_at_least_one_image: number;
  /** Matches collector `baseWhere`: not viewer, images some, relationProfile present. */
  base_where_eligible: number;
  /**
   * Among base_where: onboarding-usable FIRST image (`createdAt` asc).
   * Informational — current collector does NOT filter on this before preference/gender gates.
   */
  base_where_first_image_onboarding_usable: number;
  base_where_first_image_not_onboarding_usable: number;
  after_preference_hard_gate: number;
  /** Same as onboarding `collectGatedCandidates` semantics (unbounded count from scan). */
  after_opposite_gender_gate_final: number;
  /** Non-viewer users in the scan window. */
  rows_scanned_non_viewer: number;
  scan_truncated: boolean;
};

/** Per-stage funnel counts keyed by normalized candidate `User.gender`. */
export type PreviewPoolGenderBucket = {
  male: number;
  female: number;
  unknown: number;
};

export type PreviewPoolFunnelReport = {
  viewer_id_masked: string;
  viewer_gender_normalized: PreviewGenderNorm;
  viewer_binary_for_gate: "male" | "female" | null;
  gate_pref: PreferenceGatePref | null;
  counters: PreviewPoolFunnelCounters;
  drop_reasons: PreviewPoolFunnelDropReasons;
  /** Scanned non-viewer users with ≥1 UserImage and non-null relation profile (`UserProfile`). */
  relation_profile_present_by_gender: PreviewPoolGenderBucket;
  base_where_eligible_by_gender: PreviewPoolGenderBucket;
  after_preference_hard_gate_by_gender: PreviewPoolGenderBucket;
  /** Uses same opposite-binary gate as onboarding; skips when viewer is not strict male/female. */
  after_opposite_gender_gate_final_by_gender: PreviewPoolGenderBucket;
  notes: string[];
};

export function maskPreviewUserId(id: string): string {
  if (!id || id.length <= 10) return "(masked)";
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

export function preferenceGatePrefFromUserPreference(
  row: UserPreference | null,
): PreferenceGatePref | null {
  if (!row) return null;
  return {
    minAge: row.minAge,
    maxAge: row.maxAge,
    preferredCities: row.preferredCities ?? [],
    minHeight: row.minHeight,
    maxHeight: row.maxHeight,
    educationPreferences: row.educationPreferences ?? [],
    occupationPreferences: row.occupationPreferences ?? [],
    relationshipGoalPreferences: row.relationshipGoalPreferences ?? [],
  };
}

function toGateCandidate(
  row: Pick<
    PreviewPoolFunnelUserRow,
    | "age"
    | "city"
    | "height"
    | "education"
    | "occupation"
    | "relationshipGoal"
  >,
): PreferenceGateCandidate {
  return {
    age: row.age,
    city: row.city,
    height: row.height,
    education: row.education,
    occupation: row.occupation,
    relationshipGoal: row.relationshipGoal,
  };
}

function emptyGenderBucket(): PreviewPoolGenderBucket {
  return { male: 0, female: 0, unknown: 0 };
}

function bumpGenderBucket(
  bucket: PreviewPoolGenderBucket,
  genderRaw: string | null | undefined,
): void {
  const n = normalizeUserGenderForPreview(genderRaw);
  if (n === "male") bucket.male += 1;
  else if (n === "female") bucket.female += 1;
  else bucket.unknown += 1;
}

/**
 * Aggregate funnel from scanned non-viewer user rows (same shape as audited Prisma chunk).
 */
export function foldPreviewPoolFunnelFromScannedUsers(args: {
  viewerUserId: string;
  viewerGenderRaw: string | null | undefined;
  gatePref: PreferenceGatePref | null;
  prefRowPresent: boolean;
  totals: Pick<
    PreviewPoolFunnelCounters,
    | "total_users_in_db"
    | "non_viewer_users"
    | "non_viewer_with_at_least_one_image"
  >;
  scannedUsersNonViewer: PreviewPoolFunnelUserRow[];
  scan_truncated: boolean;
}): PreviewPoolFunnelReport {
  const notes: string[] = [
    "No phone, email, reviewNote, or full detectionScoreJson in this report.",
    args.prefRowPresent
      ? "UserPreference row present → hard-gate dimensions from DB."
      : "No UserPreference row → hard-gate pref is null (pass-through for lists).",
    "First-image onboarding usability (passed/skipped/detection) is diagnostic; collector does NOT require it before preference + gender gates.",
  ];

  const viewerNorm = normalizeUserGenderForPreview(args.viewerGenderRaw);
  const viewerBinary = isStrictBinaryPreviewGender(viewerNorm)
    ? viewerNorm
    : null;

  const drop: PreviewPoolFunnelDropReasons = {
    no_user_image: 0,
    no_relation_profile: 0,
    preference_hard_gate: 0,
    gender_not_opposite_binary: 0,
  };

  const c: PreviewPoolFunnelCounters = {
    ...args.totals,
    base_where_eligible: 0,
    base_where_first_image_onboarding_usable: 0,
    base_where_first_image_not_onboarding_usable: 0,
    after_preference_hard_gate: 0,
    after_opposite_gender_gate_final: 0,
    rows_scanned_non_viewer: args.scannedUsersNonViewer.length,
    scan_truncated: args.scan_truncated,
  };

  if (!viewerBinary) {
    notes.push(
      "Viewer is not strict male/female → live generate() returns 400 before pool build; gender drop counts still use strict opposite-binary rule for candidates.",
    );
  }

  const relationProfilePresentByGender = emptyGenderBucket();
  const baseWhereEligibleByGender = emptyGenderBucket();
  const afterPreferenceByGender = emptyGenderBucket();
  const afterOppositeGenderFinalByGender = emptyGenderBucket();

  for (const u of args.scannedUsersNonViewer) {
    if (u.id === args.viewerUserId) continue;

    if (u.images.length > 0 && u.relationProfile) {
      bumpGenderBucket(relationProfilePresentByGender, u.gender);
    }

    if (u.images.length === 0) {
      drop.no_user_image += 1;
      continue;
    }
    if (!u.relationProfile) {
      drop.no_relation_profile += 1;
      continue;
    }

    c.base_where_eligible += 1;
    bumpGenderBucket(baseWhereEligibleByGender, u.gender);

    const firstImg = [...u.images].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    )[0]!;
    if (
      isUserImagePassingForOnboarding({
        detectionStatus: firstImg.detectionStatus,
        reviewStatus: firstImg.reviewStatus,
      })
    ) {
      c.base_where_first_image_onboarding_usable += 1;
    } else {
      c.base_where_first_image_not_onboarding_usable += 1;
    }

    if (!passesPreferenceHardGate(args.gatePref, toGateCandidate(u))) {
      drop.preference_hard_gate += 1;
      continue;
    }
    c.after_preference_hard_gate += 1;
    bumpGenderBucket(afterPreferenceByGender, u.gender);

    if (
      viewerBinary &&
      candidatePassesOppositeBinaryGate(viewerBinary, u.gender)
    ) {
      c.after_opposite_gender_gate_final += 1;
      bumpGenderBucket(afterOppositeGenderFinalByGender, u.gender);
    } else {
      drop.gender_not_opposite_binary += 1;
    }
  }

  return {
    viewer_id_masked: maskPreviewUserId(args.viewerUserId),
    viewer_gender_normalized: viewerNorm,
    viewer_binary_for_gate: viewerBinary,
    gate_pref: args.gatePref,
    counters: c,
    drop_reasons: drop,
    relation_profile_present_by_gender: relationProfilePresentByGender,
    base_where_eligible_by_gender: baseWhereEligibleByGender,
    after_preference_hard_gate_by_gender: afterPreferenceByGender,
    after_opposite_gender_gate_final_by_gender: afterOppositeGenderFinalByGender,
    notes,
  };
}

/** Safe `items[]` from parsed demo `mapping.json` (CLI / dev assets). */
export function getMappingItems(raw: unknown): unknown[] {
  if (!raw || typeof raw !== "object") return [];
  const items = (raw as { items?: unknown }).items;
  return Array.isArray(items) ? items : [];
}

/** Summarize gender distribution in demo `mapping.json` (items[].gender). */
export function summarizeDemoMappingGender(items: unknown[]): {
  total_items: number;
  male_items: number;
  female_items: number;
  invalid_gender_items: number;
  at_least_six_each_binary_gender: boolean;
} {
  let male_items = 0;
  let female_items = 0;
  let invalid_gender_items = 0;
  if (!Array.isArray(items)) {
    return {
      total_items: 0,
      male_items: 0,
      female_items: 0,
      invalid_gender_items: 0,
      at_least_six_each_binary_gender: false,
    };
  }
  for (const raw of items) {
    const o = raw as { gender?: unknown };
    const g =
      typeof o.gender === "string" ? o.gender.trim().toLowerCase() : "";
    const n = normalizeUserGenderForPreview(g);
    if (n === "male") male_items++;
    else if (n === "female") female_items++;
    else invalid_gender_items++;
  }
  return {
    total_items: items.length,
    male_items,
    female_items,
    invalid_gender_items,
    at_least_six_each_binary_gender:
      male_items >= 6 && female_items >= 6,
  };
}
