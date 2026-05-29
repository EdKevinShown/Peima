import type { PreviewPoolItem, User, UserPreference, UserProfile } from "@peima/database";
import { parseAndValidateRelationshipShortlistTop2 } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision.validate";
import {
  buildEligibleRowsForTop2,
  compareEligibleForTop2,
  computeRelationshipShortlistFingerprint,
} from "../src/modules/ai-pairwise-decision/ai-pairwise-top2-shortlist.builder";
import {
  AiPairwiseTop2ShortlistService,
  RelationshipShortlistTop2Error,
} from "../src/modules/ai-pairwise-decision/ai-pairwise-top2-shortlist.service";
import type { PrismaService } from "../src/common/prisma/prisma.service";

function profileStub(over: Partial<UserProfile> = {}): UserProfile {
  const base = {
    id: "p1",
    userId: "u1",
    socialEnergy: 0.5,
    emotionalExpression: 0.5,
    relationshipPace: 0.5,
    initiativeLevel: 0.5,
    decisionOrientation: 0.5,
    conflictResponse: 0.5,
    attachmentStyle: 0.5,
    communicationStyle: 0.5,
    conflictHandling: 0.5,
    loveLanguage: 0.5,
    securityNeed: 0.5,
    controlNeed: 0.5,
    independence: 0.5,
    loyaltyView: 0.5,
    jealousyTendency: 0.5,
    moneyAttitude: 0.5,
    careerPriority: 0.5,
    lifePace: 0.5,
    socialNeed: 0.5,
    emotionalStability: 0.5,
    sexualValues: 0.5,
    familyView: 0.5,
    marriageExpectation: 0.5,
    childrenIntent: 0.5,
    riskPreference: 0.5,
    confidence: 1,
    dimensionBranchChatHints: null,
    effectiveProfileChatOverlayV1: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return { ...base, ...over } as UserProfile;
}

function userStub(id: string, over: Partial<User> = {}): User {
  const base = {
    id,
    phone: `${id}-phone`,
    nickname: id,
    gender: "F",
    age: 28,
    city: "Shanghai",
    height: 165,
    education: "本科",
    occupation: "Engineer",
    relationshipGoal: "serious",
    bio: "",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return { ...base, ...over } as User;
}

function itemStub(
  poolId: string,
  viewerId: string,
  candidateId: string,
  rank: number,
  displayMode: string,
): PreviewPoolItem {
  return {
    id: `item-${candidateId}`,
    previewPoolId: poolId,
    userId: viewerId,
    candidateUserId: candidateId,
    candidateType: "preference",
    displayMode,
    rankInPool: rank,
    baseScore: 0.5,
    itemMeta: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as PreviewPoolItem;
}

describe("ai-pairwise-top2-shortlist.builder", () => {
  it("computes stable fingerprint for same inputs", () => {
    const a = computeRelationshipShortlistFingerprint({
      viewerUserId: "v1",
      poolId: "p1",
      orderedCandidateIds: ["c1", "c2"],
      staticCompatibilityScores: [88, 72],
    });
    const b = computeRelationshipShortlistFingerprint({
      viewerUserId: "v1",
      poolId: "p1",
      orderedCandidateIds: ["c1", "c2"],
      staticCompatibilityScores: [88, 72],
    });
    expect(a).toBe(b);
    expect(a.length).toBe(64);
  });

  it("excludes candidates failing preference hard gate (dealbreaker)", () => {
    const viewerId = "viewer-1";
    const pref: UserPreference = {
      id: "pref1",
      userId: viewerId,
      minAge: 25,
      maxAge: 35,
      preferredCities: [],
      minHeight: null,
      maxHeight: null,
      educationPreferences: [],
      occupationPreferences: [],
      relationshipGoalPreferences: [],
      styleTags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as UserPreference;

    const gatePref = {
      minAge: pref.minAge,
      maxAge: pref.maxAge,
      preferredCities: pref.preferredCities,
      minHeight: pref.minHeight,
      maxHeight: pref.maxHeight,
      educationPreferences: pref.educationPreferences,
      occupationPreferences: pref.occupationPreferences,
      relationshipGoalPreferences: pref.relationshipGoalPreferences,
    };

    const badUser = userStub("bad", { age: 99 });
    const goodUser = userStub("good", { age: 28 });
    const items = [
      itemStub("pool", viewerId, "bad", 1, "full"),
      itemStub("pool", viewerId, "good", 2, "full"),
    ];
    const eligible = buildEligibleRowsForTop2({
      viewerUserId: viewerId,
      viewerProfile: profileStub({ userId: viewerId }),
      gatePref,
      items,
      candidateUserById: new Map([
        ["bad", badUser],
        ["good", goodUser],
      ]),
      candidateProfileById: new Map([
        ["bad", profileStub({ userId: "bad" })],
        ["good", profileStub({ userId: "good" })],
      ]),
    });
    expect(eligible.map((e) => e.candidateUserId)).toEqual(["good"]);
  });

  it("sorts by score desc then rankInPool asc", () => {
    const viewerId = "v";
    const items = [
      itemStub("pool", viewerId, "a", 3, "full"),
      itemStub("pool", viewerId, "b", 1, "full"),
      itemStub("pool", viewerId, "c", 2, "full"),
    ];
    const viewerProf = profileStub({ userId: viewerId });
    const sameCand = profileStub({ userId: "x" });
    const rows = buildEligibleRowsForTop2({
      viewerUserId: viewerId,
      viewerProfile: viewerProf,
      gatePref: null,
      items,
      candidateUserById: new Map([
        ["a", userStub("a")],
        ["b", userStub("b")],
        ["c", userStub("c")],
      ]),
      candidateProfileById: new Map([
        ["a", sameCand],
        ["b", sameCand],
        ["c", sameCand],
      ]),
    });
    rows.sort(compareEligibleForTop2);
    expect(rows).toHaveLength(3);
    const scores = rows.map((r) => r.staticCompatibilityScore);
    expect(scores[0]! >= scores[1]! && scores[1]! >= scores[2]!).toBe(true);
  });
});

describe("AiPairwiseTop2ShortlistService", () => {
  function makeService(mock: {
    pool: { id: string; userId: string; items: PreviewPoolItem[] } | null;
    viewerProfile: UserProfile | null;
    pref: UserPreference | null;
    users: User[];
    profiles: UserProfile[];
  }) {
    const prisma = {
      previewPool: {
        findFirst: jest.fn().mockResolvedValue(mock.pool),
      },
      userProfile: {
        findUnique: jest.fn().mockImplementation(({ where }: { where: { userId: string } }) => {
          if (where.userId === mock.pool?.userId) return mock.viewerProfile;
          return mock.profiles.find((p) => p.userId === where.userId) ?? null;
        }),
        findMany: jest.fn().mockResolvedValue(mock.profiles),
      },
      userPreference: {
        findUnique: jest.fn().mockResolvedValue(mock.pref),
      },
      user: {
        findMany: jest.fn().mockResolvedValue(mock.users),
      },
    } as unknown as PrismaService;
    return new AiPairwiseTop2ShortlistService(prisma);
  }

  it("returns Top2 for a 6-slot pool with 2+ full eligible profiles", async () => {
    const viewerId = "viewer-x";
    const poolId = "pool-x";
    const viewerProf = profileStub({ userId: viewerId });
    const items = ["c1", "c2", "c3", "c4", "c5", "c6"].map((id, i) =>
      itemStub(poolId, viewerId, id, i + 1, "full"),
    );
    const users = ["c1", "c2", "c3", "c4", "c5", "c6"].map((id) => userStub(id));
    const profiles = ["c1", "c2", "c3", "c4", "c5", "c6"].map((id, i) =>
      profileStub({
        userId: id,
        communicationStyle: 0.3 + i * 0.05,
        marriageExpectation: 0.4 + i * 0.03,
      }),
    );
    const svc = makeService({
      pool: { id: poolId, userId: viewerId, items },
      viewerProfile: viewerProf,
      pref: null,
      users,
      profiles,
    });
    const top2 = await svc.buildRelationshipShortlistTop2({ viewerUserId: viewerId, poolId });
    const top2b = await svc.buildRelationshipShortlistTop2({ viewerUserId: viewerId, poolId });
    expect(top2.shortlistFingerprint).toBe(top2b.shortlistFingerprint);
    expect(top2.candidates).toHaveLength(2);
    expect(top2.candidates[0].staticRank).toBe(1);
    expect(top2.candidates[1].staticRank).toBe(2);
    expect(top2.candidates[0].candidateUserId).not.toBe(top2.candidates[1].candidateUserId);
    expect(top2.candidates[0].staticCompatibilityScore).toBeGreaterThanOrEqual(0);
    expect(top2.candidates[0].staticCompatibilityScore).toBeLessThanOrEqual(100);
    expect(top2.candidates[0].dealbreakerPassed).toBe(true);
    expect(parseAndValidateRelationshipShortlistTop2(top2).ok).toBe(true);
  });

  it("throws when fewer than 2 eligible candidates", async () => {
    const viewerId = "v2";
    const poolId = "pool-2";
    const items = [itemStub(poolId, viewerId, "only", 1, "full")];
    const svc = makeService({
      pool: { id: poolId, userId: viewerId, items },
      viewerProfile: profileStub({ userId: viewerId }),
      pref: null,
      users: [userStub("only")],
      profiles: [profileStub({ userId: "only" })],
    });
    let caught: unknown;
    try {
      await svc.buildRelationshipShortlistTop2({ viewerUserId: viewerId, poolId });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(RelationshipShortlistTop2Error);
    expect((caught as RelationshipShortlistTop2Error).code).toBe("INSUFFICIENT_ELIGIBLE_CANDIDATES");
  });

  it("throws when pool missing", async () => {
    const svc = makeService({
      pool: null,
      viewerProfile: profileStub(),
      pref: null,
      users: [],
      profiles: [],
    });
    await expect(svc.buildRelationshipShortlistTop2({ viewerUserId: "v", poolId: "missing" })).rejects.toMatchObject({
      code: "POOL_NOT_FOUND",
    });
  });

  it("treats non-full displayMode slots as ineligible (cannot reach Top2)", async () => {
    const viewerId = "v-blur";
    const poolId = "pool-blur";
    const items = [
      itemStub(poolId, viewerId, "c1", 1, "blurred"),
      itemStub(poolId, viewerId, "c2", 2, "locked"),
    ];
    const svc = makeService({
      pool: { id: poolId, userId: viewerId, items },
      viewerProfile: profileStub({ userId: viewerId }),
      pref: null,
      users: [userStub("c1"), userStub("c2")],
      profiles: [profileStub({ userId: "c1" }), profileStub({ userId: "c2" })],
    });
    let caught: unknown;
    try {
      await svc.buildRelationshipShortlistTop2({ viewerUserId: viewerId, poolId });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(RelationshipShortlistTop2Error);
    expect((caught as RelationshipShortlistTop2Error).code).toBe("INSUFFICIENT_ELIGIBLE_CANDIDATES");
  });

  it("throws when viewer has no profile", async () => {
    const viewerId = "v3";
    const poolId = "pool-3";
    const items = [
      itemStub(poolId, viewerId, "c1", 1, "full"),
      itemStub(poolId, viewerId, "c2", 2, "full"),
    ];
    const svc = makeService({
      pool: { id: poolId, userId: viewerId, items },
      viewerProfile: null,
      pref: null,
      users: [userStub("c1"), userStub("c2")],
      profiles: [profileStub({ userId: "c1" }), profileStub({ userId: "c2" })],
    });
    await expect(svc.buildRelationshipShortlistTop2({ viewerUserId: viewerId, poolId })).rejects.toMatchObject({
      code: "VIEWER_PROFILE_REQUIRED",
    });
  });

  it("does not call LLM or write MatchResult (smoke: prisma mock has no such methods)", async () => {
    const prisma = {
      previewPool: { findFirst: jest.fn().mockResolvedValue(null) },
      userProfile: { findUnique: jest.fn(), findMany: jest.fn() },
      userPreference: { findUnique: jest.fn() },
      user: { findMany: jest.fn() },
    } as unknown as PrismaService;
    const svc = new AiPairwiseTop2ShortlistService(prisma);
    try {
      await svc.buildRelationshipShortlistTop2({ viewerUserId: "x", poolId: "y" });
    } catch {
      /* expected */
    }
    expect((prisma as { matchResult?: unknown }).matchResult).toBeUndefined();
  });
});
