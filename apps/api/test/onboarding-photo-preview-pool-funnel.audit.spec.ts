import type { PreferenceGatePref } from "@peima/shared/matching/preference-hard-gate";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  foldPreviewPoolFunnelFromScannedUsers,
  getMappingItems,
  maskPreviewUserId,
  summarizeDemoMappingGender,
  type PreviewPoolFunnelUserRow,
} from "../src/modules/onboarding/onboarding-photo-preview-pool-funnel.audit";

/** Mirrors dev-assets/test-user-images/mapping.json historical 6-binary layout (tests). */
const MAPPING_LIKE_ITEMS = [
  { gender: "female" },
  { gender: "male" },
  { gender: "female" },
  { gender: "male" },
  { gender: "female" },
  { gender: "male" },
];

function row(
  id: string,
  overrides: Partial<PreviewPoolFunnelUserRow> = {},
): PreviewPoolFunnelUserRow {
  const base: PreviewPoolFunnelUserRow = {
    id,
    createdAt: new Date("2020-01-01"),
    age: 26,
    city: "上海",
    height: 168,
    education: "本科",
    occupation: "学生",
    relationshipGoal: "认真恋爱",
    gender: "female",
    relationProfile: { id: "rp-1" },
    images: [
      {
        createdAt: new Date("2020-01-02"),
        detectionStatus: "passed",
        reviewStatus: "not_required",
      },
    ],
  };
  return { ...base, ...overrides };
}

describe("summarizeDemoMappingGender (mapping-shaped fixture)", () => {
  it("needs 6+ per binary for full both-way preview pool saturation from assets alone", () => {
    const s = summarizeDemoMappingGender(MAPPING_LIKE_ITEMS);
    expect(s.total_items).toBe(6);
    expect(s.male_items).toBe(3);
    expect(s.female_items).toBe(3);
    expect(s.invalid_gender_items).toBe(0);
    expect(s.at_least_six_each_binary_gender).toBe(false);
  });

  it("12 balanced fixtures satisfy at_least_six_each_binary_gender", () => {
    const twelve = [...MAPPING_LIKE_ITEMS, ...MAPPING_LIKE_ITEMS];
    const s = summarizeDemoMappingGender(twelve);
    expect(s.male_items).toBeGreaterThanOrEqual(6);
    expect(s.female_items).toBeGreaterThanOrEqual(6);
    expect(s.at_least_six_each_binary_gender).toBe(true);
  });

  it("repo mapping.json (P7.5-r4-o1): honest demo binary counts; female pool >=6 for male-viewer preview", () => {
    const fp = path.join(
      __dirname,
      "../../../dev-assets/test-user-images/mapping.json",
    );
    const raw = JSON.parse(fs.readFileSync(fp, "utf8"));
    const s = summarizeDemoMappingGender(getMappingItems(raw));
    expect(s.invalid_gender_items).toBe(0);
    expect(s.female_items).toBeGreaterThanOrEqual(6);
    expect(s.male_items).toBeGreaterThanOrEqual(1);
    expect(s.at_least_six_each_binary_gender).toBe(false);
    expect(typeof raw._devNote_r4o1).toBe("string");
  });
});

describe("getMappingItems (mapping.json shape)", () => {
  const zeroGenderSummary = {
    total_items: 0,
    male_items: 0,
    female_items: 0,
    invalid_gender_items: 0,
    at_least_six_each_binary_gender: false,
  };

  it.each([
    ["null root", null],
    ["non-object root", "string"],
    ["missing items", {}],
    ["items is object", { items: { not: "array" } }],
    ["items is string", { items: "nope" }],
  ])("%s → summarize gender counts all zero", (_label, raw) => {
    const items = getMappingItems(raw);
    expect(Array.isArray(items)).toBe(true);
    expect(summarizeDemoMappingGender(items)).toEqual(zeroGenderSummary);
  });

  it("array items forwarded unchanged for summarization", () => {
    const raw = { items: MAPPING_LIKE_ITEMS };
    expect(summarizeDemoMappingGender(getMappingItems(raw))).toEqual(
      summarizeDemoMappingGender(MAPPING_LIKE_ITEMS),
    );
  });
});

