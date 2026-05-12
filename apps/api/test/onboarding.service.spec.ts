import { Test } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { OnboardingService } from "../src/modules/onboarding/onboarding.service";

describe("OnboardingService (P7.2 status)", () => {
  async function createService(prisma: Record<string, unknown>) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    return moduleRef.get(OnboardingService);
  }

  it("nextStep photo_upload when no images", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          onboardingPhotoAestheticCompletedAt: null,
          onboardingPhotoPreviewCompletedAt: null,
        }),
      },
      userImage: { count: jest.fn().mockResolvedValue(0) },
    };
    const svc = await createService(prisma);
    await expect(svc.getPhotoStatus("u1")).resolves.toEqual({
      hasPhoto: false,
      hasPhotoPreference: false,
      nextStep: "photo_upload",
    });
  });

  it("nextStep photo_preference when has photo but aesthetic not completed (ignore legacy styleTags)", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          onboardingPhotoAestheticCompletedAt: null,
          onboardingPhotoPreviewCompletedAt: null,
        }),
      },
      userImage: { count: jest.fn().mockResolvedValue(1) },
    };
    const svc = await createService(prisma);
    await expect(svc.getPhotoStatus("u1")).resolves.toEqual({
      hasPhoto: true,
      hasPhotoPreference: false,
      nextStep: "photo_preference",
    });
  });

  it("nextStep photo_preview when aesthetic done but preview not ack", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          onboardingPhotoAestheticCompletedAt: new Date(),
          onboardingPhotoPreviewCompletedAt: null,
        }),
      },
      userImage: { count: jest.fn().mockResolvedValue(1) },
    };
    const svc = await createService(prisma);
    await expect(svc.getPhotoStatus("u1")).resolves.toEqual({
      hasPhoto: true,
      hasPhotoPreference: true,
      nextStep: "photo_preview",
    });
  });

  it("nextStep questionnaire when preview ack set", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          onboardingPhotoAestheticCompletedAt: new Date(),
          onboardingPhotoPreviewCompletedAt: new Date(),
        }),
      },
      userImage: { count: jest.fn().mockResolvedValue(1) },
    };
    const svc = await createService(prisma);
    await expect(svc.getPhotoStatus("u1")).resolves.toEqual({
      hasPhoto: true,
      hasPhotoPreference: true,
      nextStep: "questionnaire",
    });
  });

  it("savePhotoPreferences sets aesthetic completed timestamp", async () => {
    const updateUser = jest.fn().mockResolvedValue({});
    const updatePref = jest.fn().mockResolvedValue({ styleTags: ["清爽自然"] });
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: "u1" }),
        update: updateUser,
      },
      userImage: { count: jest.fn() },
      userPreference: {
        findUnique: jest.fn().mockResolvedValue({ userId: "u1" }),
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
});
