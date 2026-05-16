/**
 * P7.5-r5-c2a: shadow hypothetical slots dedupe sourceImageKey (r4-o2 aligned).
 */

import { previewPoolRowDisplaySourceKey } from "../src/modules/onboarding/onboarding-photo-preview-display-image-key";
import {
  buildShadowCandidatesFromGatedRows,
  buildVisualRankingShadowV1,
} from "../src/modules/onboarding/vision/visual-ranking-shadow.builder";
import {
  evaluateOnboardingVisionApplyWriterDecision,
  type OnboardingVisionApplyWriterDecision,
} from "../src/modules/onboarding/vision/onboarding-vision-apply-writer-decision";
import {
  isShadowCandidateAvailableForPick,
  pickTopByScore,
} from "../src/modules/onboarding/vision/visual-ranking-shadow-scoring";
import { readOnboardingVisionEnv } from "../src/modules/onboarding/vision/onboarding-vision-env";
import { readOnboardingVisionApplyEnv } from "../src/modules/onboarding/vision/onboarding-vision-apply-env";

const baseEnv = {
  ...readOnboardingVisionEnv({} as NodeJS.ProcessEnv),
  shadowEnabled: true,
};

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

const dupR4hUrl = "https://cdn.example.test/u1-r4h-u1--kimono--.jpg";

function gatedRow(
  id: string,
  iso: string,
  firstImageUrl: string | null,
  styleTags = ["清爽自然"],
) {
  return {
    id,
    createdAt: new Date(iso),
    firstImageStyleTags: styleTags,
    firstImageUrl,
    age: 28,
    city: "上海",
    height: 170,
    education: "本科",
    occupation: "工程师",
    relationshipGoal: "认真恋爱",
  };
}

function sixBaselineItems(ids: string[]) {
  const tiers = [
    "aesthetic_fit",
    "aesthetic_fit",
    "aesthetic_fit",
    "style_similar",
    "style_similar",
    "reflow",
  ] as const;
  const display = ["clear", "clear", "clear", "blurred", "blurred", "hidden"] as const;
  return ids.map((candidateUserId, i) => ({
    rankInPool: i + 1,
    tier: tiers[i]!,
    displayMode: display[i]!,
    candidateUserId,
    score: 0.5 - i * 0.05,
  }));
}

function guardMapFromCandidates(
  candidates: ReturnType<typeof buildShadowCandidatesFromGatedRows>,
) {
  const m = new Map<
    string,
    {
      candidateUserId: string;
      candidateGenderRaw: string;
      firstImageUrl: string | null;
      firstImageReviewStatus: string;
    }
  >();
  for (const c of candidates) {
    const row = candidates.find((x) => x.userId === c.userId);
    m.set(c.userId, {
      candidateUserId: c.userId,
      candidateGenderRaw: "female",
      firstImageUrl: null,
      firstImageReviewStatus: "approved",
    });
    void row;
  }
  return m;
}

