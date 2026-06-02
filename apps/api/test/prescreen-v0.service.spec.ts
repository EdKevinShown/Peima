import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { UserProfile } from "@peima/database";
import * as staticSummaryMod from "../src/modules/match-review-ai/match-review-static-summary";
import type { QuestionnaireProfileView } from "../src/modules/questionnaire/questionnaire.service";
import { QuestionnaireService } from "../src/modules/questionnaire/questionnaire.service";
import type { MatchReviewStaticSummaryPayload } from "../src/modules/match-review-ai/match-review-ai.types";
import { PrescreenV0Service } from "../src/modules/prescreen-v0/prescreen-v0.service";
import { PRESCREEN_V0_SCHEMA } from "../src/modules/prescreen-v0/prescreen-v0.types";

function emptyDominants(): Record<string, string | null> {
  const o: Record<string, string | null> = {};
  for (let i = 1; i <= 20; i += 1) o[String(i)] = null;
  return o;
}

function baseProfile(scalar: number): UserProfile {
  return {
    attachmentStyle: scalar,
    emotionalExpression: scalar,
    communicationStyle: scalar,
    conflictHandling: scalar,
    loveLanguage: scalar,
    securityNeed: scalar,
    controlNeed: scalar,
    independence: scalar,
    loyaltyView: scalar,
    jealousyTendency: scalar,
    moneyAttitude: scalar,
    careerPriority: scalar,
    lifePace: scalar,
    socialNeed: scalar,
    emotionalStability: scalar,
    sexualValues: scalar,
    familyView: scalar,
    marriageExpectation: scalar,
    childrenIntent: scalar,
    riskPreference: scalar,
  } as unknown as UserProfile;
}

function profileWithChildrenIntent(scalar: number, childrenIntent: number): UserProfile {
  return { ...baseProfile(scalar), childrenIntent } as UserProfile;
}

function baseProfileView(profile: UserProfile): QuestionnaireProfileView {
  return {
    profile,
    dimensionBranchProfiles: {},
    byDimensionBranchScores: {},
    dominantBranches: emptyDominants(),
    uncertainBranchesByAxis: {},
    labels: { primary: null, candidates: [], styleLabels: [], rareLabel: null },
    displayPrimary: {
      id: "x",
      name: "测试主标签",
      ruleTokens: [],
      matchedAxes: [],
      source: "fallback",
    },
    overallExplanation: { title: "T", paragraph: "P" },
  };
}

function summary(F: number, R: number): MatchReviewStaticSummaryPayload {
  return {
    majorFits: Array.from({ length: F }, (_, i) => `fit-${i}`),
    majorRisks: Array.from({ length: R }, (_, i) => `risk-${i}`),
    dimensionHighlights: [],
    labelFitSummary: "主展示标签：测试",
    confidenceSummary: "c",
  };
}

describe("PrescreenV0Service", () => {
  let service: PrescreenV0Service;
  let questionnaire: { getProfileForUser: jest.Mock };

  beforeEach(async () => {
    questionnaire = {
      getProfileForUser: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        PrescreenV0Service,
        { provide: QuestionnaireService, useValue: questionnaire },
      ],
    }).compile();
    service = moduleRef.get(PrescreenV0Service);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("rejects more than 200 candidates after dedupe", async () => {
    const ids = Array.from({ length: 201 }, (_, i) => `u${i}`);
    await expect(
      service.prescreenBatch({
        schemaVersion: PRESCREEN_V0_SCHEMA,
        viewerUserId: "v",
        candidateUserIds: ids,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("drops candidates without questionnaire profile (NotFound) and does not fail the batch", async () => {
    const spy = jest.spyOn(staticSummaryMod, "buildMatchReviewStaticSummary").mockImplementation(() => ({
      reviewStaticScore: 70,
      staticSummary: summary(3, 0),
    }));

    questionnaire.getProfileForUser.mockImplementation(async (uid: string) => {
      if (uid === "viewer") return baseProfileView(baseProfile(0.7));
      if (uid === "ok") return baseProfileView(baseProfile(0.7));
      throw new NotFoundException(`Profile for user ${uid} not found`);
    });

    const out = await service.prescreenBatch({
      schemaVersion: PRESCREEN_V0_SCHEMA,
      viewerUserId: "viewer",
      candidateUserIds: ["missing", "ok"],
      purpose: "shadow",
    });

    expect(out.results).toHaveLength(1);
    expect(out.results[0].candidateUserId).toBe("ok");
    expect(out.debug.droppedCandidates).toEqual([
      { candidateUserId: "missing", dropReason: "profile_not_found" },
    ]);
    spy.mockRestore();
  });

  it("returns promote, neutral, and demote in one batch (rule chain, no LLM)", async () => {
    const spy = jest
      .spyOn(staticSummaryMod, "buildMatchReviewStaticSummary")
      .mockImplementation((_v, cand) => {
        const m = (cand.profile as UserProfile).childrenIntent;
        if (Math.abs((m ?? 0) - 0.111) < 1e-6) {
          return { reviewStaticScore: 70, staticSummary: summary(3, 0) };
        }
        if (Math.abs((m ?? 0) - 0.222) < 1e-6) {
          return { reviewStaticScore: 50, staticSummary: summary(2, 2) };
        }
        if (Math.abs((m ?? 0) - 0.333) < 1e-6) {
          return { reviewStaticScore: 30, staticSummary: summary(0, 5) };
        }
        return { reviewStaticScore: 50, staticSummary: summary(2, 2) };
      });

    questionnaire.getProfileForUser.mockImplementation(async (uid: string) => {
      if (uid === "viewer") return baseProfileView(baseProfile(0.7));
      if (uid === "p") return baseProfileView(profileWithChildrenIntent(0.7, 0.111));
      if (uid === "n") return baseProfileView(profileWithChildrenIntent(0.7, 0.222));
      if (uid === "d") return baseProfileView(profileWithChildrenIntent(0.7, 0.333));
      throw new NotFoundException("no");
    });

    const out = await service.prescreenBatch({
      schemaVersion: PRESCREEN_V0_SCHEMA,
      viewerUserId: "viewer",
      candidateUserIds: ["n", "d", "p"],
      purpose: "preview_pool_hint",
    });

    const byId = Object.fromEntries(out.results.map((r) => [r.candidateUserId, r]));
    expect(byId.p.bucket).toBe("promote");
    expect(byId.n.bucket).toBe("neutral");
    expect(byId.d.bucket).toBe("demote");
    expect(out.purpose).toBe("preview_pool_hint");
    expect(out.results[0].bucket).toBe("promote");
    for (const r of out.results) {
      expect(r.reasonCodes.length).toBeLessThanOrEqual(4);
      expect(r.reasonCodes.every((c) => typeof c === "string" && !c.includes(" "))).toBe(true);
    }
    spy.mockRestore();
  });
});
