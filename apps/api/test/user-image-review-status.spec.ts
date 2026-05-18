import {
  mergeQualityAndFaceDetection,
  USER_IMAGE_DETECTION_RULES_VERSION_R1C,
} from "../src/modules/images/user-image-quality-detection";
import {
  resolveUserImageReviewStateFromDetection,
  USER_IMAGE_REVIEW_REASON_CODE,
  USER_IMAGE_REVIEW_STATUS,
} from "../src/modules/images/user-image-review-status";
import { toUserImagePublicDto } from "../src/modules/images/user-image-public.dto";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { OnboardingService } from "../src/modules/onboarding/onboarding.service";
import { ImagesService } from "../src/modules/images/images.service";
import { UserImageDetectionService } from "../src/modules/images/user-image-detection.service";
import { UserImageVisionSidecarService } from "../src/modules/images/user-image-vision-sidecar.service";
import { UserImageCloudVisionAsyncService } from "../src/modules/images/user-image-cloud-vision-async.service";

describe("user-image-review-status (P7.4-r1d-b)", () => {
  describe("resolveUserImageReviewStateFromDetection", () => {
    it("skipped → pending_review + DETECTION_SKIPPED_REVIEW", () => {
      const r = resolveUserImageReviewStateFromDetection({
        detectionStatus: "skipped",
      });
      expect(r.reviewStatus).toBe(USER_IMAGE_REVIEW_STATUS.PENDING_REVIEW);
      expect(r.reviewReasonCodes).toEqual([
        USER_IMAGE_REVIEW_REASON_CODE.DETECTION_SKIPPED_REVIEW,
      ]);
    });

    it("passed → not_required", () => {
      const r = resolveUserImageReviewStateFromDetection({
        detectionStatus: "passed",
        detectionScoreJson: { warnings: ["MULTIPLE_FACES"], pipeline: ["quality", "face"] },
      });
      expect(r.reviewStatus).toBe(USER_IMAGE_REVIEW_STATUS.NOT_REQUIRED);
      expect(r.reviewReasonCodes).toEqual([]);
    });

    it("failed + FACE_NOT_FOUND → not_required", () => {
      const r = resolveUserImageReviewStateFromDetection({
        detectionStatus: "failed",
        detectionReasonCodes: ["FACE_NOT_FOUND"],
      });
      expect(r.reviewStatus).toBe(USER_IMAGE_REVIEW_STATUS.NOT_REQUIRED);
      expect(r.reviewReasonCodes).toEqual([]);
    });

    it("failed + TOO_DARK → not_required", () => {
      const r = resolveUserImageReviewStateFromDetection({
        detectionStatus: "failed",
        detectionReasonCodes: ["TOO_DARK"],
      });
      expect(r).toEqual({
        reviewStatus: USER_IMAGE_REVIEW_STATUS.NOT_REQUIRED,
        reviewReasonCodes: [],
      });
    });
  });

  describe("mergeQualityAndFaceDetection + review (integration)", () => {
    const baseMetrics = {
      width: 800,
      height: 600,
      sampleWidth: 320,
      sampleHeight: 240,
      meanLuma: 120,
      laplacianVariance: 80,
    };

    it("passed + MULTIPLE_FACES does not imply review codes", () => {
      const det = mergeQualityAndFaceDetection({
        metrics: baseMetrics,
        faceCount: 2,
        faces: [
          { score: 0.5, box: { x: 0, y: 0, width: 40, height: 40 } },
          { score: 0.95, box: { x: 280, y: 180, width: 220, height: 240 } },
        ],
        faceDetectionEnabled: true,
      });
      const review = resolveUserImageReviewStateFromDetection({
        detectionStatus: det.status,
        detectionReasonCodes: det.reasonCodes,
        detectionScoreJson: det.scoreJson,
      });
      expect(det.status).toBe("passed");
      expect(det.scoreJson?.warnings).toContain("MULTIPLE_FACES");
      expect(review.reviewStatus).toBe(USER_IMAGE_REVIEW_STATUS.NOT_REQUIRED);
      expect(review.reviewReasonCodes).not.toContain(
        USER_IMAGE_REVIEW_REASON_CODE.MULTIPLE_FACES_REVIEW,
      );
      expect(det.rulesVersion).toBe(USER_IMAGE_DETECTION_RULES_VERSION_R1C);
    });
  });

  describe("toUserImagePublicDto", () => {
    it("strips reviewNote from public payload", () => {
      const dto = toUserImagePublicDto({
        id: "img1",
        userId: "u1",
        imageUrl: "http://x/a.jpg",
        faceEmbedding: null,
        attractivenessScore: null,
        styleTags: [],
        ageEstimate: null,
        genderEstimate: null,
        confidence: null,
        detectionStatus: "passed",
        detectionReasonCodes: [],
        detectionScoreJson: null,
        detectionRulesVersion: "p7.4-r1c-v1",
        detectedAt: new Date(),
        reviewStatus: "not_required",
        reviewReasonCodes: [],
        reviewedAt: null,
        reviewedByUserId: null,
        reviewNote: "internal ops note",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      expect(dto.reviewStatus).toBe("not_required");
      expect("reviewNote" in dto).toBe(false);
    });
  });
});

describe("OnboardingService review fields (P7.4-r1d-b)", () => {
  async function createService(prisma: Record<string, unknown>) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    return moduleRef.get(OnboardingService);
  }

  it("skipped detection still passes onboarding; pending_review is informational", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          onboardingPhotoAestheticCompletedAt: null,
          onboardingPhotoPreviewCompletedAt: null,
        }),
      },
      userImage: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "img-1",
            detectionStatus: "skipped",
            reviewStatus: "pending_review",
            reviewReasonCodes: ["DETECTION_SKIPPED_REVIEW"],
            createdAt: new Date("2026-05-15T10:00:00.000Z"),
          },
        ]),
      },
    };
    const svc = await createService(prisma);
    await expect(svc.getPhotoStatus("u1")).resolves.toMatchObject({
      hasPassingPhoto: true,
      nextStep: "photo_preference",
      hasPhotoUnderReview: true,
      photoReviewStatusSummary: "pending_review",
      hasBlockedPhoto: false,
      photoGateMessageKey: null,
    });
  });
});

