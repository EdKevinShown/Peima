/**
 * Beta / dev: synthetic opposite-gender candidates for onboarding photo preview pool.
 */
import type { PrismaClient, User, UserImage } from "@peima/database";
import { previewPoolRowDisplaySourceKey } from "./onboarding-photo-preview-display-image-key";
import type { ShadowCandidateInput } from "./vision/visual-ranking-shadow-scoring";
import {
  extractUsableVisionFromDetectionScoreJson,
} from "./vision/visual-ranking-shadow-vision-input";
import type { PreviewGenderNorm } from "./onboarding-preview-gender";
import { resolveOppositeGenderForPreview } from "./onboarding-preview-gender";

function onboardingSynthPhone(viewerUserId: string, n: number): string {
  return `onb-preview-${viewerUserId.slice(-10)}-${n}@peima.local`;
}

function synthCandidateGender(
  viewerBinary: PreviewGenderNorm | "male" | "female" | null,
  n: number,
): string {
  const opposite = resolveOppositeGenderForPreview(
    viewerBinary === "male" || viewerBinary === "female" ? viewerBinary : "unknown",
  );
  if (opposite) return opposite;
  return n % 2 === 0 ? "female" : "male";
}

function userToShadowCandidate(
  user: User,
  firstImage: UserImage | null,
): ShadowCandidateInput {
  const vision = firstImage
    ? extractUsableVisionFromDetectionScoreJson(
        firstImage.detectionScoreJson,
        firstImage.reviewStatus,
      )
    : null;
  return {
    userId: user.id,
    createdAt: user.createdAt,
    displaySourceKey: previewPoolRowDisplaySourceKey({
      id: user.id,
      firstImageUrl: firstImage?.imageUrl ?? null,
    }),
    styleTags: firstImage?.styleTags ?? [],
    vision,
    preferenceFields: {
      age: user.age,
      city: user.city,
      height: user.height,
      education: user.education,
      occupation: user.occupation,
      relationshipGoal: user.relationshipGoal,
    },
  };
}

export async function ensureOnboardingSyntheticCandidate(
  prisma: PrismaClient,
  viewerUserId: string,
  viewerBinary: "male" | "female" | null,
  n: number,
): Promise<ShadowCandidateInput> {
  const phone = onboardingSynthPhone(viewerUserId, n);
  const gender = synthCandidateGender(viewerBinary, n);

  const user = await prisma.user.upsert({
    where: { phone },
    create: {
      phone,
      nickname: `预览候选 ${n}`,
      gender,
      age: 24 + n,
      city: n % 2 === 0 ? "上海" : "北京",
      height: 165 + n,
      education: "本科",
      occupation: "产品",
      relationshipGoal: "认真恋爱",
      bio: "Auto-generated onboarding preview candidate.",
    },
    update: { gender },
  });

  await prisma.userProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      socialEnergy: 0.45 + n * 0.04,
      emotionalExpression: 0.5,
      relationshipPace: 0.45,
      initiativeLevel: 0.5,
      decisionOrientation: 0.5,
      conflictResponse: 0.5,
      confidence: 0.8,
    },
    update: {},
  });

  let firstImage = await prisma.userImage.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });
  if (!firstImage) {
    firstImage = await prisma.userImage.create({
      data: {
        userId: user.id,
        imageUrl: `https://example.com/peima-onb-preview-${n}.jpg`,
        attractivenessScore: 0.65 + n * 0.02,
        styleTags: ["清爽自然", "生活感"],
        detectionStatus: "skipped",
        reviewStatus: "not_required",
      },
    });
  }

  return userToShadowCandidate(user, firstImage);
}
