import type { PrismaClient } from "@peima/database";
import {
  assertP76RrmTop2AuditReportPrivacySafe,
  buildRrmTop2CandidateInputV1,
  loadP76RrmTop2Context,
  runRrmTop2FinalSelectorAuditFromDb,
  type P76RrmTop2LoadedContext,
} from "../src/modules/matching/p76-rrm-top2-final-selector-db-adapter";
import {
  clampRrmRhythmUnit,
  computeRhythmCompatibilityP76,
  hasMeaningfulP76RrmProfile,
  toP76RrmRhythmProfileLike,
} from "../src/modules/matching/p76-rrm-top2-rhythm-profile";

function rhythmProfile(
  overrides: Partial<Record<string, number>> = {},
): ReturnType<typeof toP76RrmRhythmProfileLike> {
  return toP76RrmRhythmProfileLike({
    relationshipPace: 0.5,
    initiativeLevel: 0.5,
    conflictResponse: 0.5,
    emotionalExpression: 0.5,
    emotionalStability: 0.6,
    communicationStyle: 0.5,
    conflictHandling: 0.5,
    attachmentStyle: 0.5,
    securityNeed: 0.4,
    controlNeed: 0.4,
    independence: 0.5,
    socialNeed: 0.5,
    ...overrides,
  });
}

function mockLoadedContext(
  overrides: Partial<P76RrmTop2LoadedContext> = {},
): P76RrmTop2LoadedContext {
  const viewerProfile = rhythmProfile();
  return {
    viewerUserId: "viewer-1",
    top2CandidateIds: ["cand-a", "cand-b"] as [string, string],
    selectedBy20DOnlyCandidateId: "cand-a",
    sourcePoolType: "onboarding_gated_cohort",
    stage2SourceVersion: "p7.6-r4a-20d-bidirectional-ranking-shadow-v1",
    viewerRrmProfilePresent: true,
    viewerProfile,
    candidates: [
      {
        candidateUserId: "cand-a",
        candidateProfile: rhythmProfile({ relationshipPace: 0.52 }),
      },
      {
        candidateUserId: "cand-b",
        candidateProfile: rhythmProfile({ relationshipPace: 0.9 }),
      },
    ],
    ...overrides,
  };
}

