import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  foldPreviewPoolFunnelFromScannedUsers,
  preferenceGatePrefFromUserPreference,
  PREVIEW_POOL_FUNNEL_MAX_SCAN_USERS,
  type PreviewPoolFunnelReport,
} from "./onboarding-photo-preview-pool-funnel.audit";

function assertFunnelAuditAllowed(): void {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_PREVIEW_POOL_FUNNEL_AUDIT !== "true" &&
    process.env.ALLOW_PREVIEW_POOL_FUNNEL_AUDIT !== "1"
  ) {
    throw new Error(
      "Preview pool funnel audit is disabled in production unless ALLOW_PREVIEW_POOL_FUNNEL_AUDIT=1.",
    );
  }
}

@Injectable()
export class OnboardingPhotoPreviewPoolFunnelAuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Scan DB and return masked funnel report. Dev/staging by default; production requires
   * `ALLOW_PREVIEW_POOL_FUNNEL_AUDIT=1`.
   */
  async auditForViewer(viewerUserId: string): Promise<PreviewPoolFunnelReport> {
    assertFunnelAuditAllowed();

    const viewer = await this.prisma.user.findUnique({
      where: { id: viewerUserId },
      select: { id: true, gender: true },
    });
    if (!viewer) {
      throw new NotFoundException(`User ${viewerUserId} not found`);
    }

    const prefRow = await this.prisma.userPreference.findUnique({
      where: { userId: viewerUserId },
    });
    const gatePref = preferenceGatePrefFromUserPreference(prefRow);

    const [
      total_users_in_db,
      non_viewer_users,
      non_viewer_with_at_least_one_image,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { id: { not: viewerUserId } } }),
      this.prisma.user.count({
        where: {
          id: { not: viewerUserId },
          images: { some: {} },
        },
      }),
    ]);

    const take = Math.min(
      non_viewer_users,
      PREVIEW_POOL_FUNNEL_MAX_SCAN_USERS,
    );
    const scan_truncated = non_viewer_users > PREVIEW_POOL_FUNNEL_MAX_SCAN_USERS;

    const rows = await this.prisma.user.findMany({
      where: { id: { not: viewerUserId } },
      orderBy: { createdAt: "asc" },
      take,
      select: {
        id: true,
        createdAt: true,
        age: true,
        city: true,
        height: true,
        education: true,
        occupation: true,
        relationshipGoal: true,
        gender: true,
        relationProfile: { select: { id: true } },
        images: {
          orderBy: { createdAt: "asc" },
          select: {
            createdAt: true,
            detectionStatus: true,
            reviewStatus: true,
          },
        },
      },
    });

    return foldPreviewPoolFunnelFromScannedUsers({
      viewerUserId,
      viewerGenderRaw: viewer.gender,
      gatePref,
      prefRowPresent: prefRow != null,
      totals: {
        total_users_in_db,
        non_viewer_users,
        non_viewer_with_at_least_one_image,
      },
      scannedUsersNonViewer: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        age: r.age,
        city: r.city ?? "",
        height: r.height,
        education: r.education ?? "",
        occupation: r.occupation ?? "",
        relationshipGoal: r.relationshipGoal ?? "",
        gender: r.gender,
        relationProfile: r.relationProfile,
        images: r.images.map((im) => ({
          createdAt: im.createdAt,
          detectionStatus: im.detectionStatus,
          reviewStatus: im.reviewStatus,
        })),
      })),
      scan_truncated,
    });
  }
}
