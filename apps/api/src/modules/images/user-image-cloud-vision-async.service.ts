/**
 * P7.5-r7-c2: schedule cloud vision async after upload (non-blocking).
 */

import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@peima/database";
import { PrismaService } from "../../common/prisma/prisma.service";
import { OnboardingVisionService } from "../onboarding/vision/onboarding-vision.service";
import { shouldScheduleCloudVisionAsyncJob } from "../onboarding/vision/onboarding-vision-upload-persist";
import { runUserImageCloudVisionAsyncJob } from "../onboarding/vision/user-image-cloud-vision-async-job";
import type { CloudVisionImageRef } from "../onboarding/vision/cloud-vision.types";

export type ScheduleCloudVisionAfterUploadParams = {
  userImageId: string;
  userId: string;
  detectionScoreJson: unknown;
  imageBuffer: Buffer;
  mimeType: string;
};

@Injectable()
export class UserImageCloudVisionAsyncService {
  private readonly logger = new Logger(UserImageCloudVisionAsyncService.name);
  private inFlight = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly onboardingVision: OnboardingVisionService,
  ) {}

  /**
   * Fire-and-forget after UserImage row exists. Does not block the upload response.
   */
  scheduleAfterUpload(params: ScheduleCloudVisionAfterUploadParams): void {
    const env = this.onboardingVision.readEnv();
    if (
      !shouldScheduleCloudVisionAsyncJob(env, {
        imageId: params.userImageId,
        userId: params.userId,
      })
    ) {
      return;
    }

    const imageRef: CloudVisionImageRef = {
      kind: "bytes",
      mimeType: params.mimeType,
      buffer: params.imageBuffer,
    };

    setImmediate(() => {
      this.withConcurrencyLimit(() =>
        this.executeJob({
          userImageId: params.userImageId,
          userId: params.userId,
          detectionScoreJson: params.detectionScoreJson,
          imageRef,
        }),
      );
    });
  }

  private async executeJob(params: {
    userImageId: string;
    userId: string;
    detectionScoreJson: unknown;
    imageRef: CloudVisionImageRef;
  }): Promise<void> {
    const env = this.onboardingVision.readEnv();
    const result = await runUserImageCloudVisionAsyncJob(
      {
        userImageId: params.userImageId,
        userId: params.userId,
        detectionScoreJson: params.detectionScoreJson,
        imageRef: params.imageRef,
      },
      { env },
    );

    if (!result.scheduled) {
      return;
    }

    try {
      const existing = await this.prisma.userImage.findUnique({
        where: { id: params.userImageId },
        select: { id: true },
      });
      if (!existing) {
        return;
      }

      await this.prisma.userImage.update({
        where: { id: params.userImageId },
        data: {
          detectionScoreJson:
            result.mergedDetectionScoreJson as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      this.logger.warn(
        `cloud vision async merge failed userImageId=${params.userImageId}`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  private withConcurrencyLimit(task: () => Promise<void>): void {
    const max = Math.max(
      1,
      this.onboardingVision.readEnv().cloudMaxConcurrency,
    );
    if (this.inFlight < max) {
      this.inFlight += 1;
      void task().finally(() => this.releaseSlot());
      return;
    }
    this.waiters.push(() => {
      this.inFlight += 1;
      void task().finally(() => this.releaseSlot());
    });
  }

  private releaseSlot(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
    const next = this.waiters.shift();
    if (next) {
      next();
    }
  }
}
