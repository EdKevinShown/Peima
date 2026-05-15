import {
  buildShadowCandidatesFromGatedRows,
  buildVisualRankingShadowV1,
} from "../src/modules/onboarding/vision/visual-ranking-shadow.builder";
import {
  evaluateOnboardingVisionApplyEligibility,
  evaluateApplyPoolBaselineGuards,
} from "../src/modules/onboarding/vision/onboarding-vision-apply-eligibility";
import type { OnboardingVisionApplyEnv } from "../src/modules/onboarding/vision/onboarding-vision-apply-env";
import { readOnboardingVisionApplyEnv } from "../src/modules/onboarding/vision/onboarding-vision-apply-env";
import type { VisualRankingShadowV1 } from "../src/modules/onboarding/vision/visual-ranking-shadow.types";
import { readOnboardingVisionEnv } from "../src/modules/onboarding/vision/onboarding-vision-env";

const baseVisionEnv = {
  ...readOnboardingVisionEnv({} as NodeJS.ProcessEnv),
  shadowEnabled: true,
};

const gatedRows = [
  {
    id: "a",
    createdAt: new Date("2020-01-01"),
    firstImageStyleTags: ["清爽自然"],
    age: 28,
    city: "上海",
    height: 170,
    education: "本科",
    occupation: "工程师",
    relationshipGoal: "认真恋爱",
  },
  {
    id: "b",
    createdAt: new Date("2020-02-01"),
    firstImageStyleTags: ["清爽自然", "生活感"],
    age: 28,
    city: "上海",
    height: 170,
    education: "本科",
    occupation: "工程师",
    relationshipGoal: "认真恋爱",
  },
  {
    id: "c",
    createdAt: new Date("2020-03-01"),
    firstImageStyleTags: ["生活感"],
    age: 28,
    city: "上海",
    height: 170,
    education: "本科",
    occupation: "工程师",
    relationshipGoal: "认真恋爱",
  },
  {
    id: "d",
    createdAt: new Date("2020-04-01"),
    firstImageStyleTags: ["成熟稳重"],
    age: 28,
    city: "上海",
    height: 170,
    education: "本科",
    occupation: "工程师",
    relationshipGoal: "认真恋爱",
  },
  {
    id: "e",
    createdAt: new Date("2020-05-01"),
    firstImageStyleTags: ["运动阳光"],
    age: 28,
    city: "上海",
    height: 170,
    education: "本科",
    occupation: "工程师",
    relationshipGoal: "认真恋爱",
  },
  {
    id: "f",
    createdAt: new Date("2019-01-01"),
    firstImageStyleTags: ["有个性"],
    age: 28,
    city: "上海",
    height: 170,
    education: "本科",
    occupation: "工程师",
    relationshipGoal: "认真恋爱",
  },
];

const fullViewerPref = {
  minAge: null,
  maxAge: null,
  preferredCities: [] as string[],
  minHeight: null,
  maxHeight: null,
  educationPreferences: [] as string[],
  occupationPreferences: [] as string[],
  relationshipGoalPreferences: [] as string[],
  styleTags: ["清爽自然", "生活感"],
};

function mkShadow(): VisualRankingShadowV1 {
  const candidates = buildShadowCandidatesFromGatedRows(gatedRows, new Map());
  return buildVisualRankingShadowV1({
    viewerUserId: "viewer-1",
    poolId: "pool-1",
    baselineItems: [
      { rankInPool: 1, tier: "aesthetic_fit", displayMode: "clear", candidateUserId: "a", score: 0.5 },
      { rankInPool: 2, tier: "aesthetic_fit", displayMode: "clear", candidateUserId: "b", score: 0.4 },
      { rankInPool: 3, tier: "aesthetic_fit", displayMode: "clear", candidateUserId: "c", score: 0.3 },
      { rankInPool: 4, tier: "style_similar", displayMode: "blurred", candidateUserId: "d", score: 0.2 },
      { rankInPool: 5, tier: "style_similar", displayMode: "blurred", candidateUserId: "e", score: 0.1 },
      { rankInPool: 6, tier: "reflow", displayMode: "hidden", candidateUserId: "f", score: 0.4 },
    ],
    viewerStyleTags: ["清爽自然", "生活感"],
    viewerPhotoVisualTags: null,
    viewerVisionAvailable: false,
    candidates,
    viewerPref: fullViewerPref,
    env: baseVisionEnv,
  });
}

function sixFemalePoolRows() {
  return ["a", "b", "c", "d", "e", "f"].map((id) => ({
    candidateUserId: id,
    candidateGenderRaw: "female",
    firstImageUrl: `https://cdn.example.test/u/${id}-r4h-u${id}--stem-${id}--.jpg`,
  }));
}

function applyEnv(partial: Partial<OnboardingVisionApplyEnv>): OnboardingVisionApplyEnv {
  const base = readOnboardingVisionApplyEnv({} as NodeJS.ProcessEnv);
  return { ...base, ...partial };
}