describe("p76 rrm top2 final selector db adapter", () => {
  it("viewer and candidate rhythm scores normalize to 0–1", () => {
    const ctx = mockLoadedContext();
    const input = buildRrmTop2CandidateInputV1(ctx.viewerProfile!, ctx.candidates[0]!);
    expect(input.rhythmScoreAtoB).not.toBeNull();
    expect(input.rhythmScoreBtoA).not.toBeNull();
    expect(input.rhythmScoreAtoB!).toBeGreaterThanOrEqual(0);
    expect(input.rhythmScoreAtoB!).toBeLessThanOrEqual(1);
  });

  it("computeRhythmCompatibilityP76 clamps via clampRrmRhythmUnit", () => {
    const a = rhythmProfile()!;
    const b = rhythmProfile()!;
    const score = computeRhythmCompatibilityP76(a, b)!;
    expect(clampRrmRhythmUnit(score)).toBe(score);
  });

  it("viewer missing profile → viewerRrmProfilePresent false", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "viewer-1",
          relationProfile: null,
        }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: "cand-a",
            relationProfile: { relationshipPace: 0.5, emotionalStability: 0.6 },
          },
          {
            id: "cand-b",
            relationProfile: { relationshipPace: 0.5, emotionalStability: 0.6 },
          },
        ]),
      },
    } as unknown as PrismaClient;

    const ctx = await loadP76RrmTop2Context(prisma, {
      viewerUserId: "viewer-1",
      top2CandidateIds: ["cand-a", "cand-b"] as [string, string],
      selectedBy20DOnlyCandidateId: "cand-a",
      sourcePoolType: "onboarding_gated_cohort",
      stage2SourceVersion: "p7.6-r4a-20d-bidirectional-ranking-shadow-v1",
    });

    expect(ctx.viewerRrmProfilePresent).toBe(false);
  });

  it("candidate missing profile → rhythm scores null", () => {
    const ctx = mockLoadedContext();
    ctx.candidates[1]!.candidateProfile = null;
    const input = buildRrmTop2CandidateInputV1(ctx.viewerProfile!, ctx.candidates[1]!);
    expect(input.rhythmScoreAtoB).toBeNull();
    expect(input.rhythmScoreBtoA).toBeNull();
  });

  it("hasMeaningfulP76RrmProfile false for empty row", () => {
    expect(hasMeaningfulP76RrmProfile(toP76RrmRhythmProfileLike({}))).toBe(false);
    expect(hasMeaningfulP76RrmProfile(rhythmProfile())).toBe(true);
  });

  it("audit report privacy blocks sensitive profile json keys", () => {
    expect(() =>
      assertP76RrmTop2AuditReportPrivacySafe({
        shadow: { dimensionBranchChatHints: {} },
      }),
    ).toThrow(/sensitive field/);
  });

  it("loadP76RrmTop2Context uses findUnique / findMany only", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "viewer-1",
          relationProfile: { relationshipPace: 0.5, emotionalStability: 0.7 },
        }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: "cand-a",
            relationProfile: { relationshipPace: 0.55, emotionalStability: 0.6 },
          },
          {
            id: "cand-b",
            relationProfile: { relationshipPace: 0.8, emotionalStability: 0.6 },
          },
        ]),
        create: jest.fn(),
        update: jest.fn(),
      },
      userProfile: {
        create: jest.fn(),
        update: jest.fn(),
      },
    } as unknown as PrismaClient;

    const ctx = await loadP76RrmTop2Context(prisma, {
      viewerUserId: "viewer-1",
      top2CandidateIds: ["cand-a", "cand-b"] as [string, string],
      selectedBy20DOnlyCandidateId: "cand-a",
      sourcePoolType: "onboarding_gated_cohort",
      stage2SourceVersion: "p7.6-r4a-20d-bidirectional-ranking-shadow-v1",
    });

    expect(ctx.viewerRrmProfilePresent).toBe(true);
    expect(ctx.candidates).toHaveLength(2);
    expect(prisma.user.findUnique).toHaveBeenCalled();
    expect(prisma.user.findMany).toHaveBeenCalled();
    expect((prisma.user as unknown as { create: jest.Mock }).create).not.toHaveBeenCalled();
  });

  it("runRrmTop2FinalSelectorAuditFromDb end-to-end with mock prisma", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "viewer-1",
          relationProfile: {
            relationshipPace: 0.5,
            initiativeLevel: 0.5,
            emotionalStability: 0.7,
            communicationStyle: 0.5,
            conflictHandling: 0.5,
            attachmentStyle: 0.5,
            securityNeed: 0.4,
            controlNeed: 0.4,
            independence: 0.5,
            socialNeed: 0.5,
            conflictResponse: 0.5,
            emotionalExpression: 0.5,
          },
        }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: "cand-a",
            relationProfile: {
              relationshipPace: 0.52,
              initiativeLevel: 0.5,
              emotionalStability: 0.7,
              communicationStyle: 0.5,
              conflictHandling: 0.5,
              attachmentStyle: 0.5,
              securityNeed: 0.4,
              controlNeed: 0.4,
              independence: 0.5,
              socialNeed: 0.5,
              conflictResponse: 0.5,
              emotionalExpression: 0.5,
            },
          },
          {
            id: "cand-b",
            relationProfile: {
              relationshipPace: 0.9,
              initiativeLevel: 0.9,
              emotionalStability: 0.3,
              communicationStyle: 0.5,
              conflictHandling: 0.5,
              attachmentStyle: 0.5,
              securityNeed: 0.9,
              controlNeed: 0.9,
              independence: 0.2,
              socialNeed: 0.5,
              conflictResponse: 0.5,
              emotionalExpression: 0.5,
            },
          },
        ]),
      },
    } as unknown as PrismaClient;

    const report = await runRrmTop2FinalSelectorAuditFromDb(prisma, {
      viewerUserId: "viewer-1",
      top2CandidateIds: ["cand-a", "cand-b"] as [string, string],
      selectedBy20DOnlyCandidateId: "cand-a",
      sourcePoolType: "onboarding_gated_cohort",
      stage2SourceVersion: "p7.6-r4a-20d-bidirectional-ranking-shadow-v1",
      dryRun: true,
    });

    expect(report.applied).toBe(false);
    expect(report.evaluatedCandidates).toBe(2);
    expect(report.selectedByRrmCandidateId).toBeTruthy();
  });
});
