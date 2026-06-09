import { Test } from "@nestjs/testing";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { getQuestionKeys } from "../src/modules/questionnaire/data/questions";
import { QuestionnaireService } from "../src/modules/questionnaire/questionnaire.service";

describe("QuestionnaireService.submit — gender sync", () => {
  it("updates User.gender when gender is provided", async () => {
    const upsertResult = {
      userId: "u-gender-sync",
      confidence: 1,
    } as Record<string, unknown>;

    const tx = {
      questionnaireAnswer: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 30 }),
      },
      userProfile: {
        upsert: jest.fn().mockResolvedValue(upsertResult),
      },
      user: {
        update: jest.fn().mockResolvedValue({ id: "u-gender-sync", gender: "female" }),
      },
    };

    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: "u-gender-sync" }),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    } as unknown as PrismaService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        QuestionnaireService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    const service = moduleRef.get(QuestionnaireService);
    const answers = getQuestionKeys().map((questionKey) => ({
      questionKey,
      answerValue: "A" as const,
    }));

    const res = await service.submit({
      userId: "u-gender-sync",
      gender: "female",
      answers,
    });

    expect(res.answersSaved).toBe(30);
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "u-gender-sync" },
      data: { gender: "female" },
    });
  });

  it("does not touch User.gender when gender is omitted (legacy clients)", async () => {
    const upsertResult = {
      userId: "u-gender-legacy",
      confidence: 1,
    } as Record<string, unknown>;

    const tx = {
      questionnaireAnswer: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 30 }),
      },
      userProfile: {
        upsert: jest.fn().mockResolvedValue(upsertResult),
      },
      user: {
        update: jest.fn(),
      },
    };

    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: "u-gender-legacy" }),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    } as unknown as PrismaService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        QuestionnaireService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    const service = moduleRef.get(QuestionnaireService);
    const answers = getQuestionKeys().map((questionKey) => ({
      questionKey,
      answerValue: "A" as const,
    }));

    await service.submit({ userId: "u-gender-legacy", answers });
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});
