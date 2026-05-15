import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { computeOnboardingPhotoGateFromImages } from "./onboarding-photo-passing";
import type {
  BlockingPhotoReviewStatus,
  PhotoGateMessageKey,
  PhotoReviewStatusSummary,
} from "./onboarding-photo-passing";

export type OnboardingPhotoNextStep =
  | "photo_upload"
  | "photo_preference"
  | "photo_preview"
  | "questionnaire";

export type OnboardingPhotoStatusPayload = {
  hasPhoto: boolean;
  /** At least one image passing per P7.4-r1d-e2 (detection + review). */
  hasPassingPhoto: boolean;
  hasPhotoPreference: boolean;
  nextStep: OnboardingPhotoNextStep;
  hasPhotoUnderReview: boolean;
  photoReviewStatusSummary: PhotoReviewStatusSummary;
  hasBlockedPhoto: boolean;
  blockingPhotoReviewStatus: BlockingPhotoReviewStatus | null;
  photoGateMessageKey: PhotoGateMessageKey | null;
  photoGateReasonCodes: string[];
  passingPhotoCount: number;
  blockedPhotoId: string | null;
  passingPhotoId: string | null;
};

const MAX_STYLE_TAGS = 8;

function normalizeStyleTags(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const s = String(t ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= MAX_STYLE_TAGS) break;
  }
  return out;
}

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
  }

  async getPhotoStatus(userId: string): Promise<OnboardingPhotoStatusPayload> {
    await this.ensureUserExists(userId);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        onboardingPhotoAestheticCompletedAt: true,
        onboardingPhotoPreviewCompletedAt: true,
      },
    });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    const images = await this.prisma.userImage.findMany({
      where: { userId },
      select: {
        id: true,
        detectionStatus: true,
        reviewStatus: true,
        reviewReasonCodes: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const hasPhoto = images.length > 0;
    const gate = computeOnboardingPhotoGateFromImages(images);

    const aestheticDone = user.onboardingPhotoAestheticCompletedAt != null;
    const previewAck = user.onboardingPhotoPreviewCompletedAt != null;

    let nextStep: OnboardingPhotoNextStep;
    if (!gate.hasPassingPhoto) {
      nextStep = "photo_upload";
    } else if (!aestheticDone) {
      nextStep = "photo_preference";
    } else if (!previewAck) {
      nextStep = "photo_preview";
    } else {
      nextStep = "questionnaire";
    }

    return {
      hasPhoto,
      hasPassingPhoto: gate.hasPassingPhoto,
      hasPhotoPreference: aestheticDone,
      nextStep,
      hasPhotoUnderReview: gate.hasPhotoUnderReview,
      photoReviewStatusSummary: gate.photoReviewStatusSummary,
      hasBlockedPhoto: gate.hasBlockedPhoto,
      blockingPhotoReviewStatus: gate.blockingPhotoReviewStatus,
      photoGateMessageKey: gate.photoGateMessageKey,
      photoGateReasonCodes: gate.photoGateReasonCodes,
      passingPhotoCount: gate.passingPhotoCount,
      blockedPhotoId: gate.blockedPhotoId,
      passingPhotoId: gate.passingPhotoId,
    };
  }

  async getPhotoPreferencesMe(userId: string): Promise<{ styleTags: string[] }> {
    await this.ensureUserExists(userId);
    const pref = await this.prisma.userPreference.findUnique({
      where: { userId },
    });
    const styleTags =
      pref?.styleTags
        ?.map((t) => String(t ?? "").trim())
        .filter((t) => t.length > 0) ?? [];
    return { styleTags };
  }

  /**
   * Upsert `UserPreference.styleTags` and set `onboardingPhotoAestheticCompletedAt`.
   * Does not touch `onboardingPhotoPreviewCompletedAt`.
   */
  async savePhotoPreferences(
    userId: string,
    styleTags: string[],
  ): Promise<{ styleTags: string[] }> {
    await this.ensureUserExists(userId);

    const normalized = normalizeStyleTags(styleTags);
    if (normalized.length === 0) {
      throw new BadRequestException("styleTags must contain at least one non-empty tag");
    }

    const now = new Date();

    const existing = await this.prisma.userPreference.findUnique({
      where: { userId },
    });

    let savedTags: string[];

    if (existing) {
      const updated = await this.prisma.userPreference.update({
        where: { userId },
        data: { styleTags: normalized },
        select: { styleTags: true },
      });
      savedTags = updated.styleTags;
    } else {
      const created = await this.prisma.userPreference.create({
        data: {
          user: { connect: { id: userId } },
          styleTags: normalized,
        },
        select: { styleTags: true },
      });
      savedTags = created.styleTags;
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { onboardingPhotoAestheticCompletedAt: now },
    });

    return { styleTags: savedTags };
  }
}

export { isUserImagePassingForOnboarding } from "./onboarding-photo-passing";
