import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { OnboardingService } from "../src/modules/onboarding/onboarding.service";

const t0 = new Date("2026-05-15T10:00:00.000Z");
const t1 = new Date("2026-05-15T11:00:00.000Z");

function img(
  overrides: Partial<{
    id: string;
    detectionStatus: string;
    reviewStatus: string;
    reviewReasonCodes: string[];
    createdAt: Date;
  }> = {},
) {
  return {
    id: "img-1",
    detectionStatus: "passed",
    reviewStatus: "not_required",
    reviewReasonCodes: [] as string[],
    createdAt: t0,
    ...overrides,
  };
}

const gateDefaults = {
  hasPhotoUnderReview: false,
  photoReviewStatusSummary: "none" as const,
  hasBlockedPhoto: false,
  blockingPhotoReviewStatus: null,
  photoGateMessageKey: null,
  photoGateReasonCodes: [] as string[],
  passingPhotoCount: 0,
  blockedPhotoId: null,
  passingPhotoId: null,
};

describe("OnboardingService (P7.2 + P7.4-r1e2 status)", () => {
  async function createService(prisma: Record<string, unknown>) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    return moduleRef.get(OnboardingService);
  }

  function userPrisma(overrides: Record<string, unknown> = {}) {
    return {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          onboardingPhotoAestheticCompletedAt: null,
          onboardingPhotoPreviewCompletedAt: null,
          ...overrides,
        }),
      },
      userProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
  }

  it("nextStep photo_upload when no passing photo", async () => {
    const prisma = {
      ...userPrisma(),
      userImage: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const svc = await createService(prisma);
    await expect(svc.getPhotoStatus("u1")).resolves.toEqual({
      hasPhoto: false,
      hasPassingPhoto: false,
      hasPhotoPreference: false,
      nextStep: "photo_upload",
      ...gateDefaults,
    });
  });

  it("passed + not_required → hasPassingPhoto true", async () => {
    const prisma = {
      ...userPrisma(),
      userImage: {
        findMany: jest.fn().mockResolvedValue([
          img({ detectionStatus: "passed", reviewStatus: "not_required" }),
        ]),
      },
    };
    const svc = await createService(prisma);
    const res = await svc.getPhotoStatus("u1");
    expect(res.hasPassingPhoto).toBe(true);
    expect(res.passingPhotoCount).toBe(1);
    expect(res.nextStep).toBe("photo_preference");
  });

  it("skipped + pending_review → passing and under review", async () => {
    const prisma = {
      ...userPrisma(),
      userImage: {
        findMany: jest.fn().mockResolvedValue([
          img({ detectionStatus: "skipped", reviewStatus: "pending_review" }),
        ]),
      },
    };
    const svc = await createService(prisma);
    const res = await svc.getPhotoStatus("u1");
    expect(res.hasPassingPhoto).toBe(true);
    expect(res.hasPhotoUnderReview).toBe(true);
    expect(res.photoReviewStatusSummary).toBe("pending_review");
    expect(res.nextStep).toBe("photo_preference");
  });

  it("failed + not_required → hasPassingPhoto false", async () => {
    const prisma = {
      ...userPrisma(),
      userImage: {
        findMany: jest.fn().mockResolvedValue([
          img({ detectionStatus: "failed", reviewStatus: "not_required" }),
        ]),
      },
    };
    const svc = await createService(prisma);
    const res = await svc.getPhotoStatus("u1");
    expect(res.hasPhoto).toBe(true);
    expect(res.hasPassingPhoto).toBe(false);
    expect(res.nextStep).toBe("photo_upload");
  });

  it("failed + approved → hasPassingPhoto true", async () => {
    const prisma = {
      ...userPrisma(),
      userImage: {
        findMany: jest.fn().mockResolvedValue([
          img({ detectionStatus: "failed", reviewStatus: "approved" }),
        ]),
      },
    };
    const svc = await createService(prisma);
    const res = await svc.getPhotoStatus("u1");
    expect(res.hasPassingPhoto).toBe(true);
    expect(res.nextStep).toBe("photo_preference");
  });

  it("passed + rejected → nextStep photo_upload when no passing", async () => {
    const prisma = {
      ...userPrisma(),
      userImage: {
        findMany: jest.fn().mockResolvedValue([
          img({ detectionStatus: "passed", reviewStatus: "rejected" }),
        ]),
      },
    };
    const svc = await createService(prisma);
    const res = await svc.getPhotoStatus("u1");
    expect(res.hasPassingPhoto).toBe(false);
    expect(res.nextStep).toBe("photo_upload");
    expect(res.blockingPhotoReviewStatus).toBe("rejected");
    expect(res.photoGateMessageKey).toBe("photo_rejected");
  });

  it("skipped + needs_reupload → nextStep photo_upload when no passing", async () => {
    const prisma = {
      ...userPrisma(),
      userImage: {
        findMany: jest.fn().mockResolvedValue([
          img({ detectionStatus: "skipped", reviewStatus: "needs_reupload" }),
        ]),
      },
    };
    const svc = await createService(prisma);
    const res = await svc.getPhotoStatus("u1");
    expect(res.hasPassingPhoto).toBe(false);
    expect(res.nextStep).toBe("photo_upload");
  });

  it("rejected + approved two images → hasPassingPhoto true", async () => {
    const prisma = {
      ...userPrisma(),
      userImage: {
        findMany: jest.fn().mockResolvedValue([
          img({
            id: "rej",
            detectionStatus: "passed",
            reviewStatus: "rejected",
          }),
          img({
            id: "ok",
            detectionStatus: "failed",
            reviewStatus: "approved",
            createdAt: t1,
          }),
        ]),
      },
    };
    const svc = await createService(prisma);
    const res = await svc.getPhotoStatus("u1");
    expect(res.hasPassingPhoto).toBe(true);
    expect(res.passingPhotoCount).toBeGreaterThanOrEqual(1);
    expect(res.passingPhotoId).toBe("ok");
    expect(res.hasBlockedPhoto).toBe(true);
    expect(res.photoGateMessageKey).toBeNull();
    expect(res.nextStep).toBe("photo_preference");
  });

  it("only needs_reupload → gate message and blocked summary", async () => {
    const prisma = {
      ...userPrisma(),
      userImage: {
        findMany: jest.fn().mockResolvedValue([
          img({
            id: "n1",
            detectionStatus: "skipped",
            reviewStatus: "needs_reupload",
            reviewReasonCodes: ["NEEDS_REUPLOAD"],
          }),
        ]),
      },
    };
    const svc = await createService(prisma);
    const res = await svc.getPhotoStatus("u1");
    expect(res.hasBlockedPhoto).toBe(true);
    expect(res.blockingPhotoReviewStatus).toBe("needs_reupload");
    expect(res.photoGateMessageKey).toBe("photo_needs_reupload");
    expect(res.photoGateReasonCodes).toEqual(["NEEDS_REUPLOAD"]);
    expect(res.photoReviewStatusSummary).toBe("blocked_needs_reupload");
    expect(res.nextStep).toBe("photo_upload");
  });

  it("status does not return reviewNote", async () => {
    const prisma = {
      ...userPrisma(),
      userImage: {
        findMany: jest.fn().mockResolvedValue([
          img({ reviewStatus: "rejected", reviewReasonCodes: ["MANUAL_REJECTED"] }),
        ]),
      },
    };
    const svc = await createService(prisma);
    const res = await svc.getPhotoStatus("u1");
    expect("reviewNote" in res).toBe(false);
  });

  it("nextStep photo_preview when aesthetic done but preview not ack", async () => {
    const prisma = {
      ...userPrisma({
        onboardingPhotoAestheticCompletedAt: new Date(),
        onboardingPhotoPreviewCompletedAt: null,
      }),
      userImage: {
        findMany: jest.fn().mockResolvedValue([img()]),
      },
      userProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const svc = await createService(prisma);
    const res = await svc.getPhotoStatus("u1");
    expect(res.nextStep).toBe("photo_preview");
    expect(res.hasPhotoPreference).toBe(true);
  });

  it("nextStep photo_preview when questionnaire done but preview not ack", async () => {
    const prisma = {
      ...userPrisma({
        onboardingPhotoAestheticCompletedAt: new Date(),
        onboardingPhotoPreviewCompletedAt: null,
      }),
      userImage: {
        findMany: jest.fn().mockResolvedValue([img()]),
      },
      userProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: "prof-1" }),
      },
    };
    const svc = await createService(prisma);
    const res = await svc.getPhotoStatus("u1");
    expect(res.nextStep).toBe("photo_preview");
    expect(res.hasPhotoPreference).toBe(true);
  });

  it("nextStep questionnaire when preview ack set", async () => {
    const prisma = {
      ...userPrisma({
        onboardingPhotoAestheticCompletedAt: new Date(),
        onboardingPhotoPreviewCompletedAt: new Date(),
      }),
      userImage: {
        findMany: jest.fn().mockResolvedValue([img()]),
      },
      userProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: "prof-1" }),
      },
    };
    const svc = await createService(prisma);
    const res = await svc.getPhotoStatus("u1");
    expect(res.nextStep).toBe("questionnaire");
  });

  it("savePhotoPreferences sets aesthetic completed timestamp", async () => {
    const updateUser = jest.fn().mockResolvedValue({});
    const updatePref = jest.fn().mockResolvedValue({ styleTags: ["清爽自然"] });
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: "u1" }),
        update: updateUser,
      },
      userImage: { findMany: jest.fn() },
      userPreference: {
        findUnique: jest.fn().mockResolvedValue({ userId: "u1", styleTags: [] }),
        update: updatePref,
        create: jest.fn(),
      },
    };
    const svc = await createService(prisma);
    await svc.savePhotoPreferences("u1", ["清爽自然"]);
    expect(updateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: expect.objectContaining({
          onboardingPhotoAestheticCompletedAt: expect.any(Date),
        }),
      }),
    );
  });

  it("savePhotoPreferences rejects photo focus tags (not styleTags)", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: "u1" }),
        update: jest.fn(),
      },
      userImage: { findMany: jest.fn() },
      userPreference: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        create: jest.fn(),
      },
    };
    const svc = await createService(prisma);
    await expect(svc.savePhotoPreferences("u1", ["笑容"])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("savePhotoPreferences rejects whitelist tags outside onboarding pool", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: "u1" }),
        update: jest.fn(),
      },
      userImage: { findMany: jest.fn() },
      userPreference: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        create: jest.fn(),
      },
    };
    const svc = await createService(prisma);
    await expect(svc.savePhotoPreferences("u1", ["都市精致"])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("savePhotoPreferences merges account-only styleTags with onboarding pool selection", async () => {
    const updateUser = jest.fn().mockResolvedValue({});
    const updatePref = jest.fn().mockResolvedValue({
      styleTags: ["都市精致", "甜美可爱"],
    });
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: "u1" }),
        update: updateUser,
      },
      userImage: { findMany: jest.fn() },
      userPreference: {
        findUnique: jest.fn().mockResolvedValue({
          userId: "u1",
          styleTags: ["都市精致", "清爽自然"],
        }),
        update: updatePref,
        create: jest.fn(),
      },
    };
    const svc = await createService(prisma);
    const res = await svc.savePhotoPreferences("u1", ["甜美可爱"]);
    expect(res.styleTags).toEqual(["都市精致", "甜美可爱"]);
    expect(updatePref).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1" },
        data: { styleTags: ["都市精致", "甜美可爱"] },
      }),
    );
  });
});