describe("ImagesService review on create (P7.4-r1d-b)", () => {
  it("createFromUpload persists review fields from detection", async () => {
    const create = jest.fn().mockResolvedValue({
      id: "img1",
      userId: "u1",
      imageUrl: "http://x/a.jpg",
      detectionStatus: "skipped",
      reviewStatus: "pending_review",
      reviewReasonCodes: ["DETECTION_SKIPPED_REVIEW"],
      reviewNote: null,
    });
    const detect = jest.fn().mockResolvedValue({
      status: "skipped",
      reasonCodes: [],
      scoreJson: { pipeline: ["quality"], faceDetectionEnabled: true },
      rulesVersion: "p7.4-r1b-v1",
    });
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: "u1" }) },
      userImage: { create },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ImagesService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: UserImageDetectionService,
          useValue: { detectFromBuffer: detect },
        },
        {
          provide: UserImageVisionSidecarService,
          useValue: {
            applyToDetectionScoreJson: (json: unknown) => json,
            applyToDetectionScoreJsonForUpload: (json: unknown) => json,
          },
        },
        {
          provide: UserImageCloudVisionAsyncService,
          useValue: { scheduleAfterUpload: jest.fn() },
        },
      ],
    }).compile();
    const svc = moduleRef.get(ImagesService);
    const row = await svc.createFromUpload(
      "u1",
      {
        mimetype: "image/jpeg",
        buffer: Buffer.from("fake"),
      } as never,
      "http://localhost:3000",
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          detectionStatus: "skipped",
          reviewStatus: "pending_review",
          reviewReasonCodes: ["DETECTION_SKIPPED_REVIEW"],
        }),
      }),
    );
    expect(row.reviewStatus).toBe("pending_review");
    expect("reviewNote" in row).toBe(false);
  });
});