describe("evaluateApplyPoolBaselineGuards", () => {
  it("returns candidate_count_not_six when not 6 rows", () => {
    expect(
      evaluateApplyPoolBaselineGuards({
        viewerUserId: "v",
        viewerGenderRaw: "male",
        poolGuardRows: sixFemalePoolRows().slice(0, 3),
      }),
    ).toBe("candidate_count_not_six");
  });

  it("detects duplicate candidates", () => {
    const rows = sixFemalePoolRows();
    rows[5] = { ...rows[5]!, candidateUserId: "a" };
    expect(
      evaluateApplyPoolBaselineGuards({
        viewerUserId: "v",
        viewerGenderRaw: "male",
        poolGuardRows: rows,
      }),
    ).toBe("insufficient_unique_candidates");
  });

  it("detects duplicate source keys", () => {
    const rows = sixFemalePoolRows();
    rows[1] = { ...rows[1]!, firstImageUrl: rows[0]!.firstImageUrl };
    expect(
      evaluateApplyPoolBaselineGuards({
        viewerUserId: "v",
        viewerGenderRaw: "male",
        poolGuardRows: rows,
      }),
    ).toBe("insufficient_unique_source_images");
  });

  it("detects self candidate", () => {
    const rows = sixFemalePoolRows();
    rows[0] = { ...rows[0]!, candidateUserId: "viewer-1" };
    expect(
      evaluateApplyPoolBaselineGuards({
        viewerUserId: "viewer-1",
        viewerGenderRaw: "male",
        poolGuardRows: rows,
      }),
    ).toBe("self_candidate_guard");
  });

  it("detects gender violation (opposite gate)", () => {
    const rows = sixFemalePoolRows();
    rows[2] = { ...rows[2]!, candidateGenderRaw: "male" };
    expect(
      evaluateApplyPoolBaselineGuards({
        viewerUserId: "v",
        viewerGenderRaw: "male",
        poolGuardRows: rows,
      }),
    ).toBe("gender_violation_guard");
  });
});

describe("evaluateOnboardingVisionApplyEligibility (P7.5-r5-b)", () => {
  const shadow = mkShadow();
  const pool = sixFemalePoolRows();

  it("env_disabled when gate off", () => {
    const r = evaluateOnboardingVisionApplyEligibility({
      env: applyEnv({ applyToPoolEnabled: false }),
      viewerUserId: "viewer-1",
      visualRankingShadow: shadow,
      poolGuardRows: pool,
      viewerGenderRaw: "male",
    });
    expect(r.decision).toBe("not_eligible");
    expect(r.reason).toBe("env_disabled");
    expect(r.appliedToPool).toBe(false);
  });

  it("not_in_allowlist when allowlist non-empty and viewer missing", () => {
    const r = evaluateOnboardingVisionApplyEligibility({
      env: applyEnv({
        applyToPoolEnabled: true,
        allowlistUserIds: ["other-user"],
        applyPercent: 100,
      }),
      viewerUserId: "viewer-1",
      visualRankingShadow: shadow,
      poolGuardRows: pool,
      viewerGenderRaw: "male",
    });
    expect(r.reason).toBe("not_in_allowlist");
    expect(r.appliedToPool).toBe(false);
  });

  it("eligible_dry_run when allowlist hits (percent ignored)", () => {
    const r = evaluateOnboardingVisionApplyEligibility({
      env: applyEnv({
        applyToPoolEnabled: true,
        allowlistUserIds: ["viewer-1"],
        applyPercent: 0,
      }),
      viewerUserId: "viewer-1",
      visualRankingShadow: shadow,
      poolGuardRows: pool,
      viewerGenderRaw: "male",
    });
    expect(r.eligible).toBe(true);
    expect(r.decision).toBe("eligible_dry_run");
    expect(r.reason).toBe("ok");
    expect(r.appliedToPool).toBe(false);
  });

  it("percent_not_hit when allowlist empty and percent is 0", () => {
    const r = evaluateOnboardingVisionApplyEligibility({
      env: applyEnv({
        applyToPoolEnabled: true,
        allowlistUserIds: [],
        applyPercent: 0,
      }),
      viewerUserId: "viewer-1",
      visualRankingShadow: shadow,
      poolGuardRows: pool,
      viewerGenderRaw: "male",
    });
    expect(r.reason).toBe("percent_not_hit");
    expect(r.appliedToPool).toBe(false);
  });

  it("eligible_dry_run when allowlist empty and percent is 100", () => {
    const r = evaluateOnboardingVisionApplyEligibility({
      env: applyEnv({
        applyToPoolEnabled: true,
        allowlistUserIds: [],
        applyPercent: 100,
      }),
      viewerUserId: "viewer-1",
      visualRankingShadow: shadow,
      poolGuardRows: pool,
      viewerGenderRaw: "male",
    });
    expect(r.eligible).toBe(true);
    expect(r.reason).toBe("ok");
    expect(r.appliedToPool).toBe(false);
  });

  it("shadow_missing", () => {
    const r = evaluateOnboardingVisionApplyEligibility({
      env: applyEnv({ applyToPoolEnabled: true, applyPercent: 100 }),
      viewerUserId: "viewer-1",
      visualRankingShadow: null,
      poolGuardRows: pool,
      viewerGenderRaw: "male",
    });
    expect(r.reason).toBe("shadow_missing");
  });

  it("shadow_invalid when slots wrong length", () => {
    const bad = { ...shadow, slots: shadow.slots.slice(0, 3) };
    const r = evaluateOnboardingVisionApplyEligibility({
      env: applyEnv({ applyToPoolEnabled: true, applyPercent: 100 }),
      viewerUserId: "viewer-1",
      visualRankingShadow: bad as VisualRankingShadowV1,
      poolGuardRows: pool,
      viewerGenderRaw: "male",
    });
    expect(r.reason).toBe("shadow_invalid");
  });
});