describe("P7.5-r5-c2a shadow sourceImageKey dedupe", () => {
  it("pickTopByScore excludes used source keys, not only user ids", () => {
    const dupKey = previewPoolRowDisplaySourceKey({
      id: "a",
      firstImageUrl: dupR4hUrl,
    });
    const pool = buildShadowCandidatesFromGatedRows(
      [
        gatedRow("a", "2020-01-01", dupR4hUrl),
        gatedRow("b", "2020-02-01", dupR4hUrl),
        gatedRow("c", "2020-03-01", "https://cdn/c-r4h-u3--dress--.jpg"),
      ],
      new Map(),
    );
    expect(pool[0]!.displaySourceKey).toBe(dupKey);
    expect(pool[1]!.displaySourceKey).toBe(dupKey);

    const usedIds = new Set<string>();
    const usedKeys = new Set<string>();
    const first = pickTopByScore(
      pool,
      usedIds,
      usedKeys,
      (c) => ({
        score: c.userId === "a" ? 1 : 0.5,
        reason: "vision_fallback_baseline",
        reasonTags: [],
      }),
      1,
    );
    expect(first).toHaveLength(1);
    expect(first[0]!.candidate.userId).toBe("a");
    usedIds.add("a");
    usedKeys.add(dupKey);

    const second = pickTopByScore(
      pool,
      usedIds,
      usedKeys,
      (c) => ({
        score: c.userId === "b" ? 1 : 0.5,
        reason: "vision_fallback_baseline",
        reasonTags: [],
      }),
      1,
    );
    expect(second).toHaveLength(1);
    expect(second[0]!.candidate.userId).toBe("c");
    expect(
      isShadowCandidateAvailableForPick(pool[1]!, usedIds, usedKeys),
    ).toBe(false);
  });

  it("buildVisualRankingShadowV1 shadow slots have unique displaySourceKeys when pool has dupes", () => {
    const rows = [
      gatedRow("a", "2020-01-01", dupR4hUrl, ["清爽自然", "生活感"]),
      gatedRow("b", "2020-02-01", dupR4hUrl, ["清爽自然", "生活感"]),
      gatedRow("c", "2020-03-01", "https://cdn/c-r4h-u3--dress--.jpg"),
      gatedRow("d", "2020-04-01", "https://cdn/d-r4h-u4--hat--.jpg"),
      gatedRow("e", "2020-05-01", "https://cdn/e-r4h-u5--coat--.jpg"),
      gatedRow("f", "2019-01-01", "https://cdn/f-r4h-u6--bag--.jpg"),
      gatedRow("g", "2018-01-01", "https://cdn/g-r4h-u7--shoe--.jpg"),
    ];
    const candidates = buildShadowCandidatesFromGatedRows(rows, new Map());
    const shadow = buildVisualRankingShadowV1({
      viewerUserId: "viewer-m",
      poolId: "pool-1",
      baselineItems: sixBaselineItems(["a", "b", "c", "d", "e", "f"]),
      viewerStyleTags: ["清爽自然", "生活感"],
      viewerPhotoVisualTags: null,
      viewerVisionAvailable: false,
      candidates,
      viewerPref: fullViewerPref,
      env: baseEnv,
    });

    expect(shadow.slots).toHaveLength(6);
    const keys = shadow.slots.map((s) => {
      const c = candidates.find((x) => x.userId === s.shadowCandidateUserId);
      return c!.displaySourceKey;
    });
    expect(new Set(keys).size).toBe(6);
    const ids = shadow.slots.map((s) => s.shadowCandidateUserId);
    expect(new Set(ids).size).toBe(shadow.slots.length);
    expect([ids.includes("a"), ids.includes("b")].filter(Boolean).length).toBe(1);
  });

  it("when only four unique source keys exist, shadow slots stay unique and writer refuses v2", () => {
    const rows = [
      gatedRow("a", "2020-01-01", dupR4hUrl),
      gatedRow("b", "2020-02-01", dupR4hUrl),
      gatedRow("c", "2020-03-01", "https://cdn/c-r4h-u3--dress--.jpg"),
      gatedRow("d", "2020-04-01", "https://cdn/d-r4h-u4--hat--.jpg"),
      gatedRow("e", "2020-05-01", "https://cdn/e-r4h-u5--coat--.jpg"),
      gatedRow("f", "2019-01-01", dupR4hUrl),
    ];
    const candidates = buildShadowCandidatesFromGatedRows(rows, new Map());
    const shadow = buildVisualRankingShadowV1({
      viewerUserId: "viewer-m",
      poolId: "pool-1",
      baselineItems: sixBaselineItems(["a", "b", "c", "d", "e", "f"]),
      viewerStyleTags: ["清爽自然"],
      viewerPhotoVisualTags: null,
      viewerVisionAvailable: false,
      candidates,
      viewerPref: fullViewerPref,
      env: baseEnv,
    });
    const keys = shadow.slots.map((s) => {
      const c = candidates.find((x) => x.userId === s.shadowCandidateUserId)!;
      return c.displaySourceKey;
    });
    expect(new Set(keys).size).toBe(shadow.slots.length);
    expect(new Set(keys).size).toBeLessThanOrEqual(4);
    expect(shadow.slots.length).toBeLessThanOrEqual(4);

    const guardRows = shadow.slots.map((s) => {
      const c = candidates.find((x) => x.userId === s.shadowCandidateUserId)!;
      return {
        candidateUserId: s.shadowCandidateUserId,
        candidateGenderRaw: "female",
        firstImageUrl: null,
        firstImageReviewStatus: "approved",
      };
    });
    const eligibility = {
      eligible: false,
      decision: "not_eligible" as const,
      reason: "shadow_invalid" as const,
      applySourceVersion: "onboarding-photo-preview-v2-vision",
      appliedToPool: false as const,
    };
    const writer = evaluateOnboardingVisionApplyWriterDecision({
      env: readOnboardingVisionApplyEnv({
        PEIMA_ONBOARDING_VISION_APPLY_TO_POOL: "1",
        PEIMA_ONBOARDING_VISION_APPLY_ALLOWLIST_USER_IDS: "viewer-m",
      } as NodeJS.ProcessEnv),
      viewerUserId: "viewer-m",
      viewerGenderRaw: "male",
      eligibility,
      visualRankingShadow: shadow,
      guardRowByCandidateId: guardMapFromCandidates(candidates),
    });
    expect(writer.shouldApply).toBe(false);
    expect(writer.reason).not.toBe("ok");
  });

  it("six unique source keys allow writer shouldApply when eligibility ok", () => {
    const rows = [
      gatedRow("a", "2020-01-01", "https://cdn/a-r4h-ua--kimono-a--.jpg"),
      gatedRow("b", "2020-02-01", "https://cdn/b-r4h-ub--kimono-b--.jpg"),
      gatedRow("c", "2020-03-01", "https://cdn/c-r4h-uc--dress-c--.jpg"),
      gatedRow("d", "2020-04-01", "https://cdn/d-r4h-ud--hat-d--.jpg"),
      gatedRow("e", "2020-05-01", "https://cdn/e-r4h-ue--coat-e--.jpg"),
      gatedRow("f", "2019-01-01", "https://cdn/f-r4h-uf--bag-f--.jpg"),
    ];
    const candidates = buildShadowCandidatesFromGatedRows(rows, new Map());
    const shadow = buildVisualRankingShadowV1({
      viewerUserId: "viewer-m",
      poolId: "pool-1",
      baselineItems: sixBaselineItems(["a", "b", "c", "d", "e", "f"]),
      viewerStyleTags: ["清爽自然", "生活感"],
      viewerPhotoVisualTags: null,
      viewerVisionAvailable: false,
      candidates,
      viewerPref: fullViewerPref,
      env: baseEnv,
    });
    const eligibility = {
      eligible: true,
      decision: "eligible_dry_run" as const,
      reason: "ok" as const,
      applySourceVersion: "onboarding-photo-preview-v2-vision",
      appliedToPool: false as const,
    };
    const writer: OnboardingVisionApplyWriterDecision =
      evaluateOnboardingVisionApplyWriterDecision({
        env: readOnboardingVisionApplyEnv({
          PEIMA_ONBOARDING_VISION_APPLY_TO_POOL: "1",
          PEIMA_ONBOARDING_VISION_APPLY_ALLOWLIST_USER_IDS: "viewer-m",
        } as NodeJS.ProcessEnv),
        viewerUserId: "viewer-m",
        viewerGenderRaw: "male",
        eligibility,
        visualRankingShadow: shadow,
        guardRowByCandidateId: new Map(
          candidates.map((c) => [
            c.userId,
            {
              candidateUserId: c.userId,
              candidateGenderRaw: "female",
              firstImageUrl: rows.find((r) => r.id === c.userId)!.firstImageUrl,
              firstImageReviewStatus: "approved",
            },
          ]),
        ),
      });
    expect(writer.shouldApply).toBe(true);
    expect(writer.reason).toBe("ok");
  });
});
