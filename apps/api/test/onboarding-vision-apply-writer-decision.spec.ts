import {
  buildShadowCandidatesFromGatedRows,
  buildVisualRankingShadowV1,
} from "../src/modules/onboarding/vision/visual-ranking-shadow.builder";
import {
  evaluateOnboardingVisionApplyEligibility,
  type OnboardingVisionApplyEligibilityOutcome,
} from "../src/modules/onboarding/vision/onboarding-vision-apply-eligibility";
import {
  evaluateOnboardingVisionApplyWriterDecision,
  isAllowedApplyPoolSourceVersion,
} from "../src/modules/onboarding/vision/onboarding-vision-apply-writer-decision";
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

function sixFemaleGuardMap() {
  const m = new Map<
    string,
    {
      candidateUserId: string;
      candidateGenderRaw: string | null;
      firstImageUrl: string | null;
      firstImageReviewStatus?: string | null;
    }
  >();
  for (const id of ["a", "b", "c", "d", "e", "f"]) {
    m.set(id, {
      candidateUserId: id,
      candidateGenderRaw: "female",
      firstImageUrl: `https://cdn.example.test/u/${id}-r4h-u${id}--stem-${id}--.jpg`,
      firstImageReviewStatus: "approved",
    });
  }
  return m;
}

function applyEnv(partial: Partial<OnboardingVisionApplyEnv>): OnboardingVisionApplyEnv {
  const base = readOnboardingVisionApplyEnv({} as NodeJS.ProcessEnv);
  return { ...base, ...partial };
}

function eligibleOutcome(): OnboardingVisionApplyEligibilityOutcome {
  return {
    eligible: true,
    decision: "eligible_dry_run",
    reason: "ok",
    applySourceVersion: "onboarding-photo-preview-v2-vision",
    appliedToPool: false,
  };
}

function evaluateWriter(
  partial: Partial<{
    env: OnboardingVisionApplyEnv;
    viewerUserId: string;
    eligibility: OnboardingVisionApplyEligibilityOutcome;
    shadow: VisualRankingShadowV1 | null;
    guardMap: Map<string, { candidateUserId: string; candidateGenderRaw: string | null; firstImageUrl: string | null; firstImageReviewStatus?: string | null }>;
  }>,
) {
  const shadow =
    partial.shadow === undefined ? mkShadow() : partial.shadow;
  const guardMap = partial.guardMap ?? sixFemaleGuardMap();
  return evaluateOnboardingVisionApplyWriterDecision({
    env:
      partial.env ??
      applyEnv({
        applyToPoolEnabled: true,
        allowlistUserIds: ["viewer-1"],
        applyPercent: 100,
        applySourceVersion: "onboarding-photo-preview-v2-vision",
      }),
    viewerUserId: partial.viewerUserId ?? "viewer-1",
    viewerGenderRaw: "male",
    eligibility: partial.eligibility ?? eligibleOutcome(),
    visualRankingShadow: shadow,
    guardRowByCandidateId: guardMap,
  });
}

describe("isAllowedApplyPoolSourceVersion", () => {
  it("allows default v2 vision version", () => {
    expect(isAllowedApplyPoolSourceVersion("onboarding-photo-preview-v2-vision")).toBe(
      true,
    );
  });

  it("rejects empty and v1", () => {
    expect(isAllowedApplyPoolSourceVersion("")).toBe(false);
    expect(isAllowedApplyPoolSourceVersion("onboarding-photo-preview-v1")).toBe(
      false,
    );
  });
});

