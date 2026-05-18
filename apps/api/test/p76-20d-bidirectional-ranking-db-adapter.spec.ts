import type { PrismaClient } from "@peima/database";
import {
  assertP76TwentyDAuditReportPrivacySafe,
  buildTwentyDCandidateInputV1,
  buildTwentyDInputV1FromLoadedContext,
  loadP76TwentyDContext,
  runTwentyDBidirectionalRankingAuditFromDb,
  type P76TwentyDLoadedContext,
} from "../src/modules/matching/p76-20d-bidirectional-ranking-db-adapter";
import {
  hasMeaningfulP76Profile,
  toP76UserProfileLike,
} from "../src/modules/matching/p76-20d-bidirectional-ranking-profile-score";

function profileWithOneDim(): ReturnType<typeof toP76UserProfileLike> {
  return toP76UserProfileLike({ attachmentStyle: 0.6 });
}

function mockLoadedContext(
  overrides: Partial<P76TwentyDLoadedContext> = {},
): P76TwentyDLoadedContext {
  const viewerProfile = profileWithOneDim();
  return {
    viewerUserId: "viewer-1",
    candidateUserIds: ["cand-1"],
    sourcePoolType: "onboarding_gated_cohort",
    stage1SourceVersion: "p7.6-r3-photovisual-first-pool-shadow-v1",
    viewerProfilePresent: true,
    viewerPref: {
      minAge: 25,
      maxAge: 35,
      preferredCities: ["上海"],
      minHeight: 160,
      maxHeight: 190,
      educationPreferences: [],
      occupationPreferences: [],
      relationshipGoalPreferences: [],
      styleTags: [],
    },
    viewerProfile,
    viewerUser: {
      age: 28,
      city: "上海",
      height: 175,
      education: "本科",
      occupation: "工程师",
      relationshipGoal: "长期",
    },
    candidates: [
      {
        candidateUserId: "cand-1",
        candidateUser: {
          age: 30,
          city: "上海",
          height: 170,
          education: "硕士",
          occupation: "设计师",
          relationshipGoal: "长期",
        },
        viewerPrefForAtoB: {
          minAge: 25,
          maxAge: 35,
          preferredCities: ["上海"],
          minHeight: 160,
          maxHeight: 190,
          educationPreferences: [],
          occupationPreferences: [],
          relationshipGoalPreferences: [],
          styleTags: [],
        },
        candidatePrefForBtoA: null,
        viewerProfile,
        candidateProfile: profileWithOneDim(),
        viewerUser: {
          age: 28,
          city: "上海",
          height: 175,
          education: "本科",
          occupation: "工程师",
          relationshipGoal: "长期",
        },
      },
    ],
    ...overrides,
  };
}

describe("p76 20d bidirectional ranking db adapter", () => {
  it("viewer and candidate profile scores normalize", () => {
    const input = buildTwentyDCandidateInputV1(mockLoadedContext().candidates[0]!);
    expect(input.profileScoreAtoB).toBeGreaterThan(0);
    expect(input.profileScoreAtoB).toBeLessThanOrEqual(1);
    expect(input.profileScoreBtoA).toBeGreaterThan(0);
    expect(input.preferenceScoreAtoB).toBeGreaterThan(0);
    expect(input.preferenceScoreBtoA).toBeNull();
  });

  it("candidate missing profile → profile scores null", () => {
    const ctx = mockLoadedContext();
    ctx.candidates[0]!.candidateProfile = null;
    const input = buildTwentyDCandidateInputV1(ctx.candidates[0]!);
    expect(input.profileScoreAtoB).toBeNull();
    expect(input.profileScoreBtoA).toBeNull();
  });

  it("viewer missing profile → viewerProfilePresent false in pool input", () => {
    const ctx = mockLoadedContext({
      viewerProfilePresent: false,
      viewerProfile: null,
    });
    const poolInput = buildTwentyDInputV1FromLoadedContext(
      ctx,
      "2026-05-16T00:00:00.000Z",
      6,
    );
    expect(poolInput.viewerProfilePresent).toBe(false);
  });

  it("preference missing → preferenceScore null", () => {
    const ctx = mockLoadedContext();
    ctx.candidates[0]!.viewerPrefForAtoB = null;
    const input = buildTwentyDCandidateInputV1(ctx.candidates[0]!);
    expect(input.preferenceScoreAtoB).toBeNull();
  });

  it("hasMeaningfulP76Profile false for empty profile row", () => {
    expect(hasMeaningfulP76Profile(toP76UserProfileLike({}))).toBe(false);
    expect(hasMeaningfulP76Profile(profileWithOneDim())).toBe(true);
  });

  it("audit report privacy: blocks sensitive profile json keys", () => {
    expect(() =>
      assertP76TwentyDAuditReportPrivacySafe({
        shadow: { dimensionBranchChatHints: {} },
      }),
    ).toThrow(/sensitive field/);
  });

  it("loadP76TwentyDContext uses findUnique / findMany only", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "viewer-1",
          age: 28,
          city: "上海",
          height: 175,
          education: "本科",
          occupation: "工程师",
          relationshipGoal: "长期",
          preference: { minAge: 25, maxAge: 35, preferredCities: ["上海"] },
          relationProfile: { attachmentStyle: 0.5 },
        }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: "cand-1",
            age: 30,
            city: "上海",
            height: 170,
            education: "硕士",
            occupation: "设计师",
            relationshipGoal: "长期",
            preference: null,
            relationProfile: { attachmentStyle: 0.7 },
          },
        ]),
        create: jest.fn(),
        update: jest.fn(),
      },
      userPreference: {
        create: jest.fn(),
        update: jest.fn(),
      },
      userProfile: {
        create: jest.fn(),
        update: jest.fn(),
      },
    } as unknown as PrismaClient;

    const ctx = await loadP76TwentyDContext(prisma, {
      viewerUserId: "viewer-1",
      candidateUserIds: ["cand-1"],
      sourcePoolType: "onboarding_gated_cohort",
      stage1SourceVersion: "p7.6-r3-photovisual-first-pool-shadow-v1",
    });

    expect(ctx.viewerProfilePresent).toBe(true);
    expect(ctx.candidates).toHaveLength(1);
    expect(prisma.user.findUnique).toHaveBeenCalled();
    expect(prisma.user.findMany).toHaveBeenCalled();
    expect((prisma.user as unknown as { create: jest.Mock }).create).not.toHaveBeenCalled();
    expect(
      (prisma.userProfile as unknown as { update: jest.Mock }).update,
    ).not.toHaveBeenCalled();
  });

  it("runTwentyDBidirectionalRankingAuditFromDb with empty candidates does not throw", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "viewer-1",
          age: 28,
          city: "",
          height: null,
          education: "",
          occupation: "",
          relationshipGoal: "",
          preference: null,
          relationProfile: { attachmentStyle: 0.5 },
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaClient;

    const report = await runTwentyDBidirectionalRankingAuditFromDb(prisma, {
      viewerUserId: "viewer-1",
      candidateUserIds: [],
      sourcePoolType: "onboarding_gated_cohort",
      topN: 6,
      stage1SourceVersion: "p7.6-r3-photovisual-first-pool-shadow-v1",
      dryRun: true,
    });

    expect(report.scannedCandidates).toBe(0);
    expect(report.applied).toBe(false);
    expect(report.dryRun).toBe(true);
  });
});
