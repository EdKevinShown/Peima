import { Test } from "@nestjs/testing";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { PreviewPoolGeneratorService } from "../src/modules/preview-pool/preview-pool-generator.service";

describe("PreviewPoolGeneratorService", () => {
  let service: PreviewPoolGeneratorService;
  let prisma: {
    user: { findUnique: jest.Mock; findMany: jest.Mock; upsert: jest.Mock };
    userProfile: { upsert: jest.Mock };
    userImage: { findFirst: jest.Mock; create: jest.Mock };
    previewPool: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      create: jest.Mock;
    };
    previewPoolItem: { createMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: "viewer" }),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
      },
      userProfile: { upsert: jest.fn().mockResolvedValue({}) },
      userImage: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      previewPool: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: "pool-1" }),
      },
      previewPoolItem: { createMany: jest.fn().mockResolvedValue({ count: 6 }) },
      $transaction: jest.fn(async (fn: (tx: typeof prisma) => Promise<string>) =>
        fn(prisma),
      ),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PreviewPoolGeneratorService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(PreviewPoolGeneratorService);

    let synth = 0;
    prisma.user.upsert.mockImplementation(async () => {
      synth += 1;
      return { id: `synth-${synth}` };
    });
  });

  it("skips create when an active pool already exists", async () => {
    prisma.previewPool.findFirst.mockResolvedValue({
      id: "existing",
      items: [{ id: "i1" }],
    });

    const result = await service.ensureActivePool("viewer", {
      source: "auto_ensure",
    });

    expect(result).toEqual({ created: false, poolId: "existing" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("creates a pool with synthetic fallback when none exists", async () => {
    const result = await service.ensureActivePool("viewer", {
      source: "auto_ensure",
      allowSyntheticFallback: true,
    });

    expect(result.created).toBe(true);
    expect(result.poolId).toBe("pool-1");
    expect(prisma.previewPoolItem.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ rankInPool: 1 }),
          expect.objectContaining({ rankInPool: 6 }),
        ]),
      }),
    );
  });
});
