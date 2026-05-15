import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ACCOUNT_STYLE_TAG_WHITELIST,
  ONBOARDING_PHOTO_STYLE_TAG_POOL_SET,
} from "@peima/shared/constants";
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

const MAX_ONBOARDING_STYLE_SELECTION = 8;
/** Align with `CreateOrUpdatePreferenceDto` styleTags cap. */
const MAX_USER_PREFERENCE_STYLE_TAGS = 24;

const ACCOUNT_STYLE_WHITELIST_SET = new Set<string>(
  ACCOUNT_STYLE_TAG_WHITELIST as readonly string[],
);

function normalizeDedupLimited(raw: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const s = String(t ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function validateOnboardingIncomingStyleTags(raw: string[]): string[] {
  const normalized = normalizeDedupLimited(
    raw,
    MAX_ONBOARDING_STYLE_SELECTION,
  );
  if (normalized.length === 0) {
    throw new BadRequestException(
      "styleTags must contain at least one non-empty tag",
    );
  }
  for (const t of normalized) {
    if (!ONBOARDING_PHOTO_STYLE_TAG_POOL_SET.has(t)) {
      throw new BadRequestException(
        `styleTags must use onboarding photo-style tags only: invalid ${t}`,
      );
    }
    if (!ACCOUNT_STYLE_WHITELIST_SET.has(t)) {
      throw new BadRequestException(
        `styleTags contains value not in preference whitelist: ${t}`,
      );
    }
  }
  return normalized;
}

/**
 * Replace only the onboarding「整体气质 + 照片感觉」subset; keep account-only tags
 * (e.g. 都市精致) so `/account` and onboarding share one `UserPreference.styleTags`.
 */
function mergeOnboardingStyleTagsIntoPreference(
  existing: string[] | undefined,
  onboardingTags: string[],
): string[] {
  const preserved = (existing ?? []).filter((t) => {
    const s = String(t ?? "").trim();
    return (
      s.length > 0 &&
      ACCOUNT_STYLE_WHITELIST_SET.has(s) &&
      !ONBOARDING_PHOTO_STYLE_TAG_POOL_SET.has(s)
    );
  });
  let space = MAX_USER_PREFERENCE_STYLE_TAGS - onboardingTags.length;
  if (space < 0) space = 0;
  const keptPreserved = preserved.slice(0, space);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of keptPreserved) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  for (const t of onboardingTags) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
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
   * Upsert `UserPreference.styleTags`: replace only onboarding「整体气质 + 照片感觉」子集，
   * 保留账户页独有的扩展风格标签（不在 onboarding 12 项池内者，如「都市精致」）；并设置 `onboardingPhotoAestheticCompletedAt`.
   * 不触碰 `onboardingPhotoPreviewCompletedAt`。
   */
  async savePhotoPreferences(
    userId: string,
    styleTags: string[],
  ): Promise<{ styleTags: string[] }> {
    await this.ensureUserExists(userId);

    const incoming = validateOnboardingIncomingStyleTags(styleTags);

    const now = new Date();

    const existing = await this.prisma.userPreference.findUnique({
      where: { userId },
    });

    const merged = mergeOnboardingStyleTagsIntoPreference(
      existing?.styleTags,
      incoming,
    );

    let savedTags: string[];

    if (existing) {
      const updated = await this.prisma.userPreference.update({
        where: { userId },
        data: { styleTags: merged },
        select: { styleTags: true },
      });
      savedTags = updated.styleTags;
    } else {
      const created = await this.prisma.userPreference.create({
        data: {
          user: { connect: { id: userId } },
          styleTags: merged,
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
