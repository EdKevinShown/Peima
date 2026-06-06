import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { UserImage } from "@peima/database";
import { Permission } from "@peima/shared/constants";
import { RbacService } from "../../common/rbac/rbac.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { UserImageContentAccessResult } from "./user-image-content-access.types";

const POOL_STATUS_ACTIVE = "active";

const BLOCKED_REVIEW_STATUSES = new Set([
  "rejected",
  "needs_reupload",
  "appeal_rejected",
]);

function variantFromDisplayMode(
  displayMode: string,
): UserImageContentAccessResult | null {
  if (displayMode === "clear") {
    return { allowed: true, variant: "clear" };
  }
  if (displayMode === "blurred") {
    return { allowed: true, variant: "blurred" };
  }
  if (displayMode === "hidden") {
    return {
      allowed: false,
      httpStatus: 403,
      message: "photo locked for this preview slot",
    };
  }
  return null;
}

@Injectable()
export class UserImageContentAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbacService: RbacService,
  ) {}

  isBlockedReviewStatus(reviewStatus: string | null | undefined): boolean {
    const s = String(reviewStatus ?? "").trim();
    return BLOCKED_REVIEW_STATUSES.has(s);
  }

  async resolveAccess(
    viewerUserId: string,
    image: UserImage,
  ): Promise<UserImageContentAccessResult> {
    if (this.isBlockedReviewStatus(image.reviewStatus)) {
      const admin = await this.rbacService.checkPermission(
        viewerUserId,
        Permission.MANAGE_PHOTO_REVIEW,
      );
      if (!admin) {
        return {
          allowed: false,
          httpStatus: 403,
          message: "photo is not available",
        };
      }
      return { allowed: true, variant: "clear" };
    }

    if (image.userId === viewerUserId) {
      return { allowed: true, variant: "clear" };
    }

    const admin = await this.rbacService.checkPermission(
      viewerUserId,
      Permission.MANAGE_PHOTO_REVIEW,
    );
    if (admin) {
      return { allowed: true, variant: "clear" };
    }

    const poolAccess = await this.resolvePreviewPoolAccess(
      viewerUserId,
      image.userId,
    );
    if (poolAccess) {
      return poolAccess;
    }

    return {
      allowed: false,
      httpStatus: 403,
      message: "access denied for this photo",
    };
  }

  private async resolvePreviewPoolAccess(
    viewerUserId: string,
    candidateUserId: string,
  ): Promise<UserImageContentAccessResult | null> {
    const onboardingItem =
      await this.prisma.onboardingPhotoPreviewPoolItem.findFirst({
        where: {
          userId: viewerUserId,
          candidateUserId,
          pool: { status: POOL_STATUS_ACTIVE },
        },
        orderBy: { rankInPool: "asc" },
        select: { displayMode: true },
      });
    if (onboardingItem) {
      return variantFromDisplayMode(onboardingItem.displayMode);
    }

    const previewItem = await this.prisma.previewPoolItem.findFirst({
      where: {
        userId: viewerUserId,
        candidateUserId,
        previewPool: { status: POOL_STATUS_ACTIVE },
      },
      orderBy: { rankInPool: "asc" },
      select: { displayMode: true },
    });
    if (previewItem) {
      return variantFromDisplayMode(previewItem.displayMode);
    }

    return null;
  }

  assertAccessOrThrow(
    access: UserImageContentAccessResult,
  ): asserts access is Extract<UserImageContentAccessResult, { allowed: true }> {
    if (access.allowed) return;
    if (access.httpStatus === 404) {
      throw new NotFoundException(access.message);
    }
    throw new ForbiddenException(access.message);
  }
}