describe("foldPreviewPoolFunnelFromScannedUsers", () => {
  const totals = {
    total_users_in_db: 5,
    non_viewer_users: 6,
    non_viewer_with_at_least_one_image: 5,
  };

  it("male viewer retains opposite-binary females under base_where", () => {
    const passImg = {
      relationProfile: { id: "a" },
      images: [
        {
          createdAt: new Date(),
          detectionStatus: "passed",
          reviewStatus: "not_required",
        },
      ],
    };

    const scanned: PreviewPoolFunnelUserRow[] = [
      row("c-f1", { gender: "female", ...passImg }),
      row("c-f2", { gender: "female", ...passImg, id: "c-f2", relationProfile: { id: "b" } }),
      row("c-m1", {
        ...row("c-m1"),
        gender: "male",
        ...passImg,
        id: "c-m1",
        relationProfile: { id: "c" },
      }),
      row("c-x", {
        ...row("c-x"),
        gender: "other",
        ...passImg,
        id: "c-x",
        relationProfile: { id: "d" },
      }),
      row("c-nr", {
        ...passImg,
        gender: "female",
        relationProfile: null,
        id: "c-nr",
      }),
      row("c-ni", {
        ...row("c-ni"),
        gender: "female",
        relationProfile: { id: "e" },
        images: [],
        id: "c-ni",
      }),
    ];

    const r = foldPreviewPoolFunnelFromScannedUsers({
      viewerUserId: "viewer-1",
      viewerGenderRaw: "male",
      gatePref: null,
      prefRowPresent: false,
      totals,
      scannedUsersNonViewer: scanned,
      scan_truncated: false,
    });

    expect(r.counters.base_where_eligible).toBe(4);
    expect(r.drop_reasons.no_user_image).toBe(1);
    expect(r.drop_reasons.no_relation_profile).toBe(1);
    expect(r.counters.after_opposite_gender_gate_final).toBe(2);
    expect(r.drop_reasons.preference_hard_gate).toBe(0);
    expect(r.drop_reasons.gender_not_opposite_binary).toBe(2);
    expect(r.relation_profile_present_by_gender).toEqual({
      male: 1,
      female: 2,
      unknown: 1,
    });
    expect(r.base_where_eligible_by_gender).toEqual({
      male: 1,
      female: 2,
      unknown: 1,
    });
    expect(r.after_preference_hard_gate_by_gender).toEqual({
      male: 1,
      female: 2,
      unknown: 1,
    });
    expect(r.after_opposite_gender_gate_final_by_gender).toEqual({
      male: 0,
      female: 2,
      unknown: 0,
    });
  });

  it("preference_hard_gate rejects when city constrained", () => {
    const pref: PreferenceGatePref = {
      minAge: null,
      maxAge: null,
      preferredCities: ["广东"],
      minHeight: null,
      maxHeight: null,
      educationPreferences: [],
      occupationPreferences: [],
      relationshipGoalPreferences: [],
    };

    const r = foldPreviewPoolFunnelFromScannedUsers({
      viewerUserId: "viewer-2",
      viewerGenderRaw: "female",
      gatePref: pref,
      prefRowPresent: true,
      totals,
      scannedUsersNonViewer: [
        row("c1", {
          gender: "male",
          city: "上海",
          relationProfile: { id: "r" },
          images: row("noop").images,
          id: "c1",
        }),
      ],
      scan_truncated: false,
    });
    expect(r.counters.after_preference_hard_gate).toBe(0);
    expect(r.drop_reasons.preference_hard_gate).toBe(1);
    expect(r.after_preference_hard_gate_by_gender).toEqual({
      male: 0,
      female: 0,
      unknown: 0,
    });
  });

  it("viewer without binary gender: preference ok but counted as gender drop", () => {
    const r = foldPreviewPoolFunnelFromScannedUsers({
      viewerUserId: "v?",
      viewerGenderRaw: "",
      gatePref: null,
      prefRowPresent: false,
      totals,
      scannedUsersNonViewer: [
        row("c1", {
          gender: "male",
          relationProfile: { id: "r" },
          images: row("z").images,
          id: "c1",
        }),
      ],
      scan_truncated: false,
    });
    expect(r.viewer_binary_for_gate).toBeNull();
    expect(r.drop_reasons.gender_not_opposite_binary).toBe(1);
    expect(r.counters.after_preference_hard_gate).toBe(1);
    expect(r.counters.after_opposite_gender_gate_final).toBe(0);
    expect(r.after_preference_hard_gate_by_gender).toEqual({
      male: 1,
      female: 0,
      unknown: 0,
    });
    expect(r.after_opposite_gender_gate_final_by_gender).toEqual({
      male: 0,
      female: 0,
      unknown: 0,
    });
  });

  it("male viewer exposes >=6 females after_pref and after_final when seeded", () => {
    const females = Array.from({ length: 7 }, (_, i) =>
      row(`f-${i}`, { id: `f-${i}`, gender: "female", relationProfile: { id: `rf${i}` } }),
    );
    const males = Array.from({ length: 7 }, (_, i) =>
      row(`m-${i}`, { id: `m-${i}`, gender: "male", relationProfile: { id: `rm${i}` } }),
    );
    const r = foldPreviewPoolFunnelFromScannedUsers({
      viewerUserId: "v",
      viewerGenderRaw: "male",
      gatePref: null,
      prefRowPresent: false,
      totals: {
        total_users_in_db: 99,
        non_viewer_users: females.length + males.length,
        non_viewer_with_at_least_one_image: females.length + males.length,
      },
      scannedUsersNonViewer: [...females, ...males],
      scan_truncated: false,
    });
    expect(r.after_preference_hard_gate_by_gender.female).toBeGreaterThanOrEqual(6);
    expect(r.after_opposite_gender_gate_final_by_gender.female).toBeGreaterThanOrEqual(6);
    expect(r.after_preference_hard_gate_by_gender.male).toBe(7);
  });

  it("P7.5-r4-n2: exactly six female seeds meet male viewer opposite gate", () => {
    const females = Array.from({ length: 6 }, (_, i) =>
      row(`f-${i}`, { id: `f-${i}`, gender: "female", relationProfile: { id: `rf${i}` } }),
    );
    const r = foldPreviewPoolFunnelFromScannedUsers({
      viewerUserId: "v-male",
      viewerGenderRaw: "male",
      gatePref: null,
      prefRowPresent: false,
      totals: {
        total_users_in_db: 30,
        non_viewer_users: 6,
        non_viewer_with_at_least_one_image: 6,
      },
      scannedUsersNonViewer: females,
      scan_truncated: false,
    });
    expect(r.after_preference_hard_gate_by_gender.female).toBe(6);
    expect(r.after_opposite_gender_gate_final_by_gender.female).toBe(6);
  });

  it("female viewer exposes >=6 males after_pref and after_final when seeded", () => {
    const females = Array.from({ length: 7 }, (_, i) =>
      row(`f-${i}`, { id: `f-${i}`, gender: "female", relationProfile: { id: `rf${i}` } }),
    );
    const males = Array.from({ length: 7 }, (_, i) =>
      row(`m-${i}`, { id: `m-${i}`, gender: "male", relationProfile: { id: `rm${i}` } }),
    );
    const r = foldPreviewPoolFunnelFromScannedUsers({
      viewerUserId: "v",
      viewerGenderRaw: "female",
      gatePref: null,
      prefRowPresent: false,
      totals: {
        total_users_in_db: 99,
        non_viewer_users: females.length + males.length,
        non_viewer_with_at_least_one_image: females.length + males.length,
      },
      scannedUsersNonViewer: [...females, ...males],
      scan_truncated: false,
    });
    expect(r.after_preference_hard_gate_by_gender.male).toBeGreaterThanOrEqual(6);
    expect(r.after_opposite_gender_gate_final_by_gender.male).toBeGreaterThanOrEqual(6);
    expect(r.after_preference_hard_gate_by_gender.female).toBe(7);
  });
});

describe("maskPreviewUserId", () => {
  it("masks typical cuid-length ids", () => {
    expect(maskPreviewUserId("cmoc1gnil00006z64l9w2oa5t")).toMatch(/^cmoc…oa5t$/);
  });
});
