import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Permission } from "@peima/shared/constants";
import type { UserImage } from "@peima/database";
import { ImagesController } from "../src/modules/images/images.controller";
import { ImagesService } from "../src/modules/images/images.service";
import { UserImageContentAccessService } from "../src/modules/images/user-image-content-access.service";
import { UserImageContentService } from "../src/modules/images/user-image-content.service";
import { RbacService } from "../src/common/rbac/rbac.service";
import { PrismaService } from "../src/common/prisma/prisma.service";

function imageRow(overrides: Partial<UserImage> = {}): UserImage {
  return {
    id: "img-1",
    userId: "owner-1",
    imageUrl: "http://localhost/uploads/user-images/owner-1-abc.jpg",
    styleTags: [],
    detectionStatus: "passed",
    detectionReasonCodes: [],
    detectionScoreJson: null,
    detectionRulesVersion: null,
    detectedAt: null,
    reviewStatus: "not_required",
    reviewReasonCodes: [],
    reviewNote: null,
    reviewedAt: null,
    reviewedByUserId: null,
    faceEmbedding: null,
    attractivenessScore: null,
    ageEstimate: null,
    genderEstimate: null,
    confidence: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as UserImage;
}

describe("UserImageContentAccessService", () => {
  function makeService(mocks: {
    onboardingDisplayMode?: string | null;
    previewDisplayMode?: string | null;
    admin?: boolean;
  }) {
    const prisma = {
      onboardingPhotoPreviewPoolItem: {
        findFirst: jest.fn().mockResolvedValue(
          mocks.onboardingDisplayMode
            ? { displayMode: mocks.onboardingDisplayMode }
            : null,
        ),
      },
      previewPoolItem: {
        findFirst: jest.fn().mockResolvedValue(
          mocks.previewDisplayMode
            ? { displayMode: mocks.previewDisplayMode }
            : null,
        ),
      },
    };
    const rbacService = {
      checkPermission: jest
        .fn()
        .mockImplementation((_uid: string, perm: Permission) =>
          Promise.resolve(
            perm === Permission.MANAGE_PHOTO_REVIEW && Boolean(mocks.admin),
          ),
        ),
    };
    const service = new UserImageContentAccessService(
      prisma as never,
      rbacService as never,
    );
    return { service, prisma, rbacService };
  }

  it("allows owner clear access", async () => {
    const { service } = makeService({});
    const out = await service.resolveAccess("owner-1", imageRow());
    expect(out).toEqual({ allowed: true, variant: "clear" });
  });

  it("denies rejected photo for non-admin", async () => {
    const { service } = makeService({});
    const out = await service.resolveAccess(
      "owner-1",
      imageRow({ reviewStatus: "rejected" }),
    );
    expect(out).toEqual({
      allowed: false,
      httpStatus: 403,
      message: "photo is not available",
    });
  });

  it("Group 1 preview slot returns clear for viewer", async () => {
    const { service } = makeService({ onboardingDisplayMode: "clear" });
    const out = await service.resolveAccess(
      "viewer-1",
      imageRow({ userId: "candidate-1" }),
    );
    expect(out).toEqual({ allowed: true, variant: "clear" });
  });

  it("Group 2 preview slot returns blurred only", async () => {
    const { service } = makeService({ onboardingDisplayMode: "blurred" });
    const out = await service.resolveAccess(
      "viewer-1",
      imageRow({ userId: "candidate-1" }),
    );
    expect(out).toEqual({ allowed: true, variant: "blurred" });
  });

  it("Group 3 preview slot denies photo", async () => {
    const { service } = makeService({ onboardingDisplayMode: "hidden" });
    const out = await service.resolveAccess(
      "viewer-1",
      imageRow({ userId: "candidate-1" }),
    );
    expect(out).toEqual({
      allowed: false,
      httpStatus: 403,
      message: "photo locked for this preview slot",
    });
  });

  it("denies cross-user access without pool or admin", async () => {
    const { service } = makeService({});
    const out = await service.resolveAccess(
      "viewer-a",
      imageRow({ userId: "owner-b" }),
    );
    expect(out).toEqual({
      allowed: false,
      httpStatus: 403,
      message: "access denied for this photo",
    });
  });

  it("allows admin clear access to rejected photo", async () => {
    const { service } = makeService({ admin: true });
    const out = await service.resolveAccess(
      "admin-1",
      imageRow({ reviewStatus: "rejected" }),
    );
    expect(out).toEqual({ allowed: true, variant: "clear" });
  });
});

describe("ImagesController GET /images/:id/content", () => {
  async function createController() {
    const contentService = {
      getImageContentForViewer: jest.fn(),
    };
    const mod = await Test.createTestingModule({
      controllers: [ImagesController],
      providers: [
        { provide: ImagesService, useValue: {} },
        { provide: UserImageContentService, useValue: contentService },
      ],
    }).compile();
    return {
      controller: mod.get(ImagesController),
      contentService,
    };
  }

  it("returns 401 when unauthenticated", async () => {
    const { controller } = await createController();
    await expect(
      controller.getContent("img-1", {} as never, {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("returns 403 when user A requests user B photo", async () => {
    const { controller, contentService } = await createController();
    contentService.getImageContentForViewer.mockRejectedValue(
      new ForbiddenException("access denied for this photo"),
    );
    await expect(
      controller.getContent(
        "img-b",
        { user: { userId: "user-a" } } as never,
        { setHeader: jest.fn(), send: jest.fn() } as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("streams content for owner", async () => {
    const { controller, contentService } = await createController();
    contentService.getImageContentForViewer.mockResolvedValue({
      buffer: Buffer.from("jpeg-bytes"),
      contentType: "image/jpeg",
    });
    const res = { setHeader: jest.fn(), send: jest.fn() };
    await controller.getContent(
      "img-1",
      { user: { userId: "owner-1" } } as never,
      res as never,
    );
    expect(contentService.getImageContentForViewer).toHaveBeenCalledWith(
      "img-1",
      "owner-1",
    );
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "image/jpeg");
    expect(res.send).toHaveBeenCalledWith(Buffer.from("jpeg-bytes"));
  });
});

describe("UserImageContentService blur variant", () => {
  it("Group 2 blurred variant differs from clear bytes", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const access = {
      resolveAccess: jest.fn().mockResolvedValue({
        allowed: true,
        variant: "blurred",
      }),
      assertAccessOrThrow: jest.fn(),
    };
    const prisma = {
      userImage: {
        findUnique: jest.fn().mockResolvedValue(
          imageRow({
            imageUrl: "/uploads/user-images/test.png",
          }),
        ),
      },
    };
    const service = new UserImageContentService(prisma as never, access as never);
    const uploadDir = (service as unknown as { uploadDir: string }).uploadDir;
    const { writeFile, mkdir } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { existsSync } = await import("node:fs");
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }
    const diskPath = join(uploadDir, "test.png");
    await writeFile(diskPath, png);

    const blurred = await service.getImageContentForViewer("img-1", "viewer-1");
    const clearAccess = {
      resolveAccess: jest.fn().mockResolvedValue({
        allowed: true,
        variant: "clear",
      }),
      assertAccessOrThrow: jest.fn(),
    };
    const clearService = new UserImageContentService(
      prisma as never,
      clearAccess as never,
    );
    const clear = await clearService.getImageContentForViewer("img-1", "owner-1");
    expect(blurred.buffer.equals(clear.buffer)).toBe(false);
    expect(blurred.contentType).toMatch(/^image\//);
  });
});
