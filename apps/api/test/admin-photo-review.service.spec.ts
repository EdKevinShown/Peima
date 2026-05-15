import { ConflictException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AuditService } from "../src/common/audit/audit.service";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { PHOTO_REVIEW_AUDIT_ACTION } from "../src/modules/admin-photo-review/admin-photo-review-audit";
import { AdminPhotoReviewService } from "../src/modules/admin-photo-review/admin-photo-review.service";

function makeRow(overrides: Record<string, unknown> = {}) {
  const createdAt = new Date("2026-05-15T10:00:00.000Z");
  return {
    id: "img-1",
    userId: "user-1",
    imageUrl: "https://example.com/a.jpg",
    detectionStatus: "skipped",
    detectionReasonCodes: [] as string[],
    detectionScoreJson: {
      quality: { meanLuma: 100, laplacianVariance: 50, width: 800, height: 600 },
      face: { faceCount: 1, faces: [] },
      warnings: ["MULTIPLE_FACES"],
      pipeline: ["quality", "face"],
    },
    detectionRulesVersion: "p7.4-r1c-v1",
    detectedAt: createdAt,
    reviewStatus: "pending_review",
    reviewReasonCodes: ["DETECTION_SKIPPED_REVIEW"],
    reviewedAt: null,
    reviewedByUserId: null,
    reviewNote: "ops internal",
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

describe("AdminPhotoReviewService", () => {
  let service: AdminPhotoReviewService;
  let findMany: jest.Mock;
  let findUnique: jest.Mock;
  let updateMany: jest.Mock;
  let recordAction: jest.Mock;

  function auditBeforeRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "img-1",
      userId: "user-1",
      updatedAt: new Date("2026-05-15T10:00:00.000Z"),
      reviewStatus: "pending_review",
      reviewReasonCodes: ["DETECTION_SKIPPED_REVIEW"],
      reviewedAt: null,
      reviewedByUserId: null,
      reviewNote: null,
      detectionStatus: "skipped",
      detectionReasonCodes: [] as string[],
      detectionRulesVersion: "p7.4-r1c-v1",
      detectionScoreJson: { warnings: [] },
      ...overrides,
    };
  }

  beforeEach(async () => {
    findMany = jest.fn();
    findUnique = jest.fn();
    updateMany = jest.fn();
    recordAction = jest.fn().mockResolvedValue({ id: "audit-1" });
    const mod = await Test.createTestingModule({
      providers: [
        AdminPhotoReviewService,
        {
          provide: PrismaService,
          useValue: {
            userImage: { findMany, findUnique, updateMany },
          },
        },
        { provide: AuditService, useValue: { recordAction } },
      ],
    }).compile();
    service = mod.get(AdminPhotoReviewService);
  });

  it("lists pending_review by default", async () => {
    findMany.mockResolvedValue([makeRow()]);
    const res = await service.listItems({});
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ reviewStatus: "pending_review" }),
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 21,
      }),
    );
    expect(res.items).toHaveLength(1);
    expect(res.items[0].reviewStatus).toBe("pending_review");
  });

  it("filters by reviewStatus when provided", async () => {
    findMany.mockResolvedValue([]);
    await service.listItems({ reviewStatus: "approved" });
    expect(findMany.mock.calls[0][0].where.reviewStatus).toBe("approved");
  });

  it("filters by detectionStatus when provided", async () => {
    findMany.mockResolvedValue([]);
    await service.listItems({ detectionStatus: "failed" });
    expect(findMany.mock.calls[0][0].where.detectionStatus).toBe("failed");
  });

  it("filters by reasonCode on detection or review codes", async () => {
    findMany.mockResolvedValue([]);
    await service.listItems({ reasonCode: "FACE_NOT_FOUND" });
    expect(findMany.mock.calls[0][0].where.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          OR: [
            { detectionReasonCodes: { has: "FACE_NOT_FOUND" } },
            { reviewReasonCodes: { has: "FACE_NOT_FOUND" } },
          ],
        }),
      ]),
    );
  });

  it("returns detectionSummary without full detectionScoreJson on list", async () => {
    findMany.mockResolvedValue([makeRow()]);
    const res = await service.listItems({});
    expect(res.items[0].detectionSummary).toEqual(
      expect.objectContaining({
        faceCount: 1,
        warnings: ["MULTIPLE_FACES"],
        quality: expect.objectContaining({ meanLuma: 100 }),
      }),
    );
    expect("detectionScoreJson" in res.items[0]).toBe(false);
  });

  it("detail returns full detectionScoreJson and reviewNote", async () => {
    const row = makeRow();
    findUnique.mockResolvedValue({
      ...row,
      user: { id: "user-1", nickname: "Alice" },
    });
    const res = await service.getItemDetail("img-1");
    expect(res.detectionScoreJson).toEqual(row.detectionScoreJson);
    expect(res.reviewNote).toBe("ops internal");
    expect(res.user).toEqual({ userId: "user-1", nickname: "Alice" });
    expect("email" in res.user).toBe(false);
    expect("phone" in res.user).toBe(false);
  });

  it("detail throws 404 when image missing", async () => {
    findUnique.mockResolvedValue(null);
    await expect(service.getItemDetail("missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("filters hasWarnings=true in memory after DB fetch", async () => {
    findMany.mockResolvedValue([
      makeRow({ id: "a", detectionScoreJson: { warnings: ["MULTIPLE_FACES"] } }),
      makeRow({ id: "b", detectionScoreJson: { warnings: [] } }),
    ]);
    const res = await service.listItems({ hasWarnings: true, limit: 10 });
    expect(res.items).toHaveLength(1);
    expect(res.items[0].imageId).toBe("a");
    expect(findMany.mock.calls[0][0].take).toBe(50);
  });

  describe("write actions", () => {
    const updatedAt = new Date("2026-05-15T10:00:00.000Z");

    beforeEach(() => {
      findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === "missing") {
          return Promise.resolve(null);
        }
        const base = makeRow({ updatedAt });
        if (where.id && "reviewStatus" in ({} as object)) {
          return base;
        }
        return Promise.resolve({
          ...base,
          user: { id: "user-1", nickname: "Alice" },
        });
      });
    });

    it("approve writes approved and reviewedByUserId from actor", async () => {
      findUnique
        .mockResolvedValueOnce(auditBeforeRow({ updatedAt }))
        .mockResolvedValueOnce({
          ...makeRow({
            reviewStatus: "approved",
            reviewReasonCodes: [],
            reviewedAt: new Date("2026-05-15T12:00:00.000Z"),
            reviewedByUserId: "admin-1",
            reviewNote: "looks good",
          }),
          user: { id: "user-1", nickname: "Alice" },
        });
      updateMany.mockResolvedValue({ count: 1 });

      const res = await service.approveItem("img-1", "admin-1", {
        note: "looks good",
      });
      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: "img-1",
            updatedAt,
            reviewStatus: { in: expect.arrayContaining(["pending_review"]) },
          }),
          data: expect.objectContaining({
            reviewStatus: "approved",
            reviewReasonCodes: [],
            reviewNote: "looks good",
            reviewedByUserId: "admin-1",
          }),
        }),
      );
      expect(res.reviewStatus).toBe("approved");
      expect(res.reviewReasonCodes).toEqual([]);
      expect(res.reviewedByUserId).toBe("admin-1");
      expect(res.reviewNote).toBe("looks good");
      expect(res.reviewedAt).toBeTruthy();
      expect(recordAction).toHaveBeenCalledWith(
        "admin-1",
        PHOTO_REVIEW_AUDIT_ACTION.APPROVE,
        "USER_IMAGE",
        expect.objectContaining({
          entityId: "img-1",
          oldValues: expect.objectContaining({
            reviewStatus: "pending_review",
          }),
          newValues: expect.objectContaining({
            reviewStatus: "approved",
            reviewReasonCodes: [],
            reviewNote: "looks good",
            meta: expect.objectContaining({
              userId: "user-1",
              notePresent: true,
              requestReasonCodes: [],
            }),
          }),
        }),
      );
    });

    it("reject writes rejected with reason codes", async () => {
      findUnique
        .mockResolvedValueOnce(auditBeforeRow({ updatedAt }))
        .mockResolvedValueOnce({
          ...makeRow({
            reviewStatus: "rejected",
            reviewReasonCodes: ["MANUAL_REJECTED"],
            reviewedByUserId: "admin-2",
          }),
          user: { id: "user-1", nickname: "Alice" },
        });
      updateMany.mockResolvedValue({ count: 1 });

      const res = await service.rejectItem("img-1", "admin-2", {
        reasonCodes: ["MANUAL_REJECTED"],
        note: "no",
      });
      expect(updateMany.mock.calls[0][0].data.reviewStatus).toBe("rejected");
      expect(updateMany.mock.calls[0][0].data.reviewReasonCodes).toEqual([
        "MANUAL_REJECTED",
      ]);
      expect(res.reviewStatus).toBe("rejected");
      expect(recordAction).toHaveBeenCalledWith(
        "admin-2",
        PHOTO_REVIEW_AUDIT_ACTION.REJECT,
        "USER_IMAGE",
        expect.objectContaining({
          newValues: expect.objectContaining({
            reviewStatus: "rejected",
            reviewReasonCodes: ["MANUAL_REJECTED"],
            reviewNote: "no",
            meta: expect.objectContaining({
              requestReasonCodes: ["MANUAL_REJECTED"],
            }),
          }),
        }),
      );
    });

    it("needs-reupload writes needs_reupload", async () => {
      findUnique
        .mockResolvedValueOnce(
          auditBeforeRow({ updatedAt, reviewStatus: "approved" }),
        )
        .mockResolvedValueOnce({
          ...makeRow({
            reviewStatus: "needs_reupload",
            reviewReasonCodes: ["NEEDS_REUPLOAD", "FACE_NOT_CLEAR"],
          }),
          user: { id: "user-1", nickname: "Alice" },
        });
      updateMany.mockResolvedValue({ count: 1 });

      const res = await service.needsReuploadItem("img-1", "admin-1", {
        reasonCodes: ["NEEDS_REUPLOAD", "FACE_NOT_CLEAR"],
      });
      expect(res.reviewStatus).toBe("needs_reupload");
      expect(res.reviewReasonCodes).toEqual([
        "NEEDS_REUPLOAD",
        "FACE_NOT_CLEAR",
      ]);
      expect(recordAction).toHaveBeenCalledWith(
        "admin-1",
        PHOTO_REVIEW_AUDIT_ACTION.NEEDS_REUPLOAD,
        "USER_IMAGE",
        expect.objectContaining({
          newValues: expect.objectContaining({
            reviewStatus: "needs_reupload",
          }),
        }),
      );
    });

    it("approve throws 404 when image missing", async () => {
      findUnique.mockResolvedValue(null);
      await expect(
        service.approveItem("missing", "admin-1", {}),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(recordAction).not.toHaveBeenCalled();
    });

    it("throws 409 when optimistic update fails", async () => {
      findUnique
        .mockResolvedValueOnce(auditBeforeRow({ updatedAt }))
        .mockResolvedValueOnce({ reviewStatus: "appealed" });
      updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.approveItem("img-1", "admin-1", {}),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(recordAction).not.toHaveBeenCalled();
    });

    it("still returns success when audit write fails", async () => {
      recordAction.mockResolvedValue(null);
      findUnique
        .mockResolvedValueOnce(auditBeforeRow({ updatedAt }))
        .mockResolvedValueOnce({
          ...makeRow({ reviewStatus: "approved", reviewedByUserId: "admin-1" }),
          user: { id: "user-1", nickname: "Alice" },
        });
      updateMany.mockResolvedValue({ count: 1 });

      const res = await service.approveItem("img-1", "admin-1", { note: "ok" });
      expect(res.reviewStatus).toBe("approved");
      expect(updateMany).toHaveBeenCalled();
      expect(recordAction).toHaveBeenCalled();
    });

    it("does not pass reviewedByUserId from body (actor only)", async () => {
      findUnique
        .mockResolvedValueOnce(auditBeforeRow({ updatedAt }))
        .mockResolvedValueOnce({
          ...makeRow({ reviewedByUserId: "admin-real" }),
          user: { id: "user-1", nickname: "Alice" },
        });
      updateMany.mockResolvedValue({ count: 1 });

      await service.approveItem("img-1", "admin-real", { note: "x" });
      expect(updateMany.mock.calls[0][0].data.reviewedByUserId).toBe(
        "admin-real",
      );
    });
  });

  it("encodes nextCursor when more rows exist", async () => {
    const r1 = makeRow({ id: "a" });
    const r2 = makeRow({
      id: "b",
      createdAt: new Date("2026-05-15T11:00:00.000Z"),
    });
    findMany.mockResolvedValue([r1, r2]);
    const res = await service.listItems({ limit: 1 });
    expect(res.items).toHaveLength(1);
    expect(res.nextCursor).toBe(
      `${r1.createdAt.toISOString()}|${r1.id}`,
    );
  });
});