describe("evaluateOnboardingVisionApplyWriterDecision (P7.5-r5-c1)", () => {
  it("env_disabled when gate off", () => {
    const r = evaluateWriter({
      env: applyEnv({ applyToPoolEnabled: false, allowlistUserIds: ["viewer-1"] }),
    });
    expect(r.shouldApply).toBe(false);
    expect(r.reason).toBe("env_disabled");
  });

  it("allowlist_empty even when percent=100", () => {
    const r = evaluateWriter({
      env: applyEnv({
        applyToPoolEnabled: true,
        allowlistUserIds: [],
        applyPercent: 100,
      }),
    });
    expect(r.shouldApply).toBe(false);
    expect(r.reason).toBe("allowlist_empty");
  });

  it("not_in_allowlist when viewer missing", () => {
    const r = evaluateWriter({
      env: applyEnv({
        applyToPoolEnabled: true,
        allowlistUserIds: ["other"],
        applyPercent: 100,
      }),
    });
    expect(r.reason).toBe("not_in_allowlist");
  });

  it("shouldApply true when allowlist hit and eligibility ok", () => {
    const r = evaluateWriter({});
    expect(r.shouldApply).toBe(true);
    expect(r.reason).toBe("ok");
    expect(r.applySourceVersion).toBe("onboarding-photo-preview-v2-vision");
  });

  it("eligibility_not_ok when dry-run not ok", () => {
    const r = evaluateWriter({
      eligibility: {
        eligible: false,
        decision: "not_eligible",
        reason: "shadow_missing",
        applySourceVersion: "onboarding-photo-preview-v2-vision",
        appliedToPool: false,
      },
    });
    expect(r.reason).toBe("eligibility_not_ok");
  });

  it("shadow_missing", () => {
    const r = evaluateWriter({ shadow: null });
    expect(r.reason).toBe("shadow_missing");
  });

  it("shadow_invalid when slots truncated", () => {
    const bad = { ...mkShadow(), slots: mkShadow().slots.slice(0, 3) };
    const r = evaluateWriter({ shadow: bad as VisualRankingShadowV1 });
    expect(r.reason).toBe("shadow_invalid");
  });

  it("insufficient_unique_candidates on shadow duplicate", () => {
    const shadow = mkShadow();
    shadow.slots[5] = {
      ...shadow.slots[5]!,
      shadowCandidateUserId: shadow.slots[0]!.shadowCandidateUserId,
    };
    const r = evaluateWriter({ shadow });
    expect(r.reason).toBe("insufficient_unique_candidates");
  });

  it("insufficient_unique_source_images on duplicate url", () => {
    const guardMap = sixFemaleGuardMap();
    guardMap.set("f", {
      ...guardMap.get("f")!,
      firstImageUrl: guardMap.get("a")!.firstImageUrl,
    });
    const r = evaluateWriter({ guardMap });
    expect(r.reason).toBe("insufficient_unique_source_images");
  });

  it("self_candidate_guard", () => {
    const shadow = mkShadow();
    shadow.slots[0] = {
      ...shadow.slots[0]!,
      shadowCandidateUserId: "viewer-1",
    };
    const guardMap = sixFemaleGuardMap();
    guardMap.set("viewer-1", {
      candidateUserId: "viewer-1",
      candidateGenderRaw: "male",
      firstImageUrl: "https://cdn.example.test/self.jpg",
    });
    const r = evaluateWriter({ shadow, guardMap });
    expect(r.reason).toBe("self_candidate_guard");
  });

  it("gender_violation_guard", () => {
    const guardMap = sixFemaleGuardMap();
    guardMap.set("c", {
      ...guardMap.get("c")!,
      candidateGenderRaw: "male",
    });
    const r = evaluateWriter({ guardMap });
    expect(r.reason).toBe("gender_violation_guard");
  });

  it("blocked_review_guard", () => {
    const guardMap = sixFemaleGuardMap();
    guardMap.set("d", {
      ...guardMap.get("d")!,
      firstImageReviewStatus: "rejected",
    });
    const r = evaluateWriter({ guardMap });
    expect(r.reason).toBe("blocked_review_guard");
  });

  it("invalid_apply_source_version", () => {
    const r = evaluateWriter({
      env: applyEnv({
        applyToPoolEnabled: true,
        allowlistUserIds: ["viewer-1"],
        applySourceVersion: "onboarding-photo-preview-v1",
      }),
    });
    expect(r.reason).toBe("invalid_apply_source_version");
  });

  it("dry-run eligibility still allows percent path but writer does not", () => {
    const env = applyEnv({
      applyToPoolEnabled: true,
      allowlistUserIds: [],
      applyPercent: 100,
    });
    const shadow = mkShadow();
    const pool = ["a", "b", "c", "d", "e", "f"].map((id) => ({
      candidateUserId: id,
      candidateGenderRaw: "female",
      firstImageUrl: `https://cdn.example.test/u/${id}.jpg`,
    }));
    const eligibility = evaluateOnboardingVisionApplyEligibility({
      env,
      viewerUserId: "viewer-1",
      visualRankingShadow: shadow,
      poolGuardRows: pool,
      viewerGenderRaw: "male",
    });
    expect(eligibility.reason).toBe("ok");
    const writer = evaluateOnboardingVisionApplyWriterDecision({
      env,
      viewerUserId: "viewer-1",
      viewerGenderRaw: "male",
      eligibility,
      visualRankingShadow: shadow,
      guardRowByCandidateId: sixFemaleGuardMap(),
    });
    expect(writer.shouldApply).toBe(false);
    expect(writer.reason).toBe("allowlist_empty");
  });
});
