import type { PreviewPoolItem, User, UserPreference, UserProfile, UserImage } from "@peima/database";
import { buildPreviewPoolShortlistContractV0 } from "../src/modules/preview-pool/preview-pool-shortlist-contract.v0";

function prof(userId: string, attachmentStyle: number): UserProfile {
  return {
    id: `prof_${userId}`,
    userId,
    socialEnergy: null,
    emotionalExpression: 0.5,
    relationshipPace: null,
    initiativeLevel: null,
    decisionOrientation: null,
    conflictResponse: null,
    attachmentStyle,
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
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as UserProfile;
}

function user(
  id: string,
  overrides: Partial<
    Pick<User, "age" | "city" | "height" | "education" | "occupation" | "relationshipGoal">
  > = {},
): User {
  return {
    id,
    phone: `+861380000${id.slice(-4)}`,
    nickname: `u_${id}`,
    gender: "",
    age: overrides.age ?? 28,
    city: overrides.city ?? "上海",
    height: overrides.height ?? 170,
    education: overrides.education ?? "本科",
    occupation: overrides.occupation ?? "工程师",
    relationshipGoal: overrides.relationshipGoal ?? "认真恋爱",
    bio: "",
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as User;
}

describe("preview pool shortlist contract v0", () => {
  it("picks top 3 among full slots and reports locked + truncated", () => {
    const viewerUserId = "viewer1";
    const poolId = "pool1";

    const items: PreviewPoolItem[] = [
      {
        id: "i1",
        previewPoolId: poolId,
        userId: viewerUserId,
        candidateUserId: "c1",
        candidateType: "visual",
        displayMode: "full",
        rankInPool: 1,
        baseScore: 0.8,
        itemMeta: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "i2",
        previewPoolId: poolId,
        userId: viewerUserId,
        candidateUserId: "c2",
        candidateType: "visual",
        displayMode: "full",
        rankInPool: 2,
        baseScore: 0.79,
        itemMeta: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "i3",
        previewPoolId: poolId,
        userId: viewerUserId,
        candidateUserId: "c3",
        candidateType: "preference",
        displayMode: "full",
        rankInPool: 3,
        baseScore: 0.7,
        itemMeta: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "i4",
        previewPoolId: poolId,
        userId: viewerUserId,
        candidateUserId: "c4",
        candidateType: "preference",
        displayMode: "full",
        rankInPool: 4,
        baseScore: 0.69,
        itemMeta: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "i5",
        previewPoolId: poolId,
        userId: viewerUserId,
        candidateUserId: "c5",
        candidateType: "backup",
        displayMode: "locked",
        rankInPool: 5,
        baseScore: 0.6,
        itemMeta: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "i6",
        previewPoolId: poolId,
        userId: viewerUserId,
        candidateUserId: "c6",
        candidateType: "backup",
        displayMode: "locked",
        rankInPool: 6,
        baseScore: 0.59,
        itemMeta: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as unknown as PreviewPoolItem[];

    const viewerPreference = {
      id: "pref1",
      userId: viewerUserId,
      minAge: 25,
      maxAge: 35,
      preferredCities: ["上海"],
      minHeight: 160,
      maxHeight: 190,
      educationPreferences: ["本科"],
      occupationPreferences: [],
      relationshipGoalPreferences: [],
      styleTags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as UserPreference;

    const viewerProfile = prof(viewerUserId, 0.9);

    const candidateUserById = new Map<string, User>([
      ["c1", user("c1", { city: "上海" })],
      ["c2", user("c2", { city: "北京" })], // miss city pref -> lower preferenceScore
      ["c3", user("c3")],
      ["c4", user("c4")],
      ["c5", user("c5")],
      ["c6", user("c6")],
    ]);

    const candidateProfileById = new Map<string, UserProfile>([
      [viewerUserId, viewerProfile],
      ["c1", prof("c1", 0.85)],
      ["c2", prof("c2", 0.85)],
      ["c3", prof("c3", 0.9)], // best scalar vs viewer 0.9
      ["c4", prof("c4", 0.88)],
      ["c5", prof("c5", 0.5)],
      ["c6", prof("c6", 0.5)],
    ]);

    const candidateFirstImageById = new Map<string, UserImage | null>([
      ["c1", { styleTags: ["简约"] } as unknown as UserImage],
      ["c2", null],
      ["c3", null],
      ["c4", null],
      ["c5", null],
      ["c6", null],
    ]);

    const out = buildPreviewPoolShortlistContractV0({
      viewerUserId,
      poolId,
      items,
      viewerPreference,
      viewerProfile,
      candidateUserById,
      candidateProfileById,
      candidateFirstImageById,
    });

    expect(out.schemaVersion).toBe("preview_pool_shortlist_contract_v0");
    expect(out.shortlist.size).toBe(3);
    expect(out.shortlist.candidateUserIds).toEqual(["c3", "c4", "c1"]);

    const locked = out.exclusionReport.filter(
      (r) => r.reasonCode === "NOT_ELIGIBLE_DISPLAY_MODE",
    );
    expect(locked.map((r) => r.candidateUserId).sort()).toEqual(["c5", "c6"]);

    const truncated = out.exclusionReport.find((r) => r.candidateUserId === "c2");
    expect(truncated?.reasonCode).toBe("TRUNCATED_BY_RANK_RULE");
  });
});
