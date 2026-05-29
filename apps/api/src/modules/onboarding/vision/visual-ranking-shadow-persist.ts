/**
 * P7.5-r4-b: persist VisualRankingShadowV1 to OnboardingPhotoPreviewPoolShadow.
 */

import { Prisma } from "@peima/database";
import type { PrismaService } from "../../../common/prisma/prisma.service";
import type { VisualRankingShadowV1 } from "./visual-ranking-shadow.types";

export const VISUAL_RANKING_SHADOW_TYPE = "visual_ranking_shadow" as const;

export type VisualRankingShadowPersistResult =
  | { persisted: true }
  | {
      persisted: false;
      reason: "persist_error";
      message?: string;
    };

export type VisualRankingShadowPersistClient = Pick<
  PrismaService,
  "onboardingPhotoPreviewPoolShadow"
>;

export async function persistVisualRankingShadow(
  prisma: VisualRankingShadowPersistClient,
  poolId: string,
  viewerUserId: string,
  shadow: VisualRankingShadowV1,
): Promise<VisualRankingShadowPersistResult> {
  try {
    await prisma.onboardingPhotoPreviewPoolShadow.upsert({
      where: {
        poolId_shadowType_sourceVersion: {
          poolId,
          shadowType: VISUAL_RANKING_SHADOW_TYPE,
          sourceVersion: shadow.sourceVersion,
        },
      },
      create: {
        poolId,
        userId: viewerUserId,
        shadowType: VISUAL_RANKING_SHADOW_TYPE,
        sourceVersion: shadow.sourceVersion,
        payloadJson: shadow as unknown as Prisma.InputJsonValue,
      },
      update: {
        userId: viewerUserId,
        payloadJson: shadow as unknown as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });
    return { persisted: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { persisted: false, reason: "persist_error", message };
  }
}
