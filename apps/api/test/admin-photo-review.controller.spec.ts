import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { Permission } from "@peima/shared/constants";
import { RbacGuard } from "../src/common/rbac/rbac.guard";
import { RbacService } from "../src/common/rbac/rbac.service";
import { JwtAuthGuard } from "../src/modules/auth/jwt-auth.guard";
import { AdminPhotoReviewController } from "../src/modules/admin-photo-review/admin-photo-review.controller";
import { AdminPhotoReviewService } from "../src/modules/admin-photo-review/admin-photo-review.service";

describe("AdminPhotoReviewController", () => {
  const listResult = { items: [], nextCursor: null };
  const detailResult = {
    imageId: "img-1",
    user: { userId: "u1", nickname: "n" },
  };

  it("delegates list and detail to service", async () => {
    const svc = {
      listItems: jest.fn().mockResolvedValue(listResult),
      getItemDetail: jest.fn().mockResolvedValue(detailResult),
      approveItem: jest.fn().mockResolvedValue(detailResult),
      rejectItem: jest.fn().mockResolvedValue(detailResult),
      needsReuploadItem: jest.fn().mockResolvedValue(detailResult),
    };
    const mod = await Test.createTestingModule({
      controllers: [AdminPhotoReviewController],
      providers: [{ provide: AdminPhotoReviewService, useValue: svc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RbacGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const c = mod.get(AdminPhotoReviewController);

    await c.listItems({ reviewStatus: "pending_review" } as never);
    expect(svc.listItems).toHaveBeenCalledWith({ reviewStatus: "pending_review" });

    await c.getItemDetail("img-1");
    expect(svc.getItemDetail).toHaveBeenCalledWith("img-1");

    await c.approveItem(
      { user: { userId: "admin-1" } } as never,
      "img-1",
      { note: "ok" } as never,
    );
    expect(svc.approveItem).toHaveBeenCalledWith("img-1", "admin-1", {
      note: "ok",
    });

    await c.rejectItem(
      { user: { userId: "admin-1" } } as never,
      "img-1",
      { reasonCodes: ["MANUAL_REJECTED"] } as never,
    );
    expect(svc.rejectItem).toHaveBeenCalledWith("img-1", "admin-1", {
      reasonCodes: ["MANUAL_REJECTED"],
    });

    await c.needsReuploadItem(
      { user: { userId: "admin-1" } } as never,
      "img-1",
      { reasonCodes: ["NEEDS_REUPLOAD"] } as never,
    );
    expect(svc.needsReuploadItem).toHaveBeenCalledWith("img-1", "admin-1", {
      reasonCodes: ["NEEDS_REUPLOAD"],
    });
  });

  it("throws 401 when unauthenticated on write", async () => {
    const svc = {
      listItems: jest.fn(),
      getItemDetail: jest.fn(),
      approveItem: jest.fn(),
      rejectItem: jest.fn(),
      needsReuploadItem: jest.fn(),
    };
    const mod = await Test.createTestingModule({
      controllers: [AdminPhotoReviewController],
      providers: [{ provide: AdminPhotoReviewService, useValue: svc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RbacGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const c = mod.get(AdminPhotoReviewController);
    expect(() =>
      c.approveItem({ user: {} } as never, "img-1", {} as never),
    ).toThrow(UnauthorizedException);
    expect(svc.approveItem).not.toHaveBeenCalled();
  });
});

describe("AdminPhotoReview RbacGuard", () => {
  it("returns 403 when user lacks manage_photo_review", async () => {
    const reflector = {
      get: jest.fn().mockReturnValue(Permission.MANAGE_PHOTO_REVIEW),
    };
    const rbacService = {
      checkPermission: jest.fn().mockResolvedValue(false),
    };
    const guard = new RbacGuard(
      reflector as unknown as Reflector,
      rbacService as unknown as RbacService,
    );
    const ctx = {
      getHandler: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: { userId: "regular-user" } }),
      }),
    } as ExecutionContext;

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
    expect(rbacService.checkPermission).toHaveBeenCalledWith(
      "regular-user",
      Permission.MANAGE_PHOTO_REVIEW,
    );
  });

  it("allows operator/admin permission manage_photo_review", async () => {
    const reflector = {
      get: jest.fn().mockReturnValue(Permission.MANAGE_PHOTO_REVIEW),
    };
    const rbacService = {
      checkPermission: jest.fn().mockResolvedValue(true),
    };
    const guard = new RbacGuard(
      reflector as unknown as Reflector,
      rbacService as unknown as RbacService,
    );
    const ctx = {
      getHandler: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: { userId: "operator-1" } }),
      }),
    } as ExecutionContext;

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});
